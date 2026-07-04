import { describe, expect, it, beforeEach, vi } from "vitest";

import { resetQueryIntentCacheForTests, queryIntentCache } from "../src/preflight/intentCache.js";
import type { QueryIntent } from "../src/preflight/queryIntent.js";

describe("queryIntentCache", () => {
  beforeEach(() => {
    resetQueryIntentCacheForTests();
  });

  it("reuses intent within the same session", () => {
    const intent: QueryIntent = { what: "Vitest" };
    queryIntentCache.set("session-a", "What testing framework?", intent);
    expect(queryIntentCache.get("session-a", "What testing framework?")).toEqual(intent);
  });

  it("normalizes whitespace and case in cache keys", () => {
    const intent: QueryIntent = { raw_query: "hello" };
    queryIntentCache.set("session-a", "  Hello   World  ", intent);
    expect(queryIntentCache.get("session-a", "hello world")).toEqual(intent);
  });

  it("does not leak intents across sessions", () => {
    queryIntentCache.set("session-a", "query", { raw_query: "a" });
    expect(queryIntentCache.get("session-b", "query")).toBeNull();
  });

  it("clears session entries on shutdown", () => {
    queryIntentCache.set("session-a", "one", { raw_query: "1" });
    queryIntentCache.set("session-a", "two", { raw_query: "2" });
    queryIntentCache.set("session-b", "one", { raw_query: "b" });

    queryIntentCache.clearSession("session-a");

    expect(queryIntentCache.get("session-a", "one")).toBeNull();
    expect(queryIntentCache.get("session-a", "two")).toBeNull();
    expect(queryIntentCache.get("session-b", "one")).toEqual({ raw_query: "b" });
  });
});
