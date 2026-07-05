import { readPiMemoryEnv, resolveEmbedDim } from "../config/env.js";
import { DEFAULT_HASH_EMBED_DIM } from "../constants/env.js";
import { createEmbedder } from "../adapters/embed/factory.js";
import { fetchIndexStats, ping } from "../sidecar/client.js";
import type { IndexStats } from "../sidecar/protocol.js";
import { resolveSidecarPaths } from "../sidecar/paths.js";
import { getVecStore } from "../sidecar/server/vec/store.js";
import { createMemoryStore } from "../store/index.js";
import { pathExists } from "../utils/fs.js";

import type { MemoryStatusReport } from "./types.js";

function applyLocalVecStats(report: MemoryStatusReport, dbPath: string): void {
  const vec = getVecStore(dbPath);
  report.vectorIndex.generation = vec.getIndexGeneration();
  report.vectorIndex.chunkCount = vec.getChunkCount();
  const meta = vec.getStoredEmbeddingMeta();
  if (meta) {
    report.vectorIndex.embeddingProvider = meta.provider;
    report.vectorIndex.embeddingModel = meta.model;
    report.vectorIndex.embeddingDim = meta.dim;
  }
}

function applySidecarVecStats(report: MemoryStatusReport, stats: IndexStats): void {
  report.vectorIndex.fromSidecar = true;
  report.vectorIndex.generation = stats.index_generation;
  report.vectorIndex.chunkCount = stats.chunk_count;
  if (stats.embedding_provider && stats.embedding_model && stats.embedding_dim !== undefined) {
    report.vectorIndex.embeddingProvider = stats.embedding_provider;
    report.vectorIndex.embeddingModel = stats.embedding_model;
    report.vectorIndex.embeddingDim = stats.embedding_dim;
  }
}

function resolveConfiguredEmbedder(env: ReturnType<typeof readPiMemoryEnv>): MemoryStatusReport["embedder"] {
  try {
    const embedder = createEmbedder(env);
    return { provider: embedder.provider, model: embedder.model, dim: embedder.dim };
  } catch {
    const embedModel =
      env.embedder === "openai"
        ? env.openaiEmbedModel
        : env.embedder === "ollama"
          ? env.ollamaEmbedModel
          : "hash/dev";
    const dim =
      env.embedder === "hash"
        ? (env.embedDimOverride ?? DEFAULT_HASH_EMBED_DIM)
        : resolveEmbedDim(embedModel, env.embedDimOverride);
    return { provider: env.embedder, model: embedModel, dim };
  }
}

export async function gatherMemoryStatus(agentDir: string): Promise<MemoryStatusReport> {
  const store = createMemoryStore({ agentDir });
  await store.ensureInitialized();

  const sidecar = resolveSidecarPaths(agentDir);
  const env = readPiMemoryEnv();

  const sidecarRunning = await ping(sidecar.socketPath);

  const report: MemoryStatusReport = {
    agentDir,
    memory: await store.getStats(),
    sidecar: {
      socketPath: sidecar.socketPath,
      running: sidecarRunning,
    },
    vectorIndex: {
      dbPath: sidecar.dbPath,
      exists: pathExists(sidecar.dbPath),
    },
    embedder: resolveConfiguredEmbedder(env),
  };

  if (!report.vectorIndex.exists) return report;

  if (sidecarRunning) {
    const result = await fetchIndexStats(sidecar.socketPath);
    if ("stats" in result) {
      applySidecarVecStats(report, result.stats);
      return report;
    }
    const hint = result.error.includes("unknown frame type")
      ? "restart sidecar (reload Pi session or pi-memory)"
      : result.error;
    report.vectorIndex.readError = hint;
    return report;
  }

  try {
    applyLocalVecStats(report, sidecar.dbPath);
  } catch (error) {
    report.vectorIndex.readError =
      error instanceof Error ? error.message : "unable to open vector index (start sidecar)";
  }

  return report;
}
