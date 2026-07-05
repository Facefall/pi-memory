import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AUTO_FILE_PREFIX } from "../../src/constants/memory.js";
import { createMemoryStore } from "../../src/store/index.js";
import { MarkdownMemoryBackend } from "../../src/store/backend.js";
import { formatEntryLine, formatSectionHeader } from "../../src/store/markdown/format.js";
import { collectResolvedEntries } from "../../src/store/resolveEntries.js";
import { writeText } from "../../src/utils/fs.js";

describe("collectResolvedEntries", () => {
  let tmpDir: string;

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes orphan auto files not referenced by MEMORY.md pointers", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-resolve-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    const orphanName = `${AUTO_FILE_PREFIX}orphan-test.md`;
    const orphanPath = join(tmpDir, orphanName);
    const orphanEntry = {
      id: "orphan-1",
      section: "Findings" as const,
      content: "Entry only in orphan auto file",
      timestamp: "2026-07-05T00:00:00.000Z",
    };
    await writeText(
      orphanPath,
      `${formatSectionHeader("Findings")}\n\n${formatEntryLine(orphanEntry)}\n`,
    );

    const backend = new MarkdownMemoryBackend(join(tmpDir, "MEMORY.md"));
    const resolved = await collectResolvedEntries({
      backend,
      agentDir: store.agentDir,
      memoryFile: join(tmpDir, "MEMORY.md"),
    });

    expect(resolved.entries.some((entry) => entry.id === "orphan-1")).toBe(true);
    expect(await store.listEntries()).toHaveLength(1);
  });

  it("appendIfAbsent deduplicates against entries in orphan auto files", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-resolve-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    const orphanName = `${AUTO_FILE_PREFIX}orphan-dedupe.md`;
    const content = "Duplicate check across orphan file";
    await writeText(
      join(tmpDir, orphanName),
      `${formatSectionHeader("Findings")}\n\n${formatEntryLine({
        id: "orphan-dedupe",
        section: "Findings",
        content,
        timestamp: "2026-07-05T01:00:00.000Z",
      })}\n`,
    );

    const added = await store.appendIfAbsent({
      id: "new-id",
      section: "Findings",
      content,
      timestamp: "2026-07-05T02:00:00.000Z",
    });

    expect(added).toBe(false);
    expect(await store.listEntries()).toHaveLength(1);
  });

  it("rewriteMemoryUnderLock preserves orphan entries", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-resolve-"));
    const store = createMemoryStore({ agentDir: tmpDir });
    await store.ensureInitialized();

    await writeText(
      join(tmpDir, `${AUTO_FILE_PREFIX}orphan-rewrite.md`),
      `${formatSectionHeader("Todos")}\n\n${formatEntryLine({
        id: "orphan-rewrite",
        section: "Todos",
        content: "Keep me on rewrite",
        timestamp: "2026-07-05T03:00:00.000Z",
      })}\n`,
    );

    await store.rewriteMemoryUnderLock(async (entries) => entries);

    const entries = await store.listEntries();
    expect(entries.some((entry) => entry.id === "orphan-rewrite")).toBe(true);
  });
});
