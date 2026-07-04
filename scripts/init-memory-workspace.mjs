#!/usr/bin/env node
/**
 * postinstall: seed MEMORY.md in the memory agent dir when missing or empty.
 */
import { CONFIG_DIR_NAME } from "@earendil-works/pi-coding-agent";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

import {
  ensureDir,
  joinPath,
  readText,
  writeText,
} from "./platform-fs.mjs";
import { expandHomePath } from "./path-utils.mjs";

const packageRoot = joinPath(dirname(fileURLToPath(import.meta.url)), "..");

function resolveMemoryAgentDir(env) {
  const fromMemory = env.PI_MEMORY_AGENT_DIR?.trim();
  if (fromMemory) return expandHomePath(fromMemory);
  return joinPath(homedir(), CONFIG_DIR_NAME, "pi-memory-data");
}

async function loadEnvFiles() {
  const paths = [
    joinPath(process.cwd(), ".env"),
    joinPath(process.cwd(), ".env.local"),
    joinPath(homedir(), CONFIG_DIR_NAME, "agent", "pi-memory.env"),
  ];
  if (process.env.PI_MEMORY_ENV_FILE?.trim()) {
    paths.unshift(process.env.PI_MEMORY_ENV_FILE.trim());
  }
  for (const path of paths) {
    try {
      await readFile(expandHomePath(path), "utf8");
      config({ path: expandHomePath(path), override: false, quiet: true });
    } catch {
      // missing file
    }
  }
}

async function main() {
  await loadEnvFiles();
  const agentDir = resolveMemoryAgentDir(process.env);
  const memoryFile = joinPath(agentDir, "MEMORY.md");

  const existing = await readText(memoryFile);
  if (existing.trim()) return;

  const template = await readText(joinPath(packageRoot, "templates", "MEMORY.md.example"));
  await ensureDir(agentDir);
  await writeText(memoryFile, template);
}

main().catch(() => {
  process.exitCode = 0;
});
