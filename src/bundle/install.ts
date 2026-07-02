import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { BundleManifest } from "../sidecar/bundle.js";

export interface InstallBundleOptions {
  bundleRoot: string;
  sourceDir: string;
  /** Number of old bundles to keep after install (default 3). */
  retain?: number;
}

export interface InstallBundleResult {
  bundle_ts: string;
  bundle_version: string;
  installed_dir: string;
  files_copied: number;
}

/**
 * Enforces [0.4.0, 0.7.0) — producers guarantee additive minor bumps in this
 * range; breaking schema changes move to 0.7.0+ to trip this gate.
 * Ported from Kocoro internal/memory/bundle.go versionInRange.
 */
export function versionInRange(v: string): boolean {
  const parts = v.split(".");
  if (parts.length !== 3) return false;
  const [maj, min, pat] = parts.map(Number);
  if (maj !== 0 || isNaN(min!) || isNaN(pat!)) return false;
  if (min! < 4 || min! >= 7) return false;
  return pat! >= 0;
}

/**
 * Keep the newest `keep` bundle dirs plus the current symlink target.
 * Best-effort — failures are silently ignored.
 * Ported from Kocoro internal/memory/bundle.go Puller.retain.
 */
export async function retainBundles(bundleRoot: string, keep: number): Promise<void> {
  const bundlesDir = path.join(bundleRoot, "bundles");
  let names: string[];
  try {
    names = await fs.readdir(bundlesDir);
  } catch {
    return;
  }
  const dirs: string[] = [];
  for (const name of names) {
    try {
      const st = await fs.stat(path.join(bundlesDir, name));
      if (st.isDirectory()) dirs.push(name);
    } catch { /* skip unreadable */ }
  }
  dirs.sort().reverse();
  if (dirs.length <= keep) return;

  let currentTarget = "";
  try {
    const target = await fs.readlink(path.join(bundleRoot, "current"));
    currentTarget = path.basename(target);
  } catch { /* no current pointer */ }

  const keepSet = new Set<string>();
  for (let i = 0; i < Math.min(keep, dirs.length); i++) {
    keepSet.add(dirs[i]!);
  }
  if (currentTarget) keepSet.add(currentTarget);

  for (const d of dirs) {
    if (!keepSet.has(d)) {
      await fs.rm(path.join(bundlesDir, d), { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Path sandboxing rules from Kocoro bundle.go validateManifestPath (§4.2).
 */
export function validateManifestPath(rel: string, stagingDir: string): string | null {
  if (!rel) return "empty path";
  if (rel.includes("\0")) return "null byte in path";
  if (path.isAbsolute(rel)) return "absolute path";
  const cleaned = path.normalize(rel);
  if (
    cleaned === ".." ||
    cleaned.startsWith(`..${path.sep}`) ||
    cleaned.includes(`${path.sep}..`)
  ) {
    return "contains parent traversal";
  }
  const abs = path.join(stagingDir, cleaned);
  const cleanedAbs = path.normalize(abs);
  const prefix = path.normalize(stagingDir) + path.sep;
  if (!cleanedAbs.startsWith(prefix)) {
    return "escapes staging dir";
  }
  return null;
}

async function sha256File(filePath: string): Promise<string> {
  const data = await fs.readFile(filePath);
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Points <bundleRoot>/current at finalDir. On Windows uses a directory junction
 * (unprivileged, no Developer Mode needed — os.Symlink would fail with
 * ERROR_PRIVILEGE_NOT_HELD on stock hosts). On POSIX uses atomic tmp-symlink +
 * rename. Ported from Kocoro bundle_link_{unix,windows}.go.
 */
async function swapCurrent(bundleRoot: string, finalDir: string): Promise<void> {
  const currentLink = path.join(bundleRoot, "current");

  if (process.platform === "win32") {
    try { await fs.rm(currentLink, { recursive: true, force: true }); } catch { /* absent */ }
    await fs.symlink(finalDir, currentLink, "junction");
    return;
  }

  const tmpLink = path.join(bundleRoot, "current.tmp");
  try { await fs.unlink(tmpLink); } catch { /* absent */ }
  await fs.symlink(finalDir, tmpLink);
  await fs.rename(tmpLink, currentLink);
}

/**
 * Install a local bundle directory into bundleRoot (staging → bundles/<ts> → current).
 * Verifies per-file sha256 when manifest lists hashes.
 */
export async function installBundle(
  opts: InstallBundleOptions,
): Promise<InstallBundleResult> {
  const sourceDir = path.resolve(opts.sourceDir);
  const bundleRoot = path.resolve(opts.bundleRoot);

  const manifestPath = path.join(sourceDir, "manifest.json");
  const raw = await fs.readFile(manifestPath, "utf8");
  const manifest = JSON.parse(raw) as BundleManifest;

  if (!manifest.bundle_ts?.trim()) {
    throw new Error("manifest missing bundle_ts");
  }
  if (!versionInRange(manifest.bundle_version ?? "")) {
    throw new Error(
      `bundle_version "${manifest.bundle_version}" outside supported range [0.4.0, 0.7.0)`,
    );
  }

  await fs.mkdir(bundleRoot, { recursive: true, mode: 0o700 });

  const staging = path.join(bundleRoot, "staging", manifest.bundle_ts);
  await fs.rm(staging, { recursive: true, force: true });
  await fs.mkdir(staging, { recursive: true, mode: 0o700 });

  let filesCopied = 0;
  for (const f of manifest.files ?? []) {
    const err = validateManifestPath(f.path, staging);
    if (err) {
      await fs.rm(staging, { recursive: true, force: true });
      throw new Error(`unsafe manifest path ${f.path}: ${err}`);
    }
    const src = path.join(sourceDir, path.normalize(f.path));
    const dest = path.join(staging, path.normalize(f.path));
    await fs.mkdir(path.dirname(dest), { recursive: true, mode: 0o700 });
    await fs.copyFile(src, dest, fs.constants.COPYFILE_EXCL).catch(async () => {
      await fs.copyFile(src, dest);
    });

    if (f.sha256) {
      const got = await sha256File(dest);
      if (got !== f.sha256) {
        await fs.rm(staging, { recursive: true, force: true });
        throw new Error(`sha256 mismatch on ${f.path}: got ${got} want ${f.sha256}`);
      }
    }
    filesCopied++;
  }

  // Copy manifest itself if not listed in files[]
  const manifestDest = path.join(staging, "manifest.json");
  try {
    await fs.access(manifestDest);
  } catch {
    await fs.copyFile(manifestPath, manifestDest);
  }

  const bundlesDir = path.join(bundleRoot, "bundles");
  await fs.mkdir(bundlesDir, { recursive: true, mode: 0o700 });
  const finalDir = path.join(bundlesDir, manifest.bundle_ts);
  await fs.rm(finalDir, { recursive: true, force: true });
  await fs.rename(staging, finalDir);
  await swapCurrent(bundleRoot, finalDir);

  const keep = opts.retain ?? 3;
  if (keep > 0) {
    await retainBundles(bundleRoot, keep);
  }

  return {
    bundle_ts: manifest.bundle_ts,
    bundle_version: manifest.bundle_version,
    installed_dir: finalDir,
    files_copied: filesCopied,
  };
}
