import fs from "node:fs/promises";

const SNIPPET_CAP = 4096;

/**
 * Best-effort grep of MEMORY.md for query terms (Kocoro memory_fallback.go).
 * Returns joined matching lines capped at 4KB. Empty string if absent/no match.
 */
export async function memoryMdSnippet(
  paths: string[],
  query: string,
): Promise<string> {
  const q = query.trim().toLowerCase();
  if (!q) return "";

  for (const p of paths) {
    let text: string;
    try {
      text = await fs.readFile(p, "utf8");
    } catch {
      continue;
    }
    const matches: string[] = [];
    let total = 0;
    for (const line of text.split("\n")) {
      if (!line.toLowerCase().includes(q)) continue;
      matches.push(line);
      total += line.length + 1;
      if (total > SNIPPET_CAP) break;
    }
    if (matches.length > 0) {
      return matches.join("\n");
    }
  }
  return "";
}
