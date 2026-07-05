import type { StoreMemoryEntry } from "../types.js";
import { formatEntryLine, formatSectionHeader } from "./format.js";

/** Insert one entry line under its section in MEMORY markdown. */
export function insertEntryIntoMarkdown(content: string, entry: StoreMemoryEntry): string {
  const lines = content.split("\n");
  const header = formatSectionHeader(entry.section);
  const headerIdx = lines.findIndex((line) => line.trim() === header);
  const line = formatEntryLine(entry);

  if (headerIdx === -1) {
    const trimmed = content.trimEnd();
    return `${trimmed}\n\n${header}\n\n${line}\n`;
  }

  let insertAt = headerIdx + 1;
  while (insertAt < lines.length && lines[insertAt]?.trim() === "") insertAt++;

  while (insertAt < lines.length) {
    const current = lines[insertAt]!;
    if (current.startsWith("## ")) break;
    insertAt++;
  }

  const next = [...lines.slice(0, insertAt), line, ...lines.slice(insertAt)];
  return `${next.join("\n").trimEnd()}\n`;
}
