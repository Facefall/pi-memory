import fs from "node:fs";
import path from "node:path";

import { getAgentDir } from "@earendil-works/pi-coding-agent";

import {
  defaultMemoryConfig,
  normalizeMemoryConfig,
  type ExtractorType,
  type MemoryConfig,
  type MemoryProvider,
  type TrainerConfig,
} from "./config.js";

export interface MemorySettingsFile {
  provider?: MemoryProvider;
  tlmPath?: string;
  socketPath?: string;
  bundleRoot?: string;
  sidecarReadyTimeoutMs?: number;
  queryTimeoutMs?: number;
  clientRequestTimeoutMs?: number;
  sessionsDir?: string;
  memoryMdPaths?: string[];
  /** LLM for intent detection, rerank, and LLM extraction. Overrides default helper model. */
  helperModel?: string;
  trainer?: Partial<TrainerConfig>;
}

export interface LoadedMemorySettings {
  config: MemoryConfig;
  helperModel: string | undefined;
  configPath: string;
}

/** Default path: ~/.pi/agent/memory.json */
export function defaultMemoryConfigPath(): string {
  return path.join(getAgentDir(), "memory.json");
}

function readMemorySettingsFile(configPath = defaultMemoryConfigPath()): MemorySettingsFile {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    return parsed as MemorySettingsFile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new Error(
      `Failed to load pi-memory config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Load pi-memory config from ~/.pi/agent/memory.json. */
export function loadMemorySettings(
  overrides: Partial<MemoryConfig> = {},
  configPath = defaultMemoryConfigPath(),
): LoadedMemorySettings {
  const fileSettings = readMemorySettingsFile(configPath);
  const { helperModel, trainer, ...configFields } = fileSettings;

  const config = normalizeMemoryConfig({
    ...configFields,
    ...(trainer ? { trainer } : {}),
    ...overrides,
  } as Partial<MemoryConfig> & Record<string, unknown>);

  return {
    config,
    helperModel: helperModel?.trim() || undefined,
    configPath,
  };
}

/** Convenience alias when only MemoryConfig is needed. */
export function loadMemoryConfig(
  overrides: Partial<MemoryConfig> = {},
  configPath = defaultMemoryConfigPath(),
): MemoryConfig {
  return loadMemorySettings(overrides, configPath).config;
}

export function resolveHelperModelSpec(
  flagValue: string | boolean | undefined,
  settingsHelperModel: string | undefined,
): string | undefined {
  if (typeof flagValue === "string" && flagValue.trim()) {
    return flagValue.trim();
  }
  return settingsHelperModel;
}

export { defaultMemoryConfig };
export type { ExtractorType, MemoryProvider, TrainerConfig };
