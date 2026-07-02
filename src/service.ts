import fs from "node:fs";
import path from "node:path";
import type { MemoryConfig } from "./config.js";
import { invalidateMemoryCaches } from "./cache/memoryCaches.js";
import { LocalGraphQuerier } from "./local/graphQuery.js";
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
  mode?: "sidecar" | "local_graph";
  health?: HealthPayload | null;
}

export interface QueryBatchResult {
  envelope: ResponseEnvelope | null;
  errorClass: ErrorClass;
  transportError?: Error;
}

/**
 * Local memory service with two query backends:
 * 1. tlm sidecar (Unix socket) — when tlm binary is available
 * 2. LocalGraphQuerier — direct graph.json query when tlm is missing
 *
 * Both require a bundle at bundleRoot/current.
 */
export class MemoryService {
  private serviceStatus: ServiceStatus = "disabled";
  private reason = "";
  private mode: "sidecar" | "local_graph" | null = null;
  private process: SidecarProcess | null = null;
  private client: SidecarClient | null = null;
  private localQuerier: LocalGraphQuerier | null = null;
  private abort: AbortController | null = null;
  private scheduler: TrainScheduler | null = null;
  private sessionIndex: SessionIndex | null = null;
  private bundleMtimes: { graph: number; manifest: number } | null = null;
  private lastBundleCheckMs = 0;
  private static readonly BUNDLE_CHECK_INTERVAL_MS = 5_000;

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
      mode: this.mode ?? undefined,
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

    if (await this.trySidecar()) return;

    if (this.tryLocalGraph()) return;

    this.serviceStatus = "unavailable";
    this.reason = "no_query_backend";
  }

  private async trySidecar(): Promise<boolean> {
    this.process = new SidecarProcess(this.cfg);
    try {
      await this.process.resolveBinary();
    } catch {
      this.process = null;
      return false;
    }

    try {
      await this.process.spawn();
      await this.process.waitReady(this.abort!.signal);
      this.client = this.process.getClient();
      this.serviceStatus = "ready";
      this.mode = "sidecar";
      this.reason = "";
      return true;
    } catch {
      await this.process.stop();
      this.process = null;
      this.client = null;
      return false;
    }
  }

  private tryLocalGraph(): boolean {
    const querier = new LocalGraphQuerier(this.cfg.bundleRoot);
    if (!querier.load()) return false;
    this.localQuerier = querier;
    this.serviceStatus = "ready";
    this.mode = "local_graph";
    this.reason = "";
    return true;
  }

  startAutoTrainer(logger?: (log: SchedulerLog) => void): void {
    this.scheduler?.stop();
    this.scheduler = createTrainScheduler(
      {
        interval: this.cfg.trainer.auto_interval,
        trainConfig: {
          sessionsDir: this.cfg.sessionsDir,
          bundleRoot: this.cfg.bundleRoot,
        },
        onSuccess: () => { void this.notifyBundleUpdated(); },
      },
      logger,
    );
  }

  /**
   * Check if the on-disk bundle has changed and hot-reload if needed.
   * Debounced to at most once per BUNDLE_CHECK_INTERVAL_MS to avoid excess stat calls.
   * For local_graph, reloads LocalGraphQuerier in-process.
   * For sidecar, issues a /bundle/reload request.
   * Invalidates all memory caches on successful reload.
   */
  async ensureFreshBundle(): Promise<void> {
    if (this.serviceStatus !== "ready") return;
    const now = Date.now();
    if (now - this.lastBundleCheckMs < MemoryService.BUNDLE_CHECK_INTERVAL_MS) return;
    this.lastBundleCheckMs = now;

    if (this.mode === "local_graph" && this.localQuerier) {
      const reloaded = this.localQuerier.reloadIfStale();
      if (reloaded) invalidateMemoryCaches();
      return;
    }

    if (this.mode === "sidecar" && this.client) {
      const graphPath = path.join(this.cfg.bundleRoot, "current", "graph.json");
      const manifestPath = path.join(this.cfg.bundleRoot, "current", "manifest.json");
      try {
        const graphMtime = fs.statSync(graphPath).mtimeMs;
        const manifestMtime = fs.statSync(manifestPath).mtimeMs;
        if (!this.bundleMtimes) {
          this.bundleMtimes = { graph: graphMtime, manifest: manifestMtime };
          return;
        }
        const changed =
          graphMtime !== this.bundleMtimes.graph ||
          manifestMtime !== this.bundleMtimes.manifest;
        if (!changed) return;
        this.bundleMtimes = { graph: graphMtime, manifest: manifestMtime };
        await this.client.reload();
        invalidateMemoryCaches();
      } catch {
        /* stat or reload failure — continue with current bundle */
      }
    }
  }

  /**
   * Force an immediate bundle freshness check (bypasses the debounce).
   * Called by the auto-trainer scheduler after a successful train run.
   */
  async notifyBundleUpdated(): Promise<void> {
    this.lastBundleCheckMs = 0;
    await this.ensureFreshBundle();
  }

  startSessionIndex(): void {
    const dbDir = this.cfg.bundleRoot;
    try {
      fs.mkdirSync(dbDir, { recursive: true });
    } catch {
      return;
    }
    const dbPath = path.join(dbDir, "sessions.db");
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
    this.localQuerier = null;
    this.mode = null;
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
    if (this.serviceStatus !== "ready") {
      return { env: null, errorClass: "unavailable" };
    }
    await this.ensureFreshBundle();

    if (this.client && this.mode === "sidecar") {
      const timeout = AbortSignal.timeout(this.cfg.queryTimeoutMs);
      const combined = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;
      return this.client.query(intent, combined);
    }

    if (this.localQuerier && this.mode === "local_graph") {
      return this.localQuerier.query(intent);
    }

    return { env: null, errorClass: "unavailable" };
  }

  async health(): Promise<HealthPayload | null> {
    if (this.client) {
      try {
        return await this.client.health();
      } catch {
        return null;
      }
    }
    if (this.localQuerier) {
      return {
        ready: true,
        compatibility: "local_graph",
        protocol_version: 1,
        uptime_secs: 0,
        status_message: `local graph query (${this.localQuerier.isLoaded() ? "loaded" : "not loaded"})`,
      };
    }
    return null;
  }
}
