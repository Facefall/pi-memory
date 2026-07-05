import { randomBytes } from "node:crypto";

import {
  CONSOLIDATE_GC_INTERVAL_DAYS,
  CONSOLIDATE_OVERFLOW_FILE_THRESHOLD,
  DEFAULT_FALLBACK_MAX_CHARS,
  DEFAULT_MAX_LINES,
  DEFAULT_MEMORY_FILE,
  AUTO_FILE_PREFIX,
} from "../constants/memory.js";
import { readChunkingConfig } from "../config/chunking.js";
import { initializeMemoryWorkspace } from "./initWorkspace.js";
import { joinPath, readText, readTextRequired, writeText } from "../utils/fs.js";
import { daysSince, formatLocalDate, formatTimestamp, type TimeInput } from "../utils/time.js";
import type { ConsolidateStoreAccess } from "./consolidatePort.js";
import { ingestMemoryExport } from "./ingestEntries.js";
import { MarkdownMemoryBackend } from "./backend.js";
import { buildIndexDocuments } from "./indexChunks.js";
import { createStoreListeners } from "./listeners.js";
import { countLines } from "./markdown/format.js";
import { listOverflowPointers } from "./markdown/parse.js";
import { getAgentPaths, resolveAgentDir } from "./paths.js";
import { collectResolvedEntries } from "./resolveEntries.js";
import type {
  IndexDocument,
  IntegrityReport,
  MemoryStats,
  MemoryStoreOptions,
  ParsedEntry,
  ResolvedMemory,
  StoreMemoryEntry,
} from "./types.js";
import {
  appendIfAbsentUnlocked,
  rewriteEntriesUnlocked,
  tryAppendUnlocked,
  type WritePathDeps,
} from "./writePath.js";

type CompactionState = {
  processed: string[];
};

export class MemoryStore implements ConsolidateStoreAccess {
  private readonly paths: ReturnType<typeof getAgentPaths>;
  private readonly backend: MarkdownMemoryBackend;
  private readonly maxLines: number;
  private readonly fallbackMaxChars: number;
  private readonly listeners = createStoreListeners(() => this.consolidating);
  private consolidating = false;

  constructor(opts: MemoryStoreOptions) {
    const agentDir = resolveAgentDir(opts.agentDir);
    this.paths = getAgentPaths(agentDir, opts.memoryFileName ?? DEFAULT_MEMORY_FILE);
    this.backend = new MarkdownMemoryBackend(this.paths.memoryFile);
    this.maxLines = opts.maxLines ?? DEFAULT_MAX_LINES;
    this.fallbackMaxChars = opts.defaultFallbackMaxChars ?? DEFAULT_FALLBACK_MAX_CHARS;
  }

  private collectResolvedOpts() {
    return {
      backend: this.backend,
      agentDir: this.paths.agentDir,
      memoryFile: this.paths.memoryFile,
    };
  }

  private writePathDeps(): WritePathDeps {
    return {
      backend: this.backend,
      memoryFile: this.paths.memoryFile,
      agentDir: this.paths.agentDir,
      maxLines: this.maxLines,
      createId: () => this.newEntryId(),
      newAutoFilePath: () => this.newAutoFilePath(),
      readResolvedUnlocked: () => this.readResolvedUnlocked(),
    };
  }

  get agentDir(): string {
    return this.paths.agentDir;
  }

  async ensureInitialized(): Promise<void> {
    await initializeMemoryWorkspace(this.paths.agentDir);
  }

  async isEmpty(): Promise<boolean> {
    const entries = await this.listEntries();
    return entries.length === 0;
  }

  async getStats(): Promise<MemoryStats> {
    const raw = await this.readRaw();
    const entries = await this.listEntries();
    const overflowFileCount = (await this.backend.listAutoFiles(this.paths.agentDir)).length;
    const lastConsolidatedAt = await this.readGcTimestamp();
    return {
      lineCount: countLines(raw),
      overflowFileCount,
      entryCount: entries.length,
      lastConsolidatedAt,
    };
  }

  async readRaw(): Promise<string> {
    return this.backend.readText(this.paths.memoryFile);
  }

  async listEntries(): Promise<ParsedEntry[]> {
    const resolved = await this.readResolved();
    return resolved.entries;
  }

