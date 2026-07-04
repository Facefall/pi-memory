import { describe, expect, it } from "vitest";

import { MEMORY_SECTIONS } from "../src/constants/memory.js";
import { defaultMemoryTemplate } from "../src/store/markdown/template.js";
import { parseMemoryMarkdown } from "../src/store/markdown/parse.js";

describe("defaultMemoryTemplate", () => {
  it("includes title, format comment, and all sections", () => {
    const template = defaultMemoryTemplate();
    expect(template).toMatch(/^# Memory\n/);
    expect(template).toContain("pi-memory ground truth");
    for (const section of MEMORY_SECTIONS) {
      expect(template).toContain(`## ${section}`);
    }
  });

  it("parses as empty memory with known sections", () => {
    const entries = parseMemoryMarkdown(defaultMemoryTemplate(), "MEMORY.md");
    expect(entries).toEqual([]);
  });
});
