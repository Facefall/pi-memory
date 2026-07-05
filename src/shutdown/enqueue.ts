import { SHUTDOWN_QUEUE_FILE } from "../constants/memory.js";
import { serializeJsonlFrame } from "../utils/jsonl.js";
import { appendText, joinPath } from "../utils/fs.js";

import type { SessionShutdownEvent } from "@earendil-works/pi-coding-agent";

export { readParentSession } from "../utils/session/index.js";

export type ShutdownQueueEntry = {
  sessionFile: string;
  parentSession?: string;
  reason: SessionShutdownEvent["reason"];
  isSubagent: boolean;
  enqueuedAt: string;
};

export function shutdownQueuePath(agentDir: string): string {
  return joinPath(agentDir, SHUTDOWN_QUEUE_FILE);
}

export async function enqueueShutdownMetadata(
  agentDir: string,
  entry: ShutdownQueueEntry,
): Promise<void> {
  await appendText(shutdownQueuePath(agentDir), serializeJsonlFrame(entry));
}
