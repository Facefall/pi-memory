import { describe, expect, it } from "vitest";

import { entryDedupeKey } from "../../../src/utils/memory/index.js";

describe("entryDedupeKey", () => {
  it("joins section and trimmed content with null separator", () => {
    expect(
      entryDedupeKey({ section: "Findings", content: "  same fact  " }),
    ).toBe("Findings\0same fact");
  });

  it("treats whitespace-only content as empty after trim", () => {
    expect(entryDedupeKey({ section: "Todos", content: "   " })).toBe("Todos\0");
  });

  it("distinguishes sections with identical content", () => {
    const content = "shared bullet";
    expect(entryDedupeKey({ section: "Findings", content })).not.toBe(
      entryDedupeKey({ section: "Todos", content }),
    );
  });
});
