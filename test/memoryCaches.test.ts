import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import {
  intentCache,
  rerankCache,
  negativeCache,
  cacheKeyForIntents,
  cacheKeyForRerank,
  isNegativeCached,
  setNegativeCache,
  deleteNegativeCache,
  invalidateMemoryCaches,
} from "../src/cache/memoryCaches.js";
import type { QueryIntent } from "../src/types.js";
import type { SessionSearchHit } from "../src/fallback/sessionSearch.js";

const intent: QueryIntent = {
  mode: "direct_relation",
  anchor_mentions: ["Alice"],
};

const hit: SessionSearchHit = {
  session_id: "s1",
  session_title: "Test",
  role: "user",
  snippet: "snippet",
  msg_index: 0,
  created_at: "",
};

beforeEach(() => {
  invalidateMemoryCaches();
});

describe("cacheKeyForIntents", () => {
  it("normalizes by trimming whitespace", () => {
    expect(cacheKeyForIntents("  hello  ")).toBe("hello");
    expect(cacheKeyForIntents("hello")).toBe("hello");
  });

  it("treats same query as same key", () => {
    expect(cacheKeyForIntents("Alice与我的关系")).toBe(cacheKeyForIntents("Alice与我的关系"));
  });
});

describe("cacheKeyForRerank", () => {
  it("includes query and hit fingerprint", () => {
    const key = cacheKeyForRerank("query", [hit]);
    expect(key).toContain("query");
    expect(key).toContain("s1:0");
  });

  it("differs when hits differ", () => {
    const hit2: SessionSearchHit = { ...hit, session_id: "s2" };
    const k1 = cacheKeyForRerank("q", [hit]);
    const k2 = cacheKeyForRerank("q", [hit2]);
    expect(k1).not.toBe(k2);
  });
});

describe("intentCache", () => {
  it("stores and retrieves intents", () => {
    const key = cacheKeyForIntents("Alice");
    intentCache.set(key, [intent]);
    expect(intentCache.get(key)).toEqual([intent]);
  });

  it("returns undefined for missing key", () => {
    expect(intentCache.get("missing")).toBeUndefined();
  });
});

describe("rerankCache", () => {
  it("stores and retrieves rerank results", () => {
    const key = cacheKeyForRerank("q", [hit]);
    const results = [{ index: 0, score: 8, summary: "relevant" }];
    rerankCache.set(key, results);
    expect(rerankCache.get(key)).toEqual(results);
  });
});

describe("negativeCache helpers", () => {
  it("isNegativeCached returns false before set", () => {
    expect(isNegativeCached("unknown query")).toBe(false);
  });

  it("setNegativeCache + isNegativeCached round trip", () => {
    setNegativeCache("what is the weather");
    expect(isNegativeCached("what is the weather")).toBe(true);
  });

  it("deleteNegativeCache removes entry", () => {
    setNegativeCache("some query");
    deleteNegativeCache("some query");
    expect(isNegativeCached("some query")).toBe(false);
  });

  it("normalizes keys (trims whitespace)", () => {
    setNegativeCache("  padded  ");
    expect(isNegativeCached("padded")).toBe(true);
  });
});

describe("invalidateMemoryCaches", () => {
  it("clears all three caches", () => {
    intentCache.set(cacheKeyForIntents("q"), [intent]);
    rerankCache.set(cacheKeyForRerank("q", [hit]), [{ index: 0, score: 9, summary: "x" }]);
    setNegativeCache("q");

    invalidateMemoryCaches();

    expect(intentCache.size).toBe(0);
    expect(rerankCache.size).toBe(0);
    expect(negativeCache.size).toBe(0);
  });
});
