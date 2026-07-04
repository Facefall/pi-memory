import { expandHomePath } from "../utils/paths.js";
import { joinPath } from "../utils/fs.js";
import {
  AUTO_FILE_PREFIX,
  COMPACTION_STATE_FILE,
  DEFAULT_MEMORY_FILE,
  MEMORY_GC_FILE,
} from "../constants/memory.js";

export type AgentPaths = {
  agentDir: string;
  memoryFile: string;
  memoryGcFile: string;
  compactionStateFile: string;
};

export function resolveAgentDir(agentDir: string): string {
  return expandHomePath(agentDir);
}

export function getAgentPaths(agentDir: string, memoryFileName = DEFAULT_MEMORY_FILE): AgentPaths {
  const resolved = resolveAgentDir(agentDir);
  return {
    agentDir: resolved,
    memoryFile: joinPath(resolved, memoryFileName),
    memoryGcFile: joinPath(resolved, MEMORY_GC_FILE),
    compactionStateFile: joinPath(resolved, COMPACTION_STATE_FILE),
  };
}

export function isAutoOverflowFile(name: string): boolean {
  return name.startsWith(AUTO_FILE_PREFIX) && name.endsWith(".md");
}