  async readResolved(): Promise<ResolvedMemory> {
    await this.ensureInitialized();
    return collectResolvedEntries(this.collectResolvedOpts());
  }

  async readForFallback(maxChars = this.fallbackMaxChars): Promise<string> {
    const resolved = await this.readResolved();
    if (resolved.entries.length === 0) return "";

    const blocks = resolved.entries.map((entry) => {
      const tag = entry.userAuthored ? "[user] " : "";
      return `- ${tag}${entry.content}`;
    });

    let text = blocks.join("\n");
    if (text.length <= maxChars) return text;
    return `${text.slice(0, maxChars)}\n…`;
  }

  async exportForIndex(): Promise<IndexDocument[]> {
    const resolved = await this.readResolved();
    return buildIndexDocuments(resolved.entries, readChunkingConfig());
  }

  async append(entry: StoreMemoryEntry): Promise<void> {
    let written = false;
    await this.backend.withMemoryLock(async () => {
      written = await tryAppendUnlocked(this.writePathDeps(), entry);
    });
    if (written) this.listeners.notifyAfterWrite();
  }

  async appendUser(entry: Omit<StoreMemoryEntry, "userAuthored">): Promise<void> {
    let written = false;
    await this.backend.withMemoryLock(async () => {
      written = await tryAppendUnlocked(this.writePathDeps(), { ...entry, userAuthored: true });
    });
    if (written) this.listeners.notifyAfterWrite();
  }

  async appendMany(entries: StoreMemoryEntry[], opts?: { mode?: "ifAbsent" }): Promise<void> {
    let written = false;
    const deps = this.writePathDeps();
    await this.backend.withMemoryLock(async () => {
      for (const entry of entries) {
        if (opts?.mode === "ifAbsent") {
          if (await appendIfAbsentUnlocked(deps, entry)) written = true;
        } else if (await tryAppendUnlocked(deps, entry)) {
          written = true;
        }
      }
    });
    if (written) this.listeners.notifyAfterWrite();
  }

  async appendIfAbsent(entry: StoreMemoryEntry): Promise<boolean> {
    let added = false;
    await this.backend.withMemoryLock(async () => {
      added = await appendIfAbsentUnlocked(this.writePathDeps(), entry);
    });
    if (added) this.listeners.notifyAfterWrite();
    return added;
  }

  appendFromCompaction(opts: {
    compactionId: string;
    summary: string;
    subagent?: boolean;
    onComplete?: () => void | Promise<void>;
  }): void {
    void this.ingestCompactionSummary(opts).catch(() => {});
  }

  private async ingestCompactionSummary(opts: {
    compactionId: string;
    summary: string;
    subagent?: boolean;
    onComplete?: () => void | Promise<void>;
  }): Promise<void> {
    if (await this.hasProcessedCompaction(opts.compactionId)) return;

    await this.ensureInitialized();
    await ingestMemoryExport({
      store: this,
      summary: opts.summary,
      isSubagent: !!opts.subagent,
    });

    await this.markCompactionProcessed(opts.compactionId);
    await opts.onComplete?.();
  }

  async updateEntry(id: string, patch: Partial<StoreMemoryEntry>): Promise<void> {
    // Path B: correction detector should reuse prepareEntryForWrite when content is patched.
    await this.backend.withMemoryLock(async () => {
      const resolved = await this.readResolvedUnlocked();
      const target = resolved.entries.find((entry) => entry.id === id);
      if (!target) throw new Error(`Memory entry not found: ${id}`);

      const next: StoreMemoryEntry = {
        ...target,
        ...patch,
        id: target.id,
        section: patch.section ?? target.section,
        content: patch.content ?? target.content,
        timestamp: patch.timestamp ?? target.timestamp,
        userAuthored: patch.userAuthored ?? target.userAuthored,
      };

      await rewriteEntriesUnlocked(
        this.writePathDeps(),
        resolved.entries.map((entry) => (entry.id === id ? { ...entry, ...next } : entry)),
      );
    });
    this.listeners.notifyAfterWrite();
  }

