import path from "node:path";

import {
  defaultBundleRoot,
  defaultPiHome,
  defaultSessionsDir,
  defaultSocketPath,
  expandPath,
} from "./paths.js";

export type MemoryProvider = "disabled" | "local" | "cloud";

export type ExtractorType = "regex" | "llm";

export interface TrainerConfig {
  /** Which extractor to use (default "regex"). */
  extractor: ExtractorType;
  /** How many turns per LLM call when extractor is "llm" (default 10). */
  llm_batch_size: number;
  /** Auto-train interval: "1h"|"6h"|"12h"|"24h"|null (default null — disabled). */
  auto_interval: string | null;
}

export interface MemoryConfig {
  provider: MemoryProvider;
  tlmPath: string;
  socketPath: string;
  bundleRoot: string;
  sidecarReadyTimeoutMs: number;
  queryTimeoutMs: number;
  clientRequestTimeoutMs: number;
  sessionsDir: string;
  memoryMdPaths: string[];
  trainer: TrainerConfig;
}

export const defaultTrainerConfig: TrainerConfig = {
  extractor: "regex",
  llm_batch_size: 10,
  auto_interval: null,
};

export function defaultMemoryConfig(
  overrides: Partial<MemoryConfig> = {},
): MemoryConfig {
  const { trainer: trainerOverrides, ...rest } = overrides;
  return {
    provider: "local",
    tlmPath: "tlm",
    socketPath: defaultSocketPath(),
    bundleRoot: defaultBundleRoot(),
    sidecarReadyTimeoutMs: 15_000,
    queryTimeoutMs: 2_000,
    clientRequestTimeoutMs: 5_000,
    sessionsDir: defaultSessionsDir(),
    memoryMdPaths: [path.join(defaultPiHome(), "MEMORY.md")],
    trainer: { ...defaultTrainerConfig, ...trainerOverrides },
    ...rest,
  };
}

/** Normalize user-supplied paths after JSON/env load. */
export function normalizeMemoryConfig(
  raw: Partial<MemoryConfig> & Record<string, unknown>,
): MemoryConfig {
  const base = defaultMemoryConfig();
  const rawTrainer = (raw.trainer ?? {}) as Partial<TrainerConfig>;
  return {
    provider: (raw.provider as MemoryProvider) ?? base.provider,
    tlmPath: expandPath(String(raw.tlmPath ?? base.tlmPath)),
    socketPath: expandPath(String(raw.socketPath ?? base.socketPath)),
    bundleRoot: expandPath(String(raw.bundleRoot ?? base.bundleRoot)),
    sidecarReadyTimeoutMs: Number(
      raw.sidecarReadyTimeoutMs ?? base.sidecarReadyTimeoutMs,
    ),
    queryTimeoutMs: Number(raw.queryTimeoutMs ?? base.queryTimeoutMs),
    clientRequestTimeoutMs: Number(
      raw.clientRequestTimeoutMs ?? base.clientRequestTimeoutMs,
    ),
    sessionsDir: expandPath(String(raw.sessionsDir ?? base.sessionsDir)),
    memoryMdPaths: Array.isArray(raw.memoryMdPaths)
      ? raw.memoryMdPaths.map((p) => expandPath(String(p)))
      : base.memoryMdPaths,
    trainer: {
      extractor: (rawTrainer.extractor as ExtractorType) ?? base.trainer.extractor,
      llm_batch_size: Number(rawTrainer.llm_batch_size ?? base.trainer.llm_batch_size),
      auto_interval: rawTrainer.auto_interval !== undefined
        ? rawTrainer.auto_interval
        : base.trainer.auto_interval,
    },
  };
}
