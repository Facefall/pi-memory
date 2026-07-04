import { accessSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { LlmClient } from "../src/adapters/llm/types.js";
import { createMemoryStore } from "../src/store/index.js";

const noopLlm: LlmClient = {
  async complete() {
    throw new Error("LLM skipped in test");
  },
};

describe("MemoryStore consolidate", () => {
  let tmpDir: string;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("fires onConsolidateCheck after append", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-consolidate-hook-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    let checks = 0;
    store.onConsolidateCheck(() => {
      checks++;
    });

    await store.appendUser({
      id: "x",
      section: "Findings",
      content: "hook test",
      timestamp: "2026-07-04T00:00:00.000Z",
    });

    expect(checks).toBe(1);
  });

  it("consolidates entries and writes .memory_gc", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-consolidate-run-"));
    const store = createMemoryStore({ agentDir: tmpDir, maxLines: 8 });
    await store.ensureInitialized();

    for (let i = 0; i < 4; i++) {
      await store.append({
        id: `e-${i}`,
        section: "Findings",
        content: `finding ${i}`,
        timestamp: "2026-07-04T00:00:00.000Z",
      });
    }

    await store.consolidate(noopLlm);

    const stats = await store.getStats();
    expect(stats.lastConsolidatedAt).toBeTruthy();
    expect((await store.listEntries()).length).toBe(4);
  });

  it("shouldConsolidate when overflow files >= 12", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-consolidate-should-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    await Promise.all(
      Array.from({ length: 12 }, (_, i) =>
        writeFile(join(tmpDir, `auto-2026-07-04-${String(i).padStart(2, "0")}.md`), "## Findings\n"),
      ),
    );

    expect(await store.shouldConsolidate()).toBe(true);
  });

  it("deletes auto overflow files after consolidate", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-consolidate-auto-"));
    const store = createMemoryStore({ agentDir: tmpDir, maxLines: 8 });
    await store.ensureInitialized();

    const autoPath = join(tmpDir, "auto-2026-07-04-deadbeef.md");
    await writeFile(autoPath, "## Findings\n\n- spill entry\n");

    await store.append({
      id: "main-1",
      section: "Findings",
      content: "main finding",
      timestamp: "2026-07-04T00:00:00.000Z",
    });

    await store.consolidate(noopLlm);

    expect(() => accessSync(autoPath)).toThrow();
    expect((await store.getStats()).overflowFileCount).toBe(0);
    expect(await store.shouldConsolidate()).toBe(false);
  });
});
