import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  installBundle,
  retainBundles,
  validateManifestPath,
  versionInRange,
} from "../src/bundle/install.js";
import { currentBundleReadable, readCurrentManifest } from "../src/sidecar/bundle.js";

describe("validateManifestPath", () => {
  it("rejects traversal and absolute paths", () => {
    const staging = "/tmp/staging";
    expect(validateManifestPath("../etc/passwd", staging)).toContain("traversal");
    expect(validateManifestPath("/etc/passwd", staging)).toContain("absolute");
    expect(validateManifestPath("data/events.json", staging)).toBeNull();
  });
});

describe("versionInRange", () => {
  it("accepts versions in [0.4.0, 0.7.0)", () => {
    expect(versionInRange("0.4.0")).toBe(true);
    expect(versionInRange("0.5.3")).toBe(true);
    expect(versionInRange("0.6.0")).toBe(true);
    expect(versionInRange("0.6.99")).toBe(true);
  });

  it("rejects versions below 0.4.0", () => {
    expect(versionInRange("0.3.9")).toBe(false);
    expect(versionInRange("0.0.1")).toBe(false);
    expect(versionInRange("0.1.0")).toBe(false);
  });

  it("rejects versions at or above 0.7.0", () => {
    expect(versionInRange("0.7.0")).toBe(false);
    expect(versionInRange("0.8.0")).toBe(false);
    expect(versionInRange("1.0.0")).toBe(false);
  });

  it("rejects malformed version strings", () => {
    expect(versionInRange("")).toBe(false);
    expect(versionInRange("0.4")).toBe(false);
    expect(versionInRange("abc")).toBe(false);
    expect(versionInRange("0.x.0")).toBe(false);
  });
});

describe("installBundle", () => {
  let tmpRoot: string;
  let sourceDir: string;
  let bundleRoot: string;

  afterEach(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  async function sha256(text: string): Promise<string> {
    return createHash("sha256").update(text).digest("hex");
  }

  async function makeSource(
    root: string,
    ts: string,
    version = "0.6.0",
  ): Promise<{ sourceDir: string; payload: string; payloadHash: string }> {
    const src = path.join(root, `source-${ts}`);
    await fs.mkdir(src, { recursive: true });
    const payload = `{"events":[],"ts":"${ts}"}\n`;
    const payloadHash = await sha256(payload);
    await fs.writeFile(path.join(src, "events.json"), payload, "utf8");
    await fs.writeFile(
      path.join(src, "manifest.json"),
      JSON.stringify({
        bundle_ts: ts,
        bundle_version: version,
        size_bytes: payload.length,
        integrity_sha256: "unused",
        files: [{ path: "events.json", size: payload.length, sha256: payloadHash }],
      }),
      "utf8",
    );
    return { sourceDir: src, payload, payloadHash };
  }

  it("installs bundle with sha256 verify and atomic current symlink", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-install-"));
    bundleRoot = path.join(tmpRoot, "memory");
    const { sourceDir: src, payload } = await makeSource(tmpRoot, "2026-06-01T00-00-00Z");

    const result = await installBundle({ bundleRoot, sourceDir: src });
    expect(result.bundle_ts).toBe("2026-06-01T00-00-00Z");
    expect(currentBundleReadable(bundleRoot)).toBe(true);

    const current = await fs.readlink(path.join(bundleRoot, "current"));
    expect(current).toContain("2026-06-01T00-00-00Z");

    const installed = readCurrentManifest(bundleRoot);
    expect(installed?.bundle_version).toBe("0.6.0");

    const onDisk = await fs.readFile(
      path.join(bundleRoot, "current", "events.json"),
      "utf8",
    );
    expect(onDisk).toBe(payload);
  });

  it("fails on sha256 mismatch", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-install-bad-"));
    sourceDir = path.join(tmpRoot, "source");
    bundleRoot = path.join(tmpRoot, "memory");
    await fs.mkdir(sourceDir, { recursive: true });
    await fs.writeFile(path.join(sourceDir, "events.json"), "{}", "utf8");
    await fs.writeFile(
      path.join(sourceDir, "manifest.json"),
      JSON.stringify({
        bundle_ts: "2026-06-02T00-00-00Z",
        bundle_version: "0.6.0",
        size_bytes: 2,
        integrity_sha256: "",
        files: [{ path: "events.json", size: 2, sha256: "deadbeef" }],
      }),
      "utf8",
    );

    await expect(installBundle({ bundleRoot, sourceDir })).rejects.toThrow(
      /sha256 mismatch/,
    );
  });

  it("rejects bundle_version outside [0.4.0, 0.7.0)", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-install-ver-"));
    bundleRoot = path.join(tmpRoot, "memory");

    const { sourceDir: srcOld } = await makeSource(tmpRoot, "2026-01-01T00-00-00Z", "0.3.0");
    await expect(installBundle({ bundleRoot, sourceDir: srcOld })).rejects.toThrow(
      /outside supported range/,
    );

    const { sourceDir: srcNew } = await makeSource(tmpRoot, "2026-01-02T00-00-00Z", "0.7.0");
    await expect(installBundle({ bundleRoot, sourceDir: srcNew })).rejects.toThrow(
      /outside supported range/,
    );
  });
});

