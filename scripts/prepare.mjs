#!/usr/bin/env node
/**
 * Build dist only when missing (git clone / local dev).
 * Published tarballs already include dist/ — skip rebuild on consumer install.
 */
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const entry = join(packageRoot, "dist", "pi-extension.js");

if (existsSync(entry)) {
  process.exit(0);
}

const result = spawnSync("pnpm", ["run", "build"], {
  cwd: packageRoot,
  stdio: "inherit",
  shell: process.platform === "win32",
});

process.exit(result.status ?? 1);
