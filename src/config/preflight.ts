import { ENV_KEYS } from "../constants/env.js";
import {
  DEFAULT_INTENT_CACHE_ENABLED,
  DEFAULT_INTENT_RETRIES,
  DEFAULT_WARM_SIDECAR_ENABLED,
  MAX_INTENT_RETRIES,
} from "../constants/preflight.js";

export type PreflightRuntimeConfig = {
  intentRetries: number;
  warmSidecar: boolean;
  intentCache: boolean;
};

function parseOnOff(value: string | undefined, defaultOn: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultOn;
  const normalized = value.trim().toLowerCase();
  if (normalized === "0" || normalized === "false" || normalized === "no") return false;
  return true;
}

/** Runtime toggles for preflight latency optimizations. */
export function readPreflightRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): PreflightRuntimeConfig {
  const retries = Number.parseInt(env[ENV_KEYS.INTENT_RETRIES] ?? String(DEFAULT_INTENT_RETRIES), 10);
  return {
    intentRetries: Number.isFinite(retries)
      ? Math.min(Math.max(0, retries), MAX_INTENT_RETRIES)
      : DEFAULT_INTENT_RETRIES,
    warmSidecar: parseOnOff(env[ENV_KEYS.WARM_SIDECAR], DEFAULT_WARM_SIDECAR_ENABLED),
    intentCache: parseOnOff(env[ENV_KEYS.INTENT_CACHE], DEFAULT_INTENT_CACHE_ENABLED),
  };
}
