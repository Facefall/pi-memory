import type { ParsedEntry, StoreMemoryEntry } from "../store/types.js";
import { entryDedupeKey } from "../utils/memory/index.js";

/** Keep only Memory Export facts not already present in MEMORY (parent/root dedup). */
export function filterCompactionDelta(
  entries: StoreMemoryEntry[],
  existing: ParsedEntry[],
): StoreMemoryEntry[] {
  const known = new Set(existing.map(entryDedupeKey));
  return entries.filter((entry) => !known.has(entryDedupeKey(entry)));
}

/** Subagent clone: summary had export bullets but nothing new vs parent memory. */
export function shouldSkipSubagentCompactionIngest(
  parsed: StoreMemoryEntry[],
  delta: StoreMemoryEntry[],
): boolean {
  return parsed.length > 0 && delta.length === 0;
}
