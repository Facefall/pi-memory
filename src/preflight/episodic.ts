import { readPreflightRuntimeConfig } from "../config/preflight.js";
import { resolvePreflightBudget } from "../config/preflightBudget.js";
import type { LlmClient } from "../adapters/llm/types.js";
import { debugMemory } from "../utils/debugLog.js";
import { nowMs, remainingMs } from "../utils/time.js";
import type { MemoryStore } from "../store/memoryStore.js";
import { query } from "../sidecar/client.js";
import {
  buildRetrievalQuery,
  extractQueryIntent,
  shouldRunEpisodicPreflight,
} from "./queryIntent.js";
import { sidecarQueryCache } from "./queryCache.js";
import {
  renderFallbackPrivateMemory,
  renderSidecarPrivateMemory,
} from "./render.js";

export type EpisodicPreflightOptions = {
  socketPath: string;
  agentDir: string;
  store: MemoryStore;
  llm?: LlmClient | null;
  /** Force episodic gate (first turn); does not force helper LLM. */
  forceEpisodic?: boolean;
  /** Force helper LLM intent extraction. */
  forceIntent?: boolean;
  /** @deprecated Use forceEpisodic */
  force?: boolean;
  sessionId?: string;
  budgetMs?: number;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type EpisodicPreflightResult = {
  privateContext: string;
};

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) {
    throw new Error("aborted");
  }
  if (timeoutMs <= 0) {
    throw new Error("preflight timeout");
  }

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("preflight timeout")), timeoutMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error("aborted"));
    };

    signal?.addEventListener("abort", onAbort, { once: true });

    promise.then(
      (value) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Fail-silent episodic preflight: QueryIntent (optional) → buildRetrievalQuery → sidecar.query → fallback.
 */
export async function runEpisodicPreflight(
  userInput: string,
  options: EpisodicPreflightOptions,
): Promise<EpisodicPreflightResult | null> {
  const startedAt = nowMs();
  const forceEpisodic = options.forceEpisodic ?? options.force ?? false;
  const runtime = readPreflightRuntimeConfig();

  try {
    if (await options.store.isEmpty()) {
      debugMemory("preflight", "skipped", { reason: "empty" });
      return null;
    }

    if (!shouldRunEpisodicPreflight(userInput, forceEpisodic)) {
      debugMemory("preflight", "skipped", { reason: "gate" });
      return null;
    }

    options.onProgress?.("Searching memory...");
    const budget = resolvePreflightBudget(options.budgetMs);
    const deadline = nowMs() + budget.totalMs;

    const intentStartedAt = nowMs();
    const intentBudget = Math.min(budget.intentMs, remainingMs(deadline));
    let intent;
    let intentSkipped = false;
    let intentCacheHit = false;

    try {
      const extracted = await withTimeout(
        extractQueryIntent(userInput, options.llm ?? null, {
          forceIntent: options.forceIntent,
          signal: options.signal,
          sessionId: options.sessionId,
          intentCache: runtime.intentCache,
        }),
        intentBudget,
        options.signal,
      );
      intent = extracted.intent;
      intentSkipped = extracted.skipped;
      intentCacheHit = extracted.cacheHit;
    } catch {
      intent = { raw_query: userInput.trim() };
    }
    const intentMs = nowMs() - intentStartedAt;

    const retrievalQuery = buildRetrievalQuery(intent, userInput);
    const cached = sidecarQueryCache.get(options.agentDir, retrievalQuery);

    let privateContext = "";
    let cacheHit = false;
    let sidecarMs = 0;
    let resultCount = 0;
    let usedFallback = false;

    if (cached) {
      cacheHit = true;
      resultCount = cached.length;
      privateContext = renderSidecarPrivateMemory(retrievalQuery, cached);
    } else {
      const sidecarStartedAt = nowMs();
      const queryBudget = Math.min(budget.sidecarMs, remainingMs(deadline));
      try {
        const result = await withTimeout(
          query(options.socketPath, retrievalQuery, queryBudget),
          queryBudget,
          options.signal,
        );
        sidecarMs = nowMs() - sidecarStartedAt;
        resultCount = result.results.length;
        sidecarQueryCache.set(options.agentDir, retrievalQuery, result.results);
        privateContext = renderSidecarPrivateMemory(retrievalQuery, result.results);
      } catch {
        sidecarMs = nowMs() - sidecarStartedAt;
        // sidecar unavailable or timed out → fallback
      }
    }

    if (!privateContext.trim()) {
      usedFallback = true;
      const fallback = await options.store.readForFallback();
      privateContext = renderFallbackPrivateMemory(fallback);
      resultCount = fallback.trim() ? 1 : 0;
    }

    debugMemory("preflight", "recall", {
      intent_ms: intentMs,
      intent_skipped: intentSkipped,
      intent_cache_hit: intentCacheHit,
      sidecar_ms: sidecarMs,
      total_ms: nowMs() - startedAt,
      cache_hit: cacheHit,
      fallback: usedFallback,
      results: resultCount,
    });

    if (!privateContext.trim()) return null;
    return { privateContext };
  } catch {
    debugMemory("preflight", "failed", { total_ms: nowMs() - startedAt });
    return null;
  }
}
