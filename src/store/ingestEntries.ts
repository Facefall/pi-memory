import { parseMemoryExport } from "../compact/parseMemoryExport.js";
import {
  filterCompactionDelta,
  shouldSkipSubagentCompactionIngest,
} from "../compact/subagentDelta.js";
import type { ParsedEntry, StoreMemoryEntry } from "./types.js";

export type MemoryStoreForIngest = {
  listEntries(): Promise<ParsedEntry[]>;
  appendMany(entries: StoreMemoryEntry[], opts?: { mode?: "ifAbsent" }): Promise<void>;
};

export type IngestMemoryExportResult = {
  appended: number;
};

/** Parse Memory Export from summary text and append new facts to Ground Truth. */
export async function ingestMemoryExport(opts: {
  store: MemoryStoreForIngest;
  summary: string;
  isSubagent: boolean;
}): Promise<IngestMemoryExportResult> {
  const parsed = parseMemoryExport(opts.summary);
  if (parsed.length === 0) {
    return { appended: 0 };
  }

  let entries = parsed;
  if (opts.isSubagent) {
    const existing = await opts.store.listEntries();
    entries = filterCompactionDelta(parsed, existing);
    if (shouldSkipSubagentCompactionIngest(parsed, entries)) {
      return { appended: 0 };
    }
  }

  if (entries.length > 0) {
    await opts.store.appendMany(entries, { mode: "ifAbsent" });
  }

  return { appended: entries.length };
}
