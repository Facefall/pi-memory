import type { MarkdownMemoryBackend } from "./backend.js";
import { listOverflowPointers, parseMemoryMarkdown } from "./markdown/parse.js";
import type { ResolvedMemory } from "./types.js";

export type CollectResolvedEntriesOpts = {
  backend: MarkdownMemoryBackend;
  agentDir: string;
  memoryFile: string;
  /** Include auto-*.md files not referenced by MEMORY.md overflow pointers. Default true. */
  includeOrphans?: boolean;
};

/** Read main MEMORY.md plus overflow / orphan auto files into a single entry list. */
export async function collectResolvedEntries(
  opts: CollectResolvedEntriesOpts,
): Promise<ResolvedMemory> {
  const main = await opts.backend.readText(opts.memoryFile);
  const entries = [...parseMemoryMarkdown(main, opts.memoryFile)];

  const pointers = listOverflowPointers(main);
  for (const fileName of pointers) {
    const path = opts.backend.autoFilePath(opts.agentDir, fileName);
    const overflow = await opts.backend.readText(path);
    entries.push(...parseMemoryMarkdown(overflow, path));
  }

  if (opts.includeOrphans !== false) {
    const autoFiles = await opts.backend.listAutoFiles(opts.agentDir);
    for (const fileName of autoFiles) {
      if (pointers.includes(fileName)) continue;
      const path = opts.backend.autoFilePath(opts.agentDir, fileName);
      const orphan = await opts.backend.readText(path);
      entries.push(...parseMemoryMarkdown(orphan, path));
    }
  }

  return { content: main, entries };
}
