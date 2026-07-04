import { readPiMemoryEnv, resolveEmbedDim } from "../config/env.js";
import { fetchIndexStats, ping } from "../sidecar/client.js";
import type { IndexStats } from "../sidecar/protocol.js";
import { resolveSidecarPaths } from "../sidecar/paths.js";
import { getVecStore } from "../sidecar/server/vec/store.js";
import { createMemoryStore } from "../store/index.js";
import type { MemoryStats } from "../store/types.js";
import { pathExists } from "../utils/fs.js";

import type { CliLog } from "./log.js";
import { theme } from "./theme.js";

export type MemoryStatusReport = {
  agentDir: string;
  memory: MemoryStats;
  sidecar: {
    socketPath: string;
    running: boolean;
  };
  vectorIndex: {
    dbPath: string;
    exists: boolean;
    generation?: number;
    chunkCount?: number;
    embeddingProvider?: string;
    embeddingModel?: string;
    embeddingDim?: number;
    /** Set when the index file exists but could not be read locally. */
    readError?: string;
    /** Stats came from sidecar RPC rather than opening sqlite in-process. */
    fromSidecar?: boolean;
  };
  embedder: {
    provider: string;
    model: string;
    dim: number;
  };
};

function applyLocalVecStats(
  report: MemoryStatusReport,
  dbPath: string,
): void {
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

function embedderMatchesIndex(report: MemoryStatusReport): boolean {
  const { embeddingProvider, embeddingModel, embeddingDim } = report.vectorIndex;
  if (!embeddingProvider || !embeddingModel || embeddingDim === undefined) return true;
  return (
    embeddingProvider === report.embedder.provider &&
    embeddingModel === report.embedder.model &&
    embeddingDim === report.embedder.dim
  );
}

export async function gatherMemoryStatus(agentDir: string): Promise<MemoryStatusReport> {
  const store = createMemoryStore({ agentDir });
  await store.ensureInitialized();

  const sidecar = resolveSidecarPaths(agentDir);
  const env = readPiMemoryEnv();
  const embedModel =
    env.embedder === "openai"
      ? env.openaiEmbedModel
      : env.embedder === "ollama"
        ? env.ollamaEmbedModel
        : "hash";

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
    embedder: {
      provider: env.embedder,
      model: embedModel,
      dim: resolveEmbedDim(embedModel, env.embedDimOverride),
    },
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

type MemoryStatusRow = {
  label: string;
  value: (themed: boolean) => string;
};

function formatVectorIndexLine(report: MemoryStatusReport): string {
  const { generation, chunkCount, readError } = report.vectorIndex;
  if (readError) {
    return `(unreadable: ${readError})`;
  }
  if (generation === undefined || chunkCount === undefined) {
    return "(unknown — start sidecar or run pi-memory status again)";
  }
  return `gen=${generation} chunks=${chunkCount}`;
}

function formatIndexEmbedderLine(report: MemoryStatusReport, themed: boolean): string {
  const { embeddingProvider, embeddingModel, embeddingDim, chunkCount, readError } = report.vectorIndex;
  if (readError) {
    return themed ? theme.dim("(unavailable)") : "(unavailable)";
  }
  if (!embeddingProvider || !embeddingModel || embeddingDim === undefined) {
    if (chunkCount === 0) {
      return themed ? theme.dim("(empty — reindex pending)") : "(empty — reindex pending)";
    }
    return themed ? theme.dim("(no embedding meta — run reindex)") : "(no embedding meta — run reindex)";
  }

  const label = `${embeddingProvider}/${embeddingModel} (${embeddingDim}d)`;
  if (embedderMatchesIndex(report)) {
    return label;
  }
  const mismatch = `${label} ≠ configured`;
  return themed ? theme.warn(mismatch) : mismatch;
}

function memoryStatusRows(report: MemoryStatusReport): MemoryStatusRow[] {
  const lastConsolidated = report.memory.lastConsolidatedAt ?? "(never)";
  const sidecarState = report.sidecar.running ? "running" : "not reachable";
  const sidecarDetail = `${sidecarState} (${report.sidecar.socketPath})`;

  const rows: MemoryStatusRow[] = [
    { label: "agent dir", value: () => report.agentDir },
    { label: "MEMORY lines", value: () => String(report.memory.lineCount) },
    { label: "entries", value: () => String(report.memory.entryCount) },
    { label: "overflow files", value: () => String(report.memory.overflowFileCount) },
    {
      label: "last consolidate",
      value: (themed) =>
        themed && !report.memory.lastConsolidatedAt
          ? theme.dim(lastConsolidated)
          : lastConsolidated,
    },
    {
      label: "sidecar",
      value: (themed) => {
        if (!themed) return sidecarDetail;
        const state = report.sidecar.running ? theme.ok(sidecarState) : theme.bad(sidecarState);
        return `${state} ${theme.dim(`(${report.sidecar.socketPath})`)}`;
      },
    },
  ];

  if (!report.vectorIndex.exists) {
    rows.push({
      label: "vector index",
      value: (themed) => (themed ? theme.dim("(missing — write MEMORY or start session)") : "(missing)"),
    });
  } else {
    rows.push({
      label: "vector index",
      value: (themed) => {
        const line = formatVectorIndexLine(report);
        if (themed && report.vectorIndex.readError) return theme.bad(line);
        if (themed && (report.vectorIndex.generation === undefined || report.vectorIndex.chunkCount === undefined)) {
          return theme.dim(line);
        }
        return line;
      },
    });
    rows.push({
      label: "index embedder",
      value: (themed) => formatIndexEmbedderLine(report, themed),
    });
  }

  rows.push({
    label: "configured embedder",
    value: () => `${report.embedder.provider}/${report.embedder.model} (${report.embedder.dim}d)`,
  });

  return rows;
}

export function formatMemoryStatusLines(report: MemoryStatusReport): string[] {
  return memoryStatusRows(report).map(
    ({ label, value }) => `${label.padEnd(16)} ${value(false)}`,
  );
}

export function printMemoryStatus(report: MemoryStatusReport, log: CliLog): void {
  for (const { label, value } of memoryStatusRows(report)) {
    log.line(label, value(true));
  }
}

export async function runStatusCommand(agentDir: string, log: CliLog): Promise<number> {
  const report = await gatherMemoryStatus(agentDir);
  printMemoryStatus(report, log);
  return 0;
}
