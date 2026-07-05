import type { IndexDocument } from "../sidecar/protocol.js";
import type { TimeInput } from "../utils/time.js";
import type { MemoryStats, ParsedEntry } from "./types.js";

/** Store capabilities used by consolidate jobs (no merge algorithms). */
export type ConsolidateStoreAccess = {
  shouldConsolidate(at?: TimeInput, cronFired?: boolean): Promise<boolean>;
  getStats(): Promise<MemoryStats>;
  exportForIndex(): Promise<IndexDocument[]>;
  isConsolidating(): boolean;
  rewriteMemoryUnderLock(
    updateEntries: (entries: ParsedEntry[]) => Promise<ParsedEntry[]>,
  ): Promise<void>;
};
