import path from "node:path";
import type { MemoryConfig } from "./config.js";
import { currentBundleReadable } from "./sidecar/bundle.js";
import { SidecarClient } from "./sidecar/client.js";
import { SidecarProcess } from "./sidecar/process.js";
import { openSessionIndex, type SessionIndex } from "./fallback/sessionIndex.js";
import { createTrainScheduler, type TrainScheduler, type SchedulerLog } from "./trainer/scheduler.js";
import type { ErrorClass } from "./errclass.js";
import type {
  HealthPayload,
  QueryIntent,
  ResponseEnvelope,
  ServiceStatus,
} from "./types.js";

export interface MemoryServiceStatus {
  status: ServiceStatus;
  reason?: string;
  health?: HealthPayload | null;
}

export interface QueryBatchResult {
  envelope: ResponseEnvelope | null;
  errorClass: ErrorClass;
  transportError?: Error;
}

/**
 * Mode B local memory: spawn tlm sidecar, query via Unix socket.
 * No Cloud puller — bundle must exist under bundleRoot/current.
 */
export class MemoryService {
  private serviceStatus: ServiceStatus = "disabled";
  private reason = "";
  private process: SidecarProcess | null = null;
  private client: SidecarClient | null = null;
  private abort: AbortController | null = null;
  private scheduler: TrainScheduler | null = null;
  private sessionIndex: SessionIndex | null = null;

  constructor(private cfg: MemoryConfig) {}

  getConfig(): MemoryConfig {
    return this.cfg;
  }

  status(): ServiceStatus {
    return this.serviceStatus;
  }

  getStatus(): MemoryServiceStatus {
    return {
      status: this.serviceStatus,
      reason: this.reason || undefined,
    };
  }

  getClient(): SidecarClient | null {
    return this.client;
  }

  async start(): Promise<void> {
    if (this.cfg.provider === "disabled") {
      this.serviceStatus = "disabled";
      return;
    }

    if (this.cfg.provider !== "local") {
      this.serviceStatus = "unavailable";
      this.reason = "cloud_mode_not_implemented_in_pi_memory_v0.1";
      return;
    }

    if (!currentBundleReadable(this.cfg.bundleRoot)) {
      this.serviceStatus = "unavailable";
      this.reason = "bundle_missing";
      return;
    }

    this.serviceStatus = "initializing";
    this.abort = new AbortController();
    this.process = new SidecarProcess(this.cfg);

    try {
      await this.process.resolveBinary();
    } catch {
      this.serviceStatus = "unavailable";
      this.reason = "tlm_binary_missing";
      return;
    }

    try {
      await this.process.spawn();
      await this.process.waitReady(this.abort.signal);
      this.client = this.process.getClient();
      this.serviceStatus = "ready";
      this.reason = "";
    } catch (err) {
      this.serviceStatus = "unavailable";
      this.reason =
        err instanceof Error ? err.message : "sidecar_startup_failed";
      await this.process.stop();
      this.process = null;
      this.client = null;
    }
  }

  /**
   * Start interval-based auto-training. If already running, stops and restarts.
   * Uses config.trainer.auto_interval.
   */
  startAutoTrainer(logger?: (log: SchedulerLog) => void): void {
    this.scheduler?.stop();
    this.scheduler = createTrainScheduler(
      {
        interval: this.cfg.trainer.auto_interval,
        trainConfig: {
          sessionsDir: this.cfg.sessionsDir,
          bundleRoot: this.cfg.bundleRoot,
        },
      },
      logger,
    );
  }

  /**
   * Trigger incremental session index build in the background (non-blocking).
   * Opens (or creates) the SQLite FTS5 DB at ~/.pi/memory/sessions.db.
   */
  startSessionIndex(): void {
    const dbPath = path.join(this.cfg.bundleRoot, "sessions.db");
    const idx = openSessionIndex(dbPath);
    if (!idx) return;
    this.sessionIndex = idx;
    void idx.incrementalIndex(this.cfg.sessionsDir).catch(() => {});
  }

  getSessionIndex(): SessionIndex | null {
    return this.sessionIndex;
  }

  async stop(): Promise<void> {
    this.abort?.abort();
    this.scheduler?.stop();
    this.scheduler = null;
    this.sessionIndex?.close();
    this.sessionIndex = null;
    await this.process?.stop();
    this.process = null;
    this.client = null;
    if (this.cfg.provider === "disabled") {
      this.serviceStatus = "disabled";
    } else {
      this.serviceStatus = "unavailable";
      this.reason = "stopped";
    }
  }

  async queryBatch(
    intents: QueryIntent[],
    signal?: AbortSignal,
  ): Promise<QueryBatchResult[]> {
    if (intents.length === 0) return [];
    return Promise.all(
      intents.map(async (intent) => {
        const r = await this.query(intent, signal);
        return {
          envelope: r.env,
          errorClass: r.errorClass,
          transportError: r.transportError,
        };
      }),
    );
  }

  async query(
    intent: QueryIntent,
    signal?: AbortSignal,
  ): Promise<{
    env: ResponseEnvelope | null;
    errorClass: ErrorClass;
    transportError?: Error;
  }> {
    if (this.serviceStatus !== "ready" || !this.client) {
      return { env: null, errorClass: "unavailable" };
    }
    const timeout = AbortSignal.timeout(this.cfg.queryTimeoutMs);
    const combined = signal
      ? AbortSignal.any([signal, timeout])
      : timeout;
    return this.client.query(intent, combined);
  }

  async health(): Promise<HealthPayload | null> {
    if (!this.client) return null;
    try {
      return await this.client.health();
    } catch {
      return null;
    }
  }
}
