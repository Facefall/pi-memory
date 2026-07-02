import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { openSessionIndex, type SessionIndex } from "./sessionIndex.js";

/** Mirrors Kocoro session.SearchResult for fallback hits. */
export interface SessionSearchHit {
  session_id: string;
  session_title: string;
  role: string;
  snippet: string;
  msg_index: number;
  created_at: string;
}

let cachedIndex: SessionIndex | null = null;
let cachedDbPath: string | null = null;

/**
 * Get or open the FTS5 session index. Returns null if better-sqlite3
 * is unavailable or the DB file doesn't exist.
 */
function getSessionIndex(dbPath: string): SessionIndex | null {
  if (cachedIndex && cachedDbPath === dbPath) return cachedIndex;
  if (!fsSync.existsSync(dbPath)) return null;
  cachedIndex = openSessionIndex(dbPath);
  cachedDbPath = dbPath;
  return cachedIndex;
}

/** Default session DB path. */
export function defaultSessionDbPath(sessionsDir: string): string {
  return path.join(path.dirname(sessionsDir), "memory", "sessions.db");
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

const SNIPPET_MAX = 240;

/**
 * Keyword search over Pi-style session JSON files (one directory level).
 * Uses FTS5 index when available, falls back to file scan.
 * All whitespace-separated terms must match (case-insensitive AND).
 */
export async function sessionKeywordSearch(
  sessionsDir: string,
  query: string,
  limit: number,
): Promise<SessionSearchHit[]> {
  if (!sessionsDir.trim()) return [];
  const q = query.trim();
  if (!q) return [];
  if (limit <= 0) limit = 20;

  const dbPath = defaultSessionDbPath(sessionsDir);
  const idx = getSessionIndex(dbPath);
  if (idx) {
    const results = idx.search(q, limit);
    if (results.length > 0) return results;
  }

  const terms = splitTerms(q);
  if (terms.length === 0) return [];

  let entries: string[];
  try {
    entries = await fs.readdir(sessionsDir);
  } catch {
    return [];
  }

  const hits: SessionSearchHit[] = [];
  for (const name of entries) {
    if (!name.endsWith(".json")) continue;
    const filePath = path.join(sessionsDir, name);
    let st;
    try {
      st = await fs.stat(filePath);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;

    let session: PiSessionFile;
    try {
      const raw = await fs.readFile(filePath, "utf8");
      session = JSON.parse(raw) as PiSessionFile;
    } catch {
      continue;
    }

    const sessionId = session.id ?? path.basename(name, ".json");
    const title = session.title ?? "";
    const createdAt = session.created_at ?? "";

    for (let i = 0; i < (session.messages?.length ?? 0); i++) {
      const msg = session.messages![i]!;
      const text = messageText(msg.content);
      if (!text || !allTermsMatch(text, terms)) continue;
      hits.push({
        session_id: sessionId,
        session_title: title,
        role: msg.role ?? "unknown",
        snippet: makeSnippet(text, terms[0]!),
        msg_index: i,
        created_at: createdAt,
      });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

function splitTerms(query: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (const ch of query) {
    if (ch === '"') {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote && /\s/.test(ch)) {
      if (cur) {
        out.push(cur.toLowerCase());
        cur = "";
      }
      continue;
    }
    cur += ch;
  }
  if (cur) out.push(cur.toLowerCase());
  return out;
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

function allTermsMatch(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

function makeSnippet(text: string, firstTerm: string): string {
  const lower = text.toLowerCase();
  const idx = lower.indexOf(firstTerm.toLowerCase());
  if (idx < 0) {
    return text.length <= SNIPPET_MAX ? text : text.slice(0, SNIPPET_MAX) + "...";
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + firstTerm.length + 120);
  let snip = text.slice(start, end);
  if (start > 0) snip = "..." + snip;
  if (end < text.length) snip += "...";
  return snip;
}
