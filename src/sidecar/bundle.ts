import fs from "node:fs";
import path from "node:path";

/**
 * True when `<bundleRoot>/current` resolves to a directory containing
 * JSON-parseable manifest.json (Kocoro memory/service.go currentBundleReadable).
 */
export function currentBundleReadable(bundleRoot: string): boolean {
  const currentPath = path.join(bundleRoot, "current");
  let st: fs.Stats;
  try {
    st = fs.statSync(currentPath);
  } catch {
    return false;
  }
  if (!st.isDirectory()) return false;
  try {
    const data = fs.readFileSync(path.join(currentPath, "manifest.json"), "utf8");
    JSON.parse(data);
    return true;
  } catch {
    return false;
  }
}

export interface BundleManifestFile {
  path: string;
  size: number;
  sha256: string;
}

export interface BundleManifest {
  bundle_ts: string;
  bundle_version: string;
  size_bytes: number;
  integrity_sha256: string;
  files: BundleManifestFile[];
}

export function readCurrentManifest(bundleRoot: string): BundleManifest | null {
  if (!currentBundleReadable(bundleRoot)) return null;
  const currentPath = path.join(bundleRoot, "current");
  try {
    const raw = fs.readFileSync(
      path.join(currentPath, "manifest.json"),
      "utf8",
    );
    return JSON.parse(raw) as BundleManifest;
  } catch {
    return null;
  }
}
