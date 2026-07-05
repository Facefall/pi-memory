import type { LlmClient } from "../adapters/llm/types.js";
import type { ConsolidateStoreAccess } from "../store/consolidatePort.js";
import { dedupeEntries } from "./mergeEntries.js";
import { mergeEntriesWithLlm } from "./mergeWithLlm.js";

/** Dedupe and optionally LLM-merge MEMORY entries, then rewrite Ground Truth under lock. */
export async function mergeMemoryEntries(
  store: ConsolidateStoreAccess,
  llm: LlmClient,
): Promise<void> {
  if (store.isConsolidating()) return;

  await store.rewriteMemoryUnderLock(async (entries) => {
    let merged = dedupeEntries(entries);
    try {
      merged = await mergeEntriesWithLlm(merged, llm);
    } catch {
      // rule-based dedupe only
    }
    return merged;
  });
}

/** Fire-and-forget wrapper around {@link mergeMemoryEntries}. */
export function scheduleMergeMemoryEntriesInBackground(
  store: ConsolidateStoreAccess,
  llm: LlmClient,
  opts: { onComplete?: () => void | Promise<void> } = {},
): void {
  void mergeMemoryEntries(store, llm)
    .then(() => opts.onComplete?.())
    .catch(() => {});
}
