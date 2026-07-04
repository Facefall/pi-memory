import type { AgentMessage } from "@earendil-works/pi-agent-core";
import {
  buildSessionContext,
  convertToLlm,
  getLatestCompactionEntry,
  parseSessionEntries,
  serializeConversation,
  type FileEntry,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";

import { stripPrivateMemory } from "../preflight/strip.js";
import { readTextRequired } from "../utils/fs.js";

function stripPrivateMemoryFromMessages(messages: AgentMessage[]): AgentMessage[] {
  return messages.map((message) => {
    if (message.role !== "user") return message;
    if (typeof message.content === "string") {
      return { ...message, content: stripPrivateMemory(message.content) };
    }
    return {
      ...message,
      content: message.content.map((block) =>
        block.type === "text" ? { ...block, text: stripPrivateMemory(block.text) } : block,
      ),
    } as AgentMessage;
  });
}

function toSessionEntries(fileEntries: FileEntry[]): SessionEntry[] {
  return fileEntries.filter((entry): entry is SessionEntry => entry.type !== "session");
}

function resolveLeafId(entries: SessionEntry[]): string | null {
  return entries.at(-1)?.id ?? null;
}

export async function readSessionConversationText(sessionFile: string): Promise<string | null> {
  const content = await readTextRequired(sessionFile);
  const fileEntries = parseSessionEntries(content);
  const entries = toSessionEntries(fileEntries);
  if (entries.length === 0) return null;

  const context = buildSessionContext(entries, resolveLeafId(entries));
  const messages = stripPrivateMemoryFromMessages(context.messages);
  if (messages.length === 0) return null;

  return serializeConversation(convertToLlm(messages));
}

export async function readLatestCompactionSummary(sessionFile: string): Promise<{
  compactionId: string;
  summary: string;
} | null> {
  const content = await readTextRequired(sessionFile);
  const fileEntries = parseSessionEntries(content);
  const entries = toSessionEntries(fileEntries);
  const compaction = getLatestCompactionEntry(entries);
  if (!compaction?.summary?.trim()) return null;
  return { compactionId: compaction.id, summary: compaction.summary };
}
