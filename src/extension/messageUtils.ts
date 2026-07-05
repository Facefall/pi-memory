import type { AgentMessage } from "@earendil-works/pi-agent-core";

export function getUserMessageText(message: AgentMessage): string | null {
  if (message.role !== "user") return null;
  if (typeof message.content === "string") return message.content;
  return message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

export function setUserMessageText(message: AgentMessage, text: string): AgentMessage {
  if (message.role !== "user") return message;
  return { ...message, content: text } as AgentMessage;
}

export function findLastUserMessageIndex(messages: AgentMessage[]): number {
  return messages.findLastIndex((message) => message.role === "user");
}
