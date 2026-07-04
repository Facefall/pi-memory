import { describe, expect, it, vi } from "vitest";

import { resetQueryIntentCacheForTests } from "../src/preflight/intentCache.js";
import {
  buildRetrievalQuery,
  extractQueryIntent,
  parseQueryIntent,
  shouldExtractIntent,
  shouldRunEpisodicPreflight,
} from "../src/preflight/queryIntent.js";

describe("QueryIntentSchema", () => {
  it("accepts structured intent fields", () => {
    expect(
      parseQueryIntent({ what: "testing framework", who: "team", where: "project" }),
    ).toEqual({
      what: "testing framework",
      who: "team",
      where: "project",
    });
  });

  it("accepts raw_query", () => {
    expect(parseQueryIntent({ raw_query: "remember last time" })).toEqual({
      raw_query: "remember last time",
    });
  });

  it("rejects unknown keys", () => {
    expect(() => parseQueryIntent({ query: "hello" })).toThrow();
  });
});

describe("buildRetrievalQuery", () => {
  it("prefers raw_query over structured fields", () => {
    expect(
      buildRetrievalQuery(
        { raw_query: " verbatim search ", what: "ignored" },
        "fallback",
      ),
    ).toBe("verbatim search");
  });

  it("joins what/who/where", () => {
    expect(
      buildRetrievalQuery(
        { what: "Vitest", who: "chen", where: "pi-memory" },
        "fallback",
      ),
    ).toBe("Vitest chen pi-memory");
  });

  it("falls back to user input when intent is empty", () => {
    expect(buildRetrievalQuery({}, "  find prefs  ")).toBe("find prefs");
  });
});

describe("preflight gates", () => {
  it("skips episodic preflight for short generic prompts", () => {
    expect(shouldRunEpisodicPreflight("fix typo")).toBe(false);
    expect(shouldRunEpisodicPreflight("remember what we decided last time")).toBe(true);
  });

  it("forceEpisodic runs episodic gate but does not imply forceIntent", () => {
    expect(shouldRunEpisodicPreflight("hello", true)).toBe(true);
    expect(shouldExtractIntent("hello", false)).toBe(false);
  });

  it("forceIntent still forces helper LLM extraction", () => {
    expect(shouldExtractIntent("fix typo", true)).toBe(true);
  });
});

describe("extractQueryIntent", () => {
  it("reuses cached intent for repeated input in the same session", async () => {
    resetQueryIntentCacheForTests();
    const llm = { complete: vi.fn().mockResolvedValue('{"what":"Vitest"}') };

    const first = await extractQueryIntent("remember our testing framework choice", llm, {
      sessionId: "session-1",
    });
    const second = await extractQueryIntent("remember our testing framework choice", llm, {
      sessionId: "session-1",
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
});
