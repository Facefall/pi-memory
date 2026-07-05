import type { AgentMessage } from "@earendil-works/pi-agent-core";

import { PRIVATE_MEMORY_CLOSE, PRIVATE_MEMORY_OPEN } from "../../constants/preflight.js";

/** Stable dedupe key for memory entries (section + trimmed content). */
export function entryDedupeKey(entry: { section: string; content: string }): string {
  return `${entry.section}\0${entry.content.trim()}`;
}

/** Remove `<private_memory>...</private_memory>` blocks from plain text. */
export function stripPrivateMemory(text: string): string {
  let s = text;
  for (;;) {
    const i = s.indexOf(PRIVATE_MEMORY_OPEN);
    if (i < 0) return s;
    const rel = s.indexOf(PRIVATE_MEMORY_CLOSE, i);
    if (rel < 0) return s;

    let end = rel + PRIVATE_MEMORY_CLOSE.length;
    while (end < s.length && /[\n\r \t]/.test(s[end]!)) end++;

    let start = i;
    while (start > 0 && /[ \t]/.test(s[start - 1]!)) start--;
    if (start > 0 && s[start - 1] === "\n") {
      start--;
      if (start > 0 && s[start - 1] === "\r") start--;
    }

    s = s.slice(0, start) + s.slice(end);
  }
}

/** Strip private memory tags from user message text blocks before compaction or drain. */
export function stripPrivateMemoryFromMessages(messages: AgentMessage[]): AgentMessage[] {
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
