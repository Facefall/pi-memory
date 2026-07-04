import { SHUTDOWN_QUEUE_FILE } from "../constants/memory.js";
import { serializeJsonlFrame } from "../ipc/jsonlFramer.js";
import { appendText, joinPath } from "../utils/fs.js";

import type { SessionShutdownEvent } from "@earendil-works/pi-coding-agent";

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

export function readParentSession(header: Record<string, unknown> | null): string | undefined {
  const parent = header?.parentSession ?? header?.parent_session;
  return typeof parent === "string" && parent.trim().length > 0 ? parent.trim() : undefined;
}
