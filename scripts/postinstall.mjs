#!/usr/bin/env node
/**
 * Prefer compiled `pi-memory init` when dist exists; otherwise pre-build JS fallback.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(packageRoot, "dist", "cli.js");

if (existsSync(cli)) {
  spawnSync(process.execPath, [cli, "init"], { cwd: packageRoot, stdio: "ignore" });
} else {
  await import("./init-memory-workspace.mjs");
}
