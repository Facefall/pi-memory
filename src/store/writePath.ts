import { isEmptyAfterRedaction, redactText } from "../redaction/redactText.js";
import { pathBasename } from "../utils/fs.js";
import { debugMemory } from "../utils/debugLog.js";
import { formatTimestamp } from "../utils/time.js";
import type { MarkdownMemoryBackend } from "./backend.js";
import { countLines, formatEntryLine, formatSectionHeader } from "./markdown/format.js";
import { insertEntryIntoMarkdown } from "./markdown/insert.js";
import type { ParsedEntry, ResolvedMemory, StoreMemoryEntry } from "./types.js";
import { MEMORY_SECTIONS } from "./types.js";

export type WritePathDeps = {
  backend: MarkdownMemoryBackend;
  memoryFile: string;
  agentDir: string;
  maxLines: number;
  createId: () => string;
  newAutoFilePath: () => string;
  readResolvedUnlocked: () => Promise<ResolvedMemory>;
};

export function normalizeEntry(entry: StoreMemoryEntry, createId: () => string): StoreMemoryEntry {
  return {
    ...entry,
    id: entry.id || createId(),
    timestamp: entry.timestamp || formatTimestamp(),
  };
}

/** Ground Truth ingress gate: normalize → redact → skip if empty. */
export function prepareEntryForWrite(
  entry: StoreMemoryEntry,
  createId: () => string,
): StoreMemoryEntry | null {
  const normalized = normalizeEntry(entry, createId);
  try {
    const result = redactText(normalized.content);
    const prepared: StoreMemoryEntry = { ...normalized, content: result.text };

    if (isEmptyAfterRedaction(prepared.content)) {
      debugMemory("write", "write_skipped", {
        reason: "redaction_empty",
        entryId: prepared.id,
      });
      return null;
    }

    if (result.mutated) {
      debugMemory("write", "write_redacted", {
        hitCount: result.hitCount,
        secretHits: result.secretHits,
        piiHits: result.piiHits,
        entryId: prepared.id,
        policyVersion: result.policyVersion,
      });
    }

    return prepared;
  } catch {
    debugMemory("write", "write_skipped", {
      reason: "redaction_error",
      entryId: normalized.id,
    });
    return null;
  }
}

export async function tryAppendUnlocked(
  deps: WritePathDeps,
  entry: StoreMemoryEntry,
): Promise<boolean> {
  const prepared = prepareEntryForWrite(entry, deps.createId);
  if (!prepared) return false;
  await appendOneUnlocked(deps, prepared);
  return true;
}

/** Physical write only; entry must already pass prepareEntryForWrite. */
export async function appendOneUnlocked(deps: WritePathDeps, entry: StoreMemoryEntry): Promise<void> {
  const main = await deps.backend.readText(deps.memoryFile);
  if (countLines(main) >= deps.maxLines) {
    await appendToOverflowUnlocked(deps, entry, main);
    return;
  }

  const next = insertEntryIntoMarkdown(main, entry);
  if (countLines(next) > deps.maxLines) {
    await appendToOverflowUnlocked(deps, entry, main);
    return;
  }

  await deps.backend.writeText(deps.memoryFile, next);
}

export async function appendIfAbsentUnlocked(
  deps: WritePathDeps,
  entry: StoreMemoryEntry,
): Promise<boolean> {
  const prepared = prepareEntryForWrite(entry, deps.createId);
  if (!prepared) return false;

  const resolved = await deps.readResolvedUnlocked();
  const exists = resolved.entries.some(
    (item) => item.section === prepared.section && item.content.trim() === prepared.content.trim(),
  );
  if (exists) return false;

  await appendOneUnlocked(deps, prepared);
  return true;
}

export async function appendToOverflowUnlocked(
  deps: WritePathDeps,
  entry: StoreMemoryEntry,
  main: string,
): Promise<void> {
  const autoFiles = await deps.backend.listAutoFiles(deps.agentDir);
  let targetName = autoFiles.at(-1);
  let targetPath = targetName
    ? deps.backend.autoFilePath(deps.agentDir, targetName)
    : deps.newAutoFilePath();

  if (!targetName) {
    targetName = pathBasename(targetPath);
    await deps.backend.writeText(targetPath, `${formatSectionHeader(entry.section)}\n\n`);
  }

  let overflowContent = await deps.backend.readText(targetPath);
  const line = formatEntryLine(entry);
  overflowContent = overflowContent.trimEnd() + `\n${line}\n`;
  await deps.backend.writeText(targetPath, overflowContent);

  const pointer = `- (overflow) → ${targetName}`;
  if (!main.includes(pointer)) {
    const withPointer = `${main.trimEnd()}\n${pointer}\n`;
    await deps.backend.writeText(deps.memoryFile, withPointer);
  }
}

export async function rewriteEntriesUnlocked(
  deps: WritePathDeps,
  entries: ParsedEntry[],
): Promise<void> {
  const grouped = new Map<string, ParsedEntry[]>();
  for (const section of MEMORY_SECTIONS) grouped.set(section, []);
  for (const entry of entries) {
    grouped.get(entry.section)?.push(entry);
  }

  const lines: string[] = [];
  for (const section of MEMORY_SECTIONS) {
    lines.push(formatSectionHeader(section), "");
    for (const entry of grouped.get(section) ?? []) {
      lines.push(
        formatEntryLine({
          id: entry.id,
          section: entry.section,
          content: entry.content,
          userAuthored: entry.userAuthored,
          timestamp: entry.timestamp,
        }),
      );
    }
    lines.push("");
  }

  await deps.backend.writeText(deps.memoryFile, `${lines.join("\n").trimEnd()}\n`);
  const autoFiles = await deps.backend.listAutoFiles(deps.agentDir);
  await Promise.all(
    autoFiles.map((fileName) =>
      deps.backend.deleteAutoFile(deps.backend.autoFilePath(deps.agentDir, fileName)),
    ),
  );
}