  async removeEntry(id: string, opts?: { force?: boolean }): Promise<void> {
    await this.backend.withMemoryLock(async () => {
      const resolved = await this.readResolvedUnlocked();
      const target = resolved.entries.find((entry) => entry.id === id);
      if (!target) return;
      if (target.userAuthored && !opts?.force) {
        throw new Error(`Cannot remove user-authored entry without force: ${id}`);
      }
      await rewriteEntriesUnlocked(
        this.writePathDeps(),
        resolved.entries.filter((entry) => entry.id !== id),
      );
    });
    this.listeners.notifyAfterWrite();
  }

  async rewrite(content: string): Promise<void> {
    await this.backend.withMemoryLock(async () => {
      await this.backend.writeText(this.paths.memoryFile, content);
    });
    this.listeners.notifyAfterWrite({ skipConsolidateCheck: true });
  }

  async shouldConsolidate(at?: TimeInput, cronFired = false): Promise<boolean> {
    const stats = await this.getStats();
    if (stats.overflowFileCount >= CONSOLIDATE_OVERFLOW_FILE_THRESHOLD) return true;
    if (cronFired) return true;
    if (!stats.lastConsolidatedAt) return false;
    return daysSince(stats.lastConsolidatedAt, at) >= CONSOLIDATE_GC_INTERVAL_DAYS;
  }

  isConsolidating(): boolean {
    return this.consolidating;
  }

  async rewriteMemoryUnderLock(
    updateEntries: (entries: ParsedEntry[]) => Promise<ParsedEntry[]>,
  ): Promise<void> {
    if (this.consolidating) return;

    this.consolidating = true;
    try {
      await this.backend.withMemoryLock(async () => {
        const resolved = await this.readResolvedUnlocked();
        const entries = await updateEntries(resolved.entries);
        await rewriteEntriesUnlocked(this.writePathDeps(), entries);
        await writeText(this.paths.memoryGcFile, `${formatTimestamp()}\n`);
      });
      this.listeners.notifySyncToSidecar();
    } finally {
      this.consolidating = false;
    }
  }

  async hasProcessedCompaction(compactionId: string): Promise<boolean> {
    const state = await this.readCompactionState();
    return state.processed.includes(compactionId);
  }

  async markCompactionProcessed(compactionId: string): Promise<void> {
    const state = await this.readCompactionState();
    if (!state.processed.includes(compactionId)) {
      state.processed.push(compactionId);
    }
    await writeText(this.paths.compactionStateFile, JSON.stringify(state, null, 2));
  }

  async verifyIntegrity(): Promise<IntegrityReport> {
    const issues: string[] = [];
    const main = await this.backend.readText(this.paths.memoryFile);
    const pointers = listOverflowPointers(main);

    for (const fileName of pointers) {
      const path = this.backend.autoFilePath(this.paths.agentDir, fileName);
      try {
        await readTextRequired(path);
      } catch {
        issues.push(`Missing overflow file referenced by MEMORY.md: ${fileName}`);
      }
    }

    return { ok: issues.length === 0, issues };
  }

  onSyncToSidecar(listener: () => void): () => void {
    return this.listeners.onSyncToSidecar(listener);
  }

  onConsolidateCheck(listener: () => void): () => void {
    return this.listeners.onConsolidateCheck(listener);
  }

  private async readResolvedUnlocked(): Promise<ResolvedMemory> {
    return collectResolvedEntries(this.collectResolvedOpts());
  }

  private newEntryId(): string {
    return randomBytes(6).toString("hex");
  }

  private newAutoFilePath(): string {
    const date = formatLocalDate();
    const suffix = randomBytes(3).toString("hex");
    return joinPath(this.paths.agentDir, `${AUTO_FILE_PREFIX}${date}-${suffix}.md`);
  }

  private async readGcTimestamp(): Promise<string | null> {
    const raw = await readText(this.paths.memoryGcFile);
    return raw.trim() || null;
  }

  private async readCompactionState(): Promise<CompactionState> {
    const raw = await readText(this.paths.compactionStateFile);
    if (!raw.trim()) return { processed: [] };
    try {
      return JSON.parse(raw) as CompactionState;
    } catch {
      return { processed: [] };
    }
  }
}

export function createMemoryStore(opts: MemoryStoreOptions): MemoryStore {
  return new MemoryStore(opts);
}
