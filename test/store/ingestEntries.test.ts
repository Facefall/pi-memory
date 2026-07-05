import { describe, expect, it, vi } from "vitest";

import type { ParsedEntry, StoreMemoryEntry } from "../../src/store/types.js";
import { ingestMemoryExport } from "../../src/store/ingestEntries.js";

function mockStore(existing: ParsedEntry[] = []) {
  return {
    listEntries: vi.fn().mockResolvedValue(existing),
    appendMany: vi.fn().mockResolvedValue(undefined),
  };
}

const SAMPLE_SUMMARY = `## Memory Export
### Findings
- New fact
- Another fact
`;

describe("ingestMemoryExport", () => {
  it("appends parsed Memory Export entries for a root session", async () => {
    const store = mockStore();
    const result = await ingestMemoryExport({
      store,
      summary: SAMPLE_SUMMARY,
      isSubagent: false,
    });

    expect(result).toEqual({ appended: 2 });
    expect(store.appendMany).toHaveBeenCalledWith(
      [
        expect.objectContaining({ section: "Findings", content: "New fact" }),
        expect.objectContaining({ section: "Findings", content: "Another fact" }),
      ],
      { mode: "ifAbsent" },
    );
  });

  it("returns zero for empty Memory Export without calling appendMany", async () => {
    const store = mockStore();
    const result = await ingestMemoryExport({
      store,
      summary: "## Session Context\nNo export",
      isSubagent: false,
    });

    expect(result).toEqual({ appended: 0 });
    expect(store.appendMany).not.toHaveBeenCalled();
  });

  it("filters subagent exports against existing memory and skips when no delta", async () => {
    const existing: ParsedEntry[] = [
      {
        id: "1",
        section: "Findings",
        content: "New fact",
        timestamp: "",
        sourceFile: "MEMORY.md",
        line: 1,
      },
    ];
    const store = mockStore(existing);
    const result = await ingestMemoryExport({
      store,
      summary: SAMPLE_SUMMARY,
      isSubagent: true,
    });

    expect(result).toEqual({ appended: 1 });
    expect(store.appendMany).toHaveBeenCalledWith(
      [expect.objectContaining({ section: "Findings", content: "Another fact" })],
      { mode: "ifAbsent" },
    );
  });

  it("skips subagent ingest when export duplicates parent memory entirely", async () => {
    const existing: ParsedEntry[] = [
      {
        id: "1",
        section: "Findings",
        content: "New fact",
        timestamp: "",
        sourceFile: "MEMORY.md",
        line: 1,
      },
    ];
    const store = mockStore(existing);
    const result = await ingestMemoryExport({
      store,
      summary: `## Memory Export
### Findings
- New fact
`,
      isSubagent: true,
    });

    expect(result).toEqual({ appended: 0 });
    expect(store.appendMany).not.toHaveBeenCalled();
  });
});
