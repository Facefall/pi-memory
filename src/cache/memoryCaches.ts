import { LRUCache } from "lru-cache";
import type { QueryIntent } from "../types.js";
import type { RankedResult } from "../fallback/llmRerank.js";
import type { SessionSearchHit } from "../fallback/sessionSearch.js";

const INTENT_TTL_MS = 15 * 60_000;
const RERANK_TTL_MS = 15 * 60_000;
const NEGATIVE_TTL_MS = 60_000;

/**
 * In-process LRU + TTL caches for pi-memory.
 *
 * - intentCache  : helper-LLM compile_memory_intents results, keyed by
 *                  normalised query text. TTL 15 min, LRU 128 entries.
 * - rerankCache  : LLM rerank results, keyed by query + hit fingerprint.
 *                  TTL 15 min, LRU 256 entries.
 * - negativeCache: queries that recently returned no usable context.
 *                  TTL 60 s, max 512 entries.
 *
 * All three caches must be invalidated together (`invalidateMemoryCaches()`)
 * after bundle reload so stale negative entries never block fresh graph data.
 */
export const intentCache = new LRUCache<string, QueryIntent[]>({
  max: 128,
  ttl: INTENT_TTL_MS,
});

export const rerankCache = new LRUCache<string, RankedResult[]>({
  max: 256,
  ttl: RERANK_TTL_MS,
});

export const negativeCache = new LRUCache<string, true>({
  max: 512,
  ttl: NEGATIVE_TTL_MS,
});

function normalizeQuery(query: string): string {
  return query.trim();
}

export function cacheKeyForIntents(query: string): string {
  return normalizeQuery(query);
}

/**
 * Rerank cache key combines the query with a fingerprint of the hit set so
 * different FTS results for the same query get their own entry.
 */
export function cacheKeyForRerank(query: string, hits: SessionSearchHit[]): string {
  const hitIds = hits.map((h) => `${h.session_id}:${h.msg_index}`).join("|");
  return `${normalizeQuery(query)}|${hitIds}`;
}

export function isNegativeCached(query: string): boolean {
  return negativeCache.has(cacheKeyForIntents(query));
}

export function setNegativeCache(query: string): void {
  negativeCache.set(cacheKeyForIntents(query), true);
}

export function deleteNegativeCache(query: string): void {
  negativeCache.delete(cacheKeyForIntents(query));
}

/** Clear all three caches. Call after bundle reload or session shutdown. */
export function invalidateMemoryCaches(): void {
  intentCache.clear();
  rerankCache.clear();
  negativeCache.clear();
}
