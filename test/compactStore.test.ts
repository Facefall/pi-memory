import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createMemoryStore } from "../src/store/index.js";

const SAMPLE_SUMMARY = `## Session Context
Continue wiring compact handlers.

## Memory Export
### Todos
- Implement memoryQueue worker
`;

describe("MemoryStore.appendFromCompaction", () => {
  let tmpDir: string;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ingests Memory Export in the background and is idempotent", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-compact-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    await new Promise<void>((resolve) => {
      store.appendFromCompaction({
        compactionId: "cmp-1",
        summary: SAMPLE_SUMMARY,
        onComplete: resolve,
      });
    });

    const entries = await store.listEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]?.section).toBe("Todos");
    expect(entries[0]?.content).toContain("memoryQueue worker");
    expect(await store.hasProcessedCompaction("cmp-1")).toBe(true);

    store.appendFromCompaction({
      compactionId: "cmp-1",
      summary: SAMPLE_SUMMARY,
    });
    await new Promise((r) => setTimeout(r, 20));
    expect((await store.listEntries()).length).toBe(1);
  });

  it("skips subagent ingest when Memory Export duplicates parent memory", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-compact-sub-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    await store.append({
      id: "existing",
      section: "Todos",
      content: "Implement memoryQueue worker",
      timestamp: "2026-07-04T00:00:00.000Z",
    });

    await new Promise<void>((resolve) => {
      store.appendFromCompaction({
        compactionId: "cmp-sub-1",
        summary: SAMPLE_SUMMARY,
        subagent: true,
        onComplete: resolve,
      });
    });

    expect((await store.listEntries()).length).toBe(1);
    expect(await store.hasProcessedCompaction("cmp-sub-1")).toBe(true);
  });
});
