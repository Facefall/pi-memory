import { describe, expect, it, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalGraphQuerier } from "../src/local/graphQuery.js";

function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeGraph(dir: string, entities: unknown[]): void {
  const currentDir = path.join(dir, "current");
  fs.mkdirSync(currentDir, { recursive: true });
  fs.writeFileSync(
    path.join(currentDir, "graph.json"),
    JSON.stringify({ entities, edges: [], events: [] }),
  );
  // Also write manifest so currentBundleReadable works
  fs.writeFileSync(
    path.join(currentDir, "manifest.json"),
    JSON.stringify({ bundle_ts: new Date().toISOString(), bundle_version: "test", size_bytes: 0, integrity_sha256: "", files: [] }),
  );
}

describe("LocalGraphQuerier mtime tracking", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir("pi-gq-");
  });

  it("isStale() returns false before any load", () => {
    writeGraph(tmpDir, []);
    const q = new LocalGraphQuerier(tmpDir);
    expect(q.isStale()).toBe(false);
  });

  it("isStale() returns false immediately after load", () => {
    writeGraph(tmpDir, []);
    const q = new LocalGraphQuerier(tmpDir);
    q.load();
    expect(q.isStale()).toBe(false);
  });

  it("isStale() detects mtime change", async () => {
    writeGraph(tmpDir, []);
    const q = new LocalGraphQuerier(tmpDir);
    q.load();

    // Small delay then rewrite (different mtime)
    await new Promise((r) => setTimeout(r, 10));
    writeGraph(tmpDir, [
      {
        entity_id: "ent_001",
        label: "Alice",
        type: "person",
        aliases: [],
        mention_count: 1,
        distinct_session_count: 1,
      },
    ]);

    expect(q.isStale()).toBe(true);
  });

  it("reloadIfStale() returns true and reloads new entities", async () => {
    writeGraph(tmpDir, []);
    const q = new LocalGraphQuerier(tmpDir);
    q.load();

    await new Promise((r) => setTimeout(r, 10));
    writeGraph(tmpDir, [
      {
        entity_id: "ent_001",
        label: "Alice",
        type: "person",
        aliases: [],
        mention_count: 1,
        distinct_session_count: 1,
      },
    ]);

    const reloaded = q.reloadIfStale();
    expect(reloaded).toBe(true);
    expect(q.isStale()).toBe(false);

    // The new entity should now be queryable
    const result = q.query({
      mode: "direct_relation",
      anchor_mentions: ["Alice"],
    });
    expect(result.errorClass).toBe("ok");
  });

  it("reloadIfStale() returns false when graph unchanged", () => {
    writeGraph(tmpDir, []);
    const q = new LocalGraphQuerier(tmpDir);
    q.load();
    expect(q.reloadIfStale()).toBe(false);
  });
});
