import { fetchIndexStats, ping, query } from "./client.js";
import { SIDECAR_WARMUP_QUERY_TIMEOUT_MS } from "../constants/timing.js";
import { debugMemory } from "../utils/debugLog.js";
import { nowMs } from "../utils/time.js";

export type WarmSidecarOptions = {
  queryTimeoutMs?: number;
};

/** Pre-open sidecar DB and optionally smoke-test embed + vec paths. Fail-silent. */
export async function warmSidecar(
  socketPath: string,
  options: WarmSidecarOptions = {},
): Promise<void> {
  const startedAt = nowMs();

  if (!(await ping(socketPath))) {
    debugMemory("sidecar", "warm", { ok: false, reason: "ping" });
    return;
  }

  const statsStartedAt = nowMs();
  const statsResult = await fetchIndexStats(socketPath);
  const statsMs = nowMs() - statsStartedAt;

  if ("error" in statsResult) {
    debugMemory("sidecar", "warm", { ok: false, stats_ms: statsMs, reason: "stats" });
    return;
  }

  let queryMs = 0;
  if (statsResult.stats.chunk_count > 0) {
    const queryStartedAt = nowMs();
    const queryTimeoutMs = options.queryTimeoutMs ?? SIDECAR_WARMUP_QUERY_TIMEOUT_MS;
    try {
      await query(socketPath, ".", queryTimeoutMs);
    } catch {
      // warm query is best-effort
    }
    queryMs = nowMs() - queryStartedAt;
  }

  debugMemory("sidecar", "warm", {
    ok: true,
    stats_ms: statsMs,
    query_ms: queryMs,
    chunks: statsResult.stats.chunk_count,
    total_ms: nowMs() - startedAt,
  });
}
