import { trainBundle, type TrainBundleConfig, type TrainBundleResult } from "./index.js";

export interface SchedulerConfig {
  /** Interval string: "1h", "6h", "12h", "24h", or null to disable. */
  interval: string | null;
  /** Passed through to trainBundle. */
  trainConfig?: Omit<TrainBundleConfig, "full" | "dryRun">;
  /** Called after a successful train tick (no error). Use to notify MemoryService. */
  onSuccess?: () => void;
}

export interface TrainScheduler {
  /** Stop the scheduler. Safe to call multiple times. */
  stop(): void;
  /** Whether the scheduler is currently running. */
  running(): boolean;
}

export interface SchedulerLog {
  timestamp: string;
  sessionsProcessed: number;
  entityCount: number;
  relationCount: number;
  eventCount: number;
  durationMs: number;
  error?: string;
}

const INTERVAL_MAP: Record<string, number> = {
  "1h": 3_600_000,
  "6h": 21_600_000,
  "12h": 43_200_000,
  "24h": 86_400_000,
};

/** Parse interval string to milliseconds. Returns null if disabled/invalid. */
export function parseInterval(interval: string | null | undefined): number | null {
  if (!interval) return null;
  const ms = INTERVAL_MAP[interval.trim().toLowerCase()];
  return ms ?? null;
}

export type SchedulerLogger = (log: SchedulerLog) => void;

/**
 * Create an interval-based trainer that runs `trainBundle()` periodically.
 * Runs one tick immediately on start, then repeats at the configured interval.
 */
export function createTrainScheduler(
  config: SchedulerConfig,
  logger?: SchedulerLogger,
): TrainScheduler {
  const intervalMs = parseInterval(config.interval);
  if (intervalMs == null) {
    return { stop() {}, running() { return false; } };
  }

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let tickInProgress = false;

  async function tick(): Promise<void> {
    if (stopped || tickInProgress) return;
    tickInProgress = true;
    const start = Date.now();
    let result: TrainBundleResult | null = null;
    let error: string | undefined;
    try {
      result = await trainBundle({
        ...config.trainConfig,
        full: false,
        dryRun: false,
      });
      config.onSuccess?.();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    const durationMs = Date.now() - start;
    logger?.({
      timestamp: new Date().toISOString(),
      sessionsProcessed: result?.sessionsProcessed ?? 0,
      entityCount: result?.entityCount ?? 0,
      relationCount: result?.relationCount ?? 0,
      eventCount: result?.eventCount ?? 0,
      durationMs,
      error,
    });
    tickInProgress = false;
  }

  // Fire first tick asynchronously, then schedule repeating
  void tick();
  timer = setInterval(() => void tick(), intervalMs);

  return {
    stop() {
      stopped = true;
      if (timer != null) {
        clearInterval(timer);
        timer = null;
      }
    },
    running() {
      return !stopped && timer != null;
    },
  };
}
