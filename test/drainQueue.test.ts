import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LlmClient } from "../src/adapters/llm/types.js";
import { enqueueShutdownMetadata } from "../src/shutdown/enqueue.js";
import {
  isShutdownProcessed,
  markShutdownProcessed,
  readShutdownProcessedState,
} from "../src/shutdown/processed.js";
import { readShutdownQueueEntries } from "../src/shutdown/readQueue.js";
import { runDrainShutdownQueueJob } from "../src/shutdown/runDrainJob.js";
import { wrapShutdownExportMarkdown } from "../src/shutdown/extractPrompt.js";
import { MemoryStore } from "../src/store/memoryStore.js";

describe("shutdown queue drain", () => {
  let tmpDir: string;
  let agentDir: string;
  let sessionFile: string;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  function setupSession(summary: string): MemoryStore {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-drain-"));
    agentDir = join(tmpDir, "agent");
    sessionFile = join(tmpDir, "session.jsonl");

    writeFileSync(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "sess-1",
          timestamp: "2026-07-04T03:00:00.000Z",
          cwd: tmpDir,
        }),
        JSON.stringify({
          type: "message",
          id: "msg-1",
          parentId: null,
          timestamp: "2026-07-04T03:01:00.000Z",
          message: { role: "user", content: "We use Vitest" },
        }),
        JSON.stringify({
          type: "compaction",
          id: "compact-1",
          parentId: "msg-1",
          timestamp: "2026-07-04T03:02:00.000Z",
          summary,
          firstKeptEntryId: "msg-1",
          tokensBefore: 100,
          fromHook: true,
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    return new MemoryStore({ agentDir });
  }

  it("dedupes queue rows by session file", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-drain-"));
    agentDir = join(tmpDir, "agent");
    sessionFile = join(tmpDir, "session.jsonl");

    await enqueueShutdownMetadata(agentDir, {
      sessionFile,
      reason: "quit",
      isSubagent: false,
      enqueuedAt: "2026-07-04T01:00:00.000Z",
    });
    await enqueueShutdownMetadata(agentDir, {
      sessionFile,
      reason: "quit",
      isSubagent: false,
      enqueuedAt: "2026-07-04T02:00:00.000Z",
    });

    const entries = await readShutdownQueueEntries(agentDir);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.enqueuedAt).toBe("2026-07-04T02:00:00.000Z");
  });

  it("ingests unprocessed compaction export from queued session", async () => {
    const store = setupSession(`## Session Context
Goal: ship memory

## Memory Export

### Findings
- Project tests use Vitest
`);

    await enqueueShutdownMetadata(agentDir, {
      sessionFile,
      reason: "quit",
      isSubagent: false,
      enqueuedAt: "2026-07-04T03:05:00.000Z",
    });

    const result = await runDrainShutdownQueueJob({ store, agentDir, llm: null, reindex: false });
    expect(result.status).toBe("drained");
    if (result.status !== "drained") return;

    expect(result.stats.ingested).toBe(1);
    expect(result.stats.appended).toBe(1);

    const entries = await store.listEntries();
    expect(entries.some((entry) => entry.content.includes("Vitest"))).toBe(true);
    expect(await store.hasProcessedCompaction("compact-1")).toBe(true);

    const processed = await readShutdownProcessedState(agentDir);
    expect(isShutdownProcessed(processed, sessionFile)).toBe(true);
  });

  it("skips when compaction was already ingested", async () => {
    const store = setupSession(`## Memory Export

### Findings
- Already ingested fact
`);
    await store.markCompactionProcessed("compact-1");
    await enqueueShutdownMetadata(agentDir, {
      sessionFile,
      reason: "quit",
      isSubagent: false,
      enqueuedAt: "2026-07-04T03:05:00.000Z",
    });

    const result = await runDrainShutdownQueueJob({ store, agentDir, llm: null, reindex: false });
    expect(result.status).toBe("drained");
    if (result.status !== "drained") return;

    expect(result.stats.appended).toBe(0);
    expect(result.stats.skipped).toBe(1);
    expect((await store.listEntries()).length).toBe(0);
  });

  it("uses LLM extract when session has no compaction", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-drain-"));
    agentDir = join(tmpDir, "agent");
    sessionFile = join(tmpDir, "bare.jsonl");

    writeFileSync(
      sessionFile,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: "sess-2",
          timestamp: "2026-07-04T03:00:00.000Z",
          cwd: tmpDir,
        }),
        JSON.stringify({
          type: "message",
          id: "msg-1",
          parentId: null,
          timestamp: "2026-07-04T03:01:00.000Z",
          message: { role: "user", content: "Prefer strict TypeScript" },
        }),
      ].join("\n") + "\n",
      "utf8",
    );

    const store = new MemoryStore({ agentDir });
    await enqueueShutdownMetadata(agentDir, {
      sessionFile,
      reason: "quit",
      isSubagent: false,
      enqueuedAt: "2026-07-04T03:05:00.000Z",
    });

    const llm: LlmClient = {
      complete: vi.fn(async () => "### Preferences\n- Prefer strict TypeScript"),
    };

    const result = await runDrainShutdownQueueJob({ store, agentDir, llm, reindex: false });
    expect(result.status).toBe("drained");
    if (result.status !== "drained") return;

    expect(result.stats.appended).toBe(1);
    const entries = await store.listEntries();
    expect(entries[0]?.content).toContain("strict TypeScript");
  });
});

describe("wrapShutdownExportMarkdown", () => {
  it("wraps subsection markdown for parseMemoryExport", () => {
    expect(wrapShutdownExportMarkdown("### Findings\n- Uses pnpm")).toContain("## Memory Export");
  });
});

describe("shutdown processed state", () => {
  let tmpDir: string;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("tracks processed session files", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-processed-"));
    await markShutdownProcessed(tmpDir, "/tmp/session.jsonl");
    const state = await readShutdownProcessedState(tmpDir);
    expect(isShutdownProcessed(state, "/tmp/session.jsonl")).toBe(true);
  });
});
