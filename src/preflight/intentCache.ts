import { LRUCache } from "lru-cache";

import { INTENT_CACHE_MAX_ENTRIES } from "../constants/preflight.js";
import type { QueryIntent } from "./queryIntent.js";

function normalizeInput(input: string): string {
  return input.trim().replace(/\s+/g, " ").toLowerCase();
}

function cacheKey(sessionId: string, userInput: string): string {
  return `${sessionId}\0${normalizeInput(userInput)}`;
}

class QueryIntentCache {
  private readonly lru = new LRUCache<string, QueryIntent>({ max: INTENT_CACHE_MAX_ENTRIES });

  get(sessionId: string | undefined, userInput: string): QueryIntent | null {
    if (!sessionId) return null;
    return this.lru.get(cacheKey(sessionId, userInput)) ?? null;
  }

  set(sessionId: string | undefined, userInput: string, intent: QueryIntent): void {
    if (!sessionId) return;
    this.lru.set(cacheKey(sessionId, userInput), intent);
  }

  clearSession(sessionId: string): void {
    const prefix = `${sessionId}\0`;
    for (const key of this.lru.keys()) {
      if (key.startsWith(prefix)) this.lru.delete(key);
    }
  }

  /** @internal test hook */
  resetForTests(): void {
    this.lru.clear();
  }
}

export const queryIntentCache = new QueryIntentCache();

export function resetQueryIntentCacheForTests(): void {
  queryIntentCache.resetForTests();
}
