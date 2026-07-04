import { describe, expect, it } from "vitest";

import { parseRememberArgs } from "../src/commands/parseRememberArgs.js";

describe("parseRememberArgs", () => {
  it("defaults to Findings when section is omitted", () => {
    expect(parseRememberArgs("Always run tests before committing")).toEqual({
      section: "Findings",
      content: "Always run tests before committing",
    });
  });

  it("parses explicit section prefix", () => {
    expect(parseRememberArgs("Preferences use dark mode")).toEqual({
      section: "Preferences",
      content: "use dark mode",
    });
  });

  it("accepts section aliases", () => {
    expect(parseRememberArgs("todo ship MVP")).toEqual({
      section: "Todos",
      content: "ship MVP",
    });
  });

  it("returns usage error for empty input", () => {
    expect(parseRememberArgs("")).toMatchObject({ error: expect.any(String) });
  });

  it("returns usage error when section has no content", () => {
    expect(parseRememberArgs("Preferences")).toMatchObject({ error: expect.any(String) });
  });
});
