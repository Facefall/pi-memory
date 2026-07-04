import type { LlmClient } from "../adapters/llm/types.js";
import {
  filterCompactionDelta,
  shouldSkipSubagentCompactionIngest,
} from "../compact/subagentDelta.js";
import { parseMemoryExport } from "../compact/parseMemoryExport.js";
import { reindex } from "../sidecar/client.js";
import { ensureSidecarRunning } from "../sidecar/sidecarManager.js";
import { resolveSidecarPaths } from "../sidecar/paths.js";
import { sidecarQueryCache } from "../preflight/queryCache.js";
import type { MemoryStore } from "../store/memoryStore.js";
import { canRead, pathExists } from "../utils/fs.js";

import {
  buildShutdownMemoryExportPrompt,
  wrapShutdownExportMarkdown,
} from "./extractPrompt.js";
import { markShutdownProcessed, readShutdownProcessedState, isShutdownProcessed } from "./processed.js";
import { readShutdownQueueEntries } from "./readQueue.js";
import type { ShutdownQueueEntry } from "./enqueue.js";
import { readLatestCompactionSummary, readSessionConversationText } from "./sessionReader.js";

export type DrainShutdownQueueStats = {
  queued: number;
  skipped: number;
  ingested: number;
  appended: number;
  indexGeneration?: number;
};

export type RunDrainShutdownQueueOptions = {
  store: MemoryStore;
  agentDir: string;
  llm?: LlmClient | null;
  reindex?: boolean;
};

export type RunDrainShutdownQueueResult =
  | { status: "empty" }
  | { status: "drained"; stats: DrainShutdownQueueStats }
  | { status: "failed"; error: Error };

export async function runDrainShutdownQueueJob(
  opts: RunDrainShutdownQueueOptions,
): Promise<RunDrainShutdownQueueResult> {
  const queue = await readShutdownQueueEntries(opts.agentDir);
  if (queue.length === 0) return { status: "empty" };

  const processedState = await readShutdownProcessedState(opts.agentDir);
  const stats: DrainShutdownQueueStats = {
    queued: queue.length,
    skipped: 0,
    ingested: 0,
    appended: 0,
  };

  try {
    for (const entry of queue) {
      const sessionFile = entry.sessionFile.trim();
      if (isShutdownProcessed(processedState, sessionFile)) {
        stats.skipped += 1;
        continue;
      }

      const result = await drainQueueEntry({
        entry,
        store: opts.store,
        agentDir: opts.agentDir,
        llm: opts.llm ?? null,
      });
      stats.appended += result.appended;
      if (result.appended > 0) {
        stats.ingested += 1;
      } else {
        stats.skipped += 1;
      }
    }

    if (stats.appended > 0 && opts.reindex !== false) {
      stats.indexGeneration = await syncSidecarIndex(opts.agentDir, opts.store);
    }

    return { status: "drained", stats };
  } catch (error) {
    return {
      status: "failed",
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

async function drainQueueEntry(opts: {
  entry: ShutdownQueueEntry;
  store: MemoryStore;
  agentDir: string;
  llm: LlmClient | null;
}): Promise<{ appended: number }> {
  const sessionFile = opts.entry.sessionFile.trim();
  if (!sessionFile) {
    return { appended: 0 };
  }

  if (!pathExists(sessionFile) || !canRead(sessionFile)) {
    await markShutdownProcessed(opts.agentDir, sessionFile);
    return { appended: 0 };
  }

  const compaction = await readLatestCompactionSummary(sessionFile);
  if (compaction && (await opts.store.hasProcessedCompaction(compaction.compactionId))) {
    await markShutdownProcessed(opts.agentDir, sessionFile);
    return { appended: 0 };
  }

  if (compaction) {
    const appended = await ingestFromSummary({
      store: opts.store,
      agentDir: opts.agentDir,
      sessionFile,
      summary: compaction.summary,
      compactionId: compaction.compactionId,
      subagent: opts.entry.isSubagent,
    });
    return { appended };
  }

  if (!opts.llm) {
    await markShutdownProcessed(opts.agentDir, sessionFile);
    return { appended: 0 };
  }

  const conversationText = await readSessionConversationText(sessionFile);
  if (!conversationText?.trim()) {
    await markShutdownProcessed(opts.agentDir, sessionFile);
    return { appended: 0 };
  }

  const prompt = buildShutdownMemoryExportPrompt(conversationText);
  const raw = await opts.llm.complete(prompt);
  const summary = wrapShutdownExportMarkdown(raw);
  if (!summary.trim()) {
    await markShutdownProcessed(opts.agentDir, sessionFile);
    return { appended: 0 };
  }

  const appended = await ingestFromSummary({
    store: opts.store,
    agentDir: opts.agentDir,
    sessionFile,
    summary,
    subagent: opts.entry.isSubagent,
  });
  return { appended };
}

async function ingestFromSummary(opts: {
  store: MemoryStore;
  agentDir: string;
  sessionFile: string;
  summary: string;
  compactionId?: string;
  subagent?: boolean;
}): Promise<number> {
  const parsed = parseMemoryExport(opts.summary);
  if (parsed.length === 0) {
    if (opts.compactionId) {
      await opts.store.markCompactionProcessed(opts.compactionId);
    }
    await markShutdownProcessed(opts.agentDir, opts.sessionFile);
    return 0;
  }

  let entries = parsed;
  if (opts.subagent) {
    const existing = await opts.store.listEntries();
    entries = filterCompactionDelta(parsed, existing);
    if (shouldSkipSubagentCompactionIngest(parsed, entries)) {
      if (opts.compactionId) {
        await opts.store.markCompactionProcessed(opts.compactionId);
      }
      await markShutdownProcessed(opts.agentDir, opts.sessionFile);
      return 0;
    }
  }

  if (entries.length > 0) {
    await opts.store.appendMany(entries, { mode: "ifAbsent" });
  }

  if (opts.compactionId) {
    await opts.store.markCompactionProcessed(opts.compactionId);
  }
  await markShutdownProcessed(opts.agentDir, opts.sessionFile);
  return entries.length;
}

async function syncSidecarIndex(agentDir: string, store: MemoryStore): Promise<number> {
  const sidecar = resolveSidecarPaths(agentDir);
  await ensureSidecarRunning(sidecar);
  const result = await reindex(sidecar.socketPath, await store.exportForIndex());
  sidecarQueryCache.onReindexComplete(agentDir, result.index_generation);
  return result.index_generation;
}
