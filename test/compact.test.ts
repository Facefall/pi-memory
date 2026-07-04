import { describe, expect, it } from "vitest";

import { parseMemoryExport } from "../src/compact/parseMemoryExport.js";

const SAMPLE_SUMMARY = `## Session Context
Working on pi-memory compact pipeline.

## Memory Export

### Preferences
- Prefer TypeScript strict mode

### Findings
- Sidecar uses better-sqlite3 with JS cosine search
`;

describe("parseMemoryExport", () => {
  it("extracts bullets from Memory Export sections", () => {
    const entries = parseMemoryExport(SAMPLE_SUMMARY);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      section: "Preferences",
      content: "Prefer TypeScript strict mode",
    });
    expect(entries[1]).toMatchObject({
      section: "Findings",
      content: "Sidecar uses better-sqlite3 with JS cosine search",
    });
  });

  it("returns empty when Memory Export is missing", () => {
    expect(parseMemoryExport("## Session Context\nOnly session stuff")).toEqual([]);
  });

  it("deduplicates identical section+content pairs", () => {
    const summary = `## Memory Export
### Findings
- Same fact
- Same fact
`;
    expect(parseMemoryExport(summary)).toHaveLength(1);
  });
});
