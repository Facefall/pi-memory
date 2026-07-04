import { config } from "dotenv";

import { defaultPiMemoryEnvFile } from "../utils/paths.js";
import { joinPath, pathExists } from "../utils/fs.js";
import { readPiMemoryEnv } from "./env.js";

/**
 * Load pi-memory env into process.env (does not override existing vars).
 *
 * Search order:
 * 1. PI_MEMORY_ENV_FILE (explicit override)
 * 2. cwd `.env` / `.env.local` (project-local dev)
 * 3. ~/.pi/agent/pi-memory.env (recommended)
 */
export function loadEnv(cwd = process.cwd()): void {
  const paths: string[] = [];
  const explicit = readPiMemoryEnv(process.env).envFile;
  if (explicit) paths.push(explicit);

  paths.push(joinPath(cwd, ".env"), joinPath(cwd, ".env.local"), defaultPiMemoryEnvFile());

  for (const path of paths) {
    if (!path || !pathExists(path)) continue;
    config({ path, override: false, quiet: true });
  }
}