describe("retainBundles", () => {
  let tmpRoot: string;

  afterEach(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("keeps newest N bundles and prunes the rest", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-retain-"));
    const bundleRoot = tmpRoot;
    const bundlesDir = path.join(bundleRoot, "bundles");
    await fs.mkdir(bundlesDir, { recursive: true });

    const timestamps = [
      "2026-01-01T00-00-00Z",
      "2026-02-01T00-00-00Z",
      "2026-03-01T00-00-00Z",
      "2026-04-01T00-00-00Z",
      "2026-05-01T00-00-00Z",
    ];
    for (const ts of timestamps) {
      const dir = path.join(bundlesDir, ts);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, "manifest.json"), "{}", "utf8");
    }

    // Point current at the newest
    await fs.symlink(path.join(bundlesDir, "2026-05-01T00-00-00Z"), path.join(bundleRoot, "current"));

    await retainBundles(bundleRoot, 3);

    const remaining = await fs.readdir(bundlesDir);
    expect(remaining.sort()).toEqual([
      "2026-03-01T00-00-00Z",
      "2026-04-01T00-00-00Z",
      "2026-05-01T00-00-00Z",
    ]);
  });

  it("protects current symlink target even if outside top N", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-retain-cur-"));
    const bundleRoot = tmpRoot;
    const bundlesDir = path.join(bundleRoot, "bundles");
    await fs.mkdir(bundlesDir, { recursive: true });

    const timestamps = [
      "2026-01-01T00-00-00Z",
      "2026-02-01T00-00-00Z",
      "2026-03-01T00-00-00Z",
      "2026-04-01T00-00-00Z",
    ];
    for (const ts of timestamps) {
      await fs.mkdir(path.join(bundlesDir, ts), { recursive: true });
    }

    // Point current at an older bundle (not in top 2)
    await fs.symlink(path.join(bundlesDir, "2026-01-01T00-00-00Z"), path.join(bundleRoot, "current"));

    await retainBundles(bundleRoot, 2);

    const remaining = (await fs.readdir(bundlesDir)).sort();
    // Top 2 (04, 03) + current target (01)
    expect(remaining).toContain("2026-04-01T00-00-00Z");
    expect(remaining).toContain("2026-03-01T00-00-00Z");
    expect(remaining).toContain("2026-01-01T00-00-00Z");
    expect(remaining).not.toContain("2026-02-01T00-00-00Z");
  });

  it("no-ops when bundles dir is missing", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-retain-miss-"));
    await expect(retainBundles(tmpRoot, 3)).resolves.toBeUndefined();
  });
});

describe("swapCurrent platform behavior", () => {
  let tmpRoot: string;

  afterEach(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it("creates a working current pointer (symlink on POSIX, junction on Windows)", async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "pi-swap-"));
    const bundleRoot = path.join(tmpRoot, "memory");
    const bundlesDir = path.join(bundleRoot, "bundles");
    const finalDir = path.join(bundlesDir, "2026-06-15T00-00-00Z");
    await fs.mkdir(finalDir, { recursive: true });
    await fs.writeFile(
      path.join(finalDir, "manifest.json"),
      JSON.stringify({ bundle_ts: "2026-06-15T00-00-00Z", bundle_version: "0.6.0", files: [] }),
      "utf8",
    );

    // installBundle calls swapCurrent internally — exercise it end-to-end
    const src = path.join(tmpRoot, "source");
    await fs.mkdir(src, { recursive: true });
    await fs.writeFile(path.join(src, "data.txt"), "hello", "utf8");
    await fs.writeFile(
      path.join(src, "manifest.json"),
      JSON.stringify({
        bundle_ts: "2026-06-20T00-00-00Z",
        bundle_version: "0.6.0",
        size_bytes: 5,
        integrity_sha256: "",
        files: [],
      }),
      "utf8",
    );

    const result = await installBundle({ bundleRoot, sourceDir: src });
    expect(result.bundle_ts).toBe("2026-06-20T00-00-00Z");

    const currentPath = path.join(bundleRoot, "current");
    const stat = await fs.stat(currentPath);
    expect(stat.isDirectory()).toBe(true);

    // Verify readlink resolves the pointer (works for both symlink and junction)
    const target = await fs.readlink(currentPath);
    expect(target).toContain("2026-06-20T00-00-00Z");
  });
});
