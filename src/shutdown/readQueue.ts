import { parseJsonlLine } from "../utils/jsonl.js";
import { readText } from "../utils/fs.js";

import { shutdownQueuePath, type ShutdownQueueEntry } from "./enqueue.js";

/** Latest queue row per session file (deduped). */
export async function readShutdownQueueEntries(agentDir: string): Promise<ShutdownQueueEntry[]> {
  const raw = await readText(shutdownQueuePath(agentDir));
  if (!raw.trim()) return [];

  const bySession = new Map<string, ShutdownQueueEntry>();

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = parseJsonlLine<ShutdownQueueEntry>(trimmed);
      if (!entry.sessionFile?.trim()) continue;
      bySession.set(entry.sessionFile, entry);
    } catch {
      // skip malformed lines
    }
  }

  return [...bySession.values()];
}
