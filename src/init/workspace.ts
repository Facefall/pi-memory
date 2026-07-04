import { DEFAULT_MEMORY_FILE } from "../constants/memory.js";
import { MarkdownMemoryBackend } from "../store/backend.js";
import { defaultMemoryTemplate } from "../store/markdown/template.js";
import { resolveAgentDir } from "../store/paths.js";
import { joinPath, readText } from "../utils/fs.js";

export type InitMemoryWorkspaceResult = {
  agentDir: string;
  memoryFile: string;
  created: boolean;
  skipped: boolean;
  reason?: "already_initialized";
};

/**
 * Ensure the memory data directory exists and MEMORY.md follows the canonical template.
 * Never overwrites a non-empty MEMORY.md.
 */
export async function initializeMemoryWorkspace(agentDir: string): Promise<InitMemoryWorkspaceResult> {
  const resolved = resolveAgentDir(agentDir);
  const memoryFile = joinPath(resolved, DEFAULT_MEMORY_FILE);
  const backend = new MarkdownMemoryBackend(memoryFile);

  await backend.ensureAgentDir();

  const existing = await backend.readText(memoryFile);
  if (existing.trim()) {
    return {
      agentDir: resolved,
      memoryFile,
      created: false,
      skipped: true,
      reason: "already_initialized",
    };
  }

  await backend.writeText(memoryFile, defaultMemoryTemplate());
  return { agentDir: resolved, memoryFile, created: true, skipped: false };
}

/** Read bundled template from templates/MEMORY.md.example (postinstall / docs). */
export async function readMemoryTemplateExample(packageRoot: string): Promise<string> {
  return readText(joinPath(packageRoot, "templates", "MEMORY.md.example"));
}
