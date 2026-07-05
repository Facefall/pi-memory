import type { MemoryStats } from "../store/types.js";

export type StatusPalette = {
  dim: (text: string) => string;
  ok: (text: string) => string;
  bad: (text: string) => string;
  warn: (text: string) => string;
};

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
