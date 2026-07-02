import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export interface SessionTurn {
  role: string;
  content: string;
  turnIndex: number;
}

export interface LoadedSession {
  id: string;
  title: string;
  createdAt: string;
  filePath: string;
  modifiedAt: Date;
  turns: SessionTurn[];
}

interface PiSessionMessage {
  role?: string;
  content?: unknown;
}

interface PiSessionFile {
  id?: string;
  title?: string;
  created_at?: string;
  messages?: PiSessionMessage[];
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (typeof block === "string") {
      parts.push(block);
      continue;
    }
    if (block && typeof block === "object") {
      const b = block as Record<string, unknown>;
      if (typeof b.text === "string") parts.push(b.text);
      else if (typeof b.content === "string") parts.push(b.content);
    }
  }
  return parts.join("\n");
}

export interface SessionLoaderOptions {
  sessionsDir: string;
  modifiedAfter?: Date | null;
}

/**
 * Scan session JSON files, parse Pi session format, optionally filter by
 * modified-after timestamp for incremental training.
 */
export async function loadSessions(
  opts: SessionLoaderOptions,
): Promise<LoadedSession[]> {
  const { sessionsDir, modifiedAfter } = opts;
  if (!sessionsDir.trim()) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return [];
  }

  const sessions: LoadedSession[] = [];

  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(sessionsDir, name);

    let st: Awaited<ReturnType<typeof fs.stat>>;
    try {
      st = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    if (modifiedAfter && st.mtime <= modifiedAfter) {
      continue;
    }

    let session: PiSessionFile;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      session = JSON.parse(raw) as PiSessionFile;
    } catch {
      continue;
    }

    if (!session.messages || session.messages.length === 0) continue;

    const turns: SessionTurn[] = [];
    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i]!;
      const text = messageText(msg.content);
      if (!text.trim()) continue;
      turns.push({
        role: msg.role ?? "unknown",
        content: text,
        turnIndex: i,
      });
    }

    if (turns.length === 0) continue;

    sessions.push({
      id: session.id ?? path.basename(name, ".json"),
      title: session.title ?? "",
      createdAt: session.created_at ?? "",
      filePath,
      modifiedAt: st.mtime,
      turns,
    });
  }

  sessions.sort((a, b) => a.modifiedAt.getTime() - b.modifiedAt.getTime());
  return deduplicateSessions(sessions);
}

function deduplicateSessions(sessions: LoadedSession[]): LoadedSession[] {
  const seen = new Set<string>();
  return sessions.filter((s) => {
    const fingerprint = createHash("sha256")
      .update(s.turns.map((t) => t.content).join("\n"))
      .digest("hex")
      .slice(0, 16);
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
