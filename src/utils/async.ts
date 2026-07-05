export const PREFLIGHT_ABORTED_MESSAGE = "aborted";
export const PREFLIGHT_TIMEOUT_MESSAGE = "preflight timeout";

/** Throw when `signal` is already aborted (matches legacy preflight fail-fast). */
export function throwIfAborted(
  signal?: AbortSignal,
  message = PREFLIGHT_ABORTED_MESSAGE,
): void {
  if (signal?.aborted) {
    throw new Error(message);
  }
}

/**
 * Merge a budget timeout with an optional caller `AbortSignal`.
 * Uses Node built-ins: AbortSignal.timeout + AbortSignal.any.
 */
export function mergeAbortSignals(timeoutMs: number, userSignal?: AbortSignal): AbortSignal {
  throwIfAborted(userSignal);

  if (timeoutMs <= 0) {
    throw new Error(PREFLIGHT_TIMEOUT_MESSAGE);
  }

  const timeout = AbortSignal.timeout(timeoutMs);
  return userSignal ? AbortSignal.any([timeout, userSignal]) : timeout;
}

/** Preflight budget + extension cancel. Alias for {@link mergeAbortSignals}. */
export function preflightAbortSignal(budgetMs: number, userSignal?: AbortSignal): AbortSignal {
  return mergeAbortSignals(budgetMs, userSignal);
}
