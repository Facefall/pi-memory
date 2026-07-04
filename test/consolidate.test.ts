import { describe, expect, it } from "vitest";

import { dedupeEntries } from "../src/consolidate/mergeEntries.js";

describe("dedupeEntries", () => {
  it("keeps user-authored entry on duplicate content", () => {
    const entries = dedupeEntries([
      {
        id: "a",
        section: "Findings",
        content: "Use Vitest",
        timestamp: "2026-01-01T00:00:00.000Z",
        sourceFile: "MEMORY.md",
        line: 1,
      },
      {
        id: "b",
        section: "Findings",
        content: "Use Vitest",
        userAuthored: true,
        timestamp: "2026-02-01T00:00:00.000Z",
        sourceFile: "MEMORY.md",
        line: 2,
      },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.userAuthored).toBe(true);
    expect(entries[0]?.id).toBe("b");
  });
});
