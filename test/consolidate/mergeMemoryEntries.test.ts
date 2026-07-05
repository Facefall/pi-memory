import { describe, expect, it, vi } from "vitest";

import type { LlmClient } from "../../src/adapters/llm/types.js";
import type { ParsedEntry } from "../../src/store/types.js";
import { mergeMemoryEntries } from "../../src/consolidate/mergeMemoryEntries.js";

const noopLlm: LlmClient = {
  async complete() {
    throw new Error("LLM skipped in test");
  },
};

describe("mergeMemoryEntries", () => {
  it("dedupes entries via rewriteMemoryUnderLock", async () => {
    const entries: ParsedEntry[] = [
      {
        id: "1",
        section: "Findings",
        content: "same",
        timestamp: "",
        sourceFile: "MEMORY.md",
        line: 1,
      },
      {
        id: "2",
        section: "Findings",
        content: "same",
        timestamp: "",
        sourceFile: "MEMORY.md",
        line: 2,
      },
    ];

    const rewriteMemoryUnderLock = vi.fn(
      async (updateEntries: (current: ParsedEntry[]) => Promise<ParsedEntry[]>) => {
        const merged = await updateEntries(entries);
        expect(merged).toHaveLength(1);
      },
    );

    await mergeMemoryEntries(
      {
        shouldConsolidate: vi.fn(),
        getStats: vi.fn(),
        exportForIndex: vi.fn(),
        isConsolidating: () => false,
        rewriteMemoryUnderLock,
      },
      noopLlm,
    );

    expect(rewriteMemoryUnderLock).toHaveBeenCalledOnce();
  });

  it("skips when store is already consolidating", async () => {
    const rewriteMemoryUnderLock = vi.fn();

    await mergeMemoryEntries(
      {
        shouldConsolidate: vi.fn(),
        getStats: vi.fn(),
        exportForIndex: vi.fn(),
        isConsolidating: () => true,
        rewriteMemoryUnderLock,
      },
      noopLlm,
    );

    expect(rewriteMemoryUnderLock).not.toHaveBeenCalled();
  });
});
