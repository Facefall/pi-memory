import type { FallbackQuery } from "../types.js";
import { memoryMdSnippet } from "./memoryMd.js";
import { sessionKeywordSearch } from "./sessionSearch.js";

export type { SessionSearchHit } from "./sessionSearch.js";
export { sessionKeywordSearch } from "./sessionSearch.js";
export { memoryMdSnippet } from "./memoryMd.js";

export interface FallbackOptions {
  sessionsDir: string;
  memoryMdPaths: string[];
}

/** Real fallback: session JSON keyword search + MEMORY.md grep. */
export function createFallbackQuery(opts: FallbackOptions): FallbackQuery {
  return {
    async sessionKeyword(query: string, limit: number) {
      return sessionKeywordSearch(opts.sessionsDir, query, limit);
    },
    async memoryFileSnippet(query: string) {
      return memoryMdSnippet(opts.memoryMdPaths, query);
    },
  };
}
