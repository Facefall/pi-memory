import {
  DEFAULT_PREFLIGHT_BUDGET_MS,
  MAX_PREFLIGHT_BUDGET_MS,
  MIN_PREFLIGHT_BUDGET_MS,
  MIN_PREFLIGHT_SIDECAR_RESERVE_MS,
} from "../constants/timing.js";

export type PreflightBudget = {
  totalMs: number;
  intentMs: number;
  sidecarMs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Split shared preflight deadline between QueryIntent LLM and sidecar query. */
export function resolvePreflightBudget(totalMs = DEFAULT_PREFLIGHT_BUDGET_MS): PreflightBudget {
  const total = clamp(totalMs, MIN_PREFLIGHT_BUDGET_MS, MAX_PREFLIGHT_BUDGET_MS);
  const intentMs = clamp(
    Math.floor(total * 0.3),
    100,
    total - MIN_PREFLIGHT_SIDECAR_RESERVE_MS,
  );
  return {
    totalMs: total,
    intentMs,
    sidecarMs: total - intentMs,
  };
}

export { DEFAULT_PREFLIGHT_BUDGET_MS } from "../constants/timing.js";
