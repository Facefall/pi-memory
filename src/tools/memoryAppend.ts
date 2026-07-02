import fs from "node:fs/promises";
import { open } from "node:fs/promises";
import path from "node:path";

import type { ToolResult } from "../types.js";

export const MEMORY_APPEND_NAME = "memory_append";

export const MEMORY_APPEND_DESCRIPTION =
  "Append new entries to MEMORY.md. Use this instead of file_write or file_edit for memory updates. " +
  "Writes are append-only with a simple lock to avoid concurrent clobber.";

export const MEMORY_APPEND_PROMPT_SNIPPET = "Append durable notes to MEMORY.md";

export const MEMORY_APPEND_PROMPT_GUIDELINES = [
  "Use memory_append to persist user preferences or facts the user explicitly asked to remember — not for transient task state.",
] as const;

export const MEMORY_APPEND_PARAMETERS = {
  type: "object",
  properties: {
    content: {
      type: "string",
      description:
        "New entries to append (markdown bullet points). Write in English by default.",
    },
  },
  required: ["content"],
} as const;

const LOCK_RETRIES = 50;
const LOCK_DELAY_MS = 20;

async function withAppendLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
): Promise<T> {
  let handle;
  for (let i = 0; i < LOCK_RETRIES; i++) {
    try {
      handle = await open(lockPath, "wx");
      break;
    } catch {
      await new Promise((r) => setTimeout(r, LOCK_DELAY_MS));
    }
  }
  if (!handle) {
    throw new Error("could not acquire MEMORY.md append lock");
  }
  try {
    return await fn();
  } finally {
    await handle.close();
    await fs.unlink(lockPath).catch(() => {});
  }
}

export async function appendToMemoryMd(
  memoryMdPath: string,
  content: string,
): Promise<void> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error("content must not be empty");
  }
  await fs.mkdir(path.dirname(memoryMdPath), { recursive: true, mode: 0o700 });
  const lockPath = `${memoryMdPath}.append.lock`;
  const block = content.endsWith("\n") ? content : `${content}\n`;
  await withAppendLock(lockPath, async () => {
    await fs.appendFile(memoryMdPath, block, { encoding: "utf8", mode: 0o600 });
  });
}

export class MemoryAppendTool {
  constructor(private readonly memoryMdPath: string) {}

  info() {
    return {
      name: MEMORY_APPEND_NAME,
      description: MEMORY_APPEND_DESCRIPTION,
      parameters: MEMORY_APPEND_PARAMETERS,
    };
  }

  async run(argsJson: string): Promise<ToolResult> {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(argsJson) as Record<string, unknown>;
    } catch (e) {
      return {
        content: `invalid arguments: ${e instanceof Error ? e.message : e}`,
        isError: true,
      };
    }
    const content = typeof raw.content === "string" ? raw.content : "";
    if (!content.trim()) {
      return { content: "content must not be empty", isError: true };
    }
    try {
      await appendToMemoryMd(this.memoryMdPath, content);
      return { content: `appended to ${this.memoryMdPath}` };
    } catch (e) {
      return {
        content: `error appending: ${e instanceof Error ? e.message : e}`,
        isError: true,
      };
    }
  }
}

export function createMemoryAppendTool(memoryMdPath: string): MemoryAppendTool {
  return new MemoryAppendTool(memoryMdPath);
}
