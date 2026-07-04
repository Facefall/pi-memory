import { SHUTDOWN_PROCESSED_FILE } from "../constants/memory.js";
import { joinPath, readText, writeText } from "../utils/fs.js";

export type ShutdownProcessedState = {
  processed: string[];
};

export type ShutdownSkipReason =
  | "missing_session"
  | "compaction_already_ingested"
  | "subagent_no_delta"
  | "no_export"
  | "no_llm"
  | "ingested_compaction"
  | "ingested_llm";

export function shutdownProcessedPath(agentDir: string): string {
  return joinPath(agentDir, SHUTDOWN_PROCESSED_FILE);
}

export async function readShutdownProcessedState(agentDir: string): Promise<ShutdownProcessedState> {
  const raw = await readText(shutdownProcessedPath(agentDir));
  if (!raw.trim()) return { processed: [] };
  try {
    const parsed = JSON.parse(raw) as ShutdownProcessedState;
    return { processed: Array.isArray(parsed.processed) ? parsed.processed : [] };
  } catch {
    return { processed: [] };
  }
}

export async function markShutdownProcessed(
  agentDir: string,
  sessionFile: string,
): Promise<void> {
  const state = await readShutdownProcessedState(agentDir);
  if (!state.processed.includes(sessionFile)) {
    state.processed.push(sessionFile);
  }
  await writeText(shutdownProcessedPath(agentDir), JSON.stringify(state, null, 2));
}

export function isShutdownProcessed(state: ShutdownProcessedState, sessionFile: string): boolean {
  return state.processed.includes(sessionFile);
}
