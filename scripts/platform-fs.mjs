/**
 * Postinstall-safe fs helpers when dist/ is not built yet.
 * Path expansion: scripts/path-utils.mjs expandHomePath (mirrors src/utils/paths.ts).
 * After build, scripts/postinstall.mjs prefers `pi-memory init` (compiled src/utils/fs.ts).
 */
import { expandHomePath } from "./path-utils.mjs";
import { mkdirSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export { expandHomePath };

export function joinPath(...segments) {
  return join(...segments);
}

export function pathDirname(filePath) {
  return dirname(filePath);
}

export function isWindows() {
  return process.platform === "win32";
}

export function mkdirOptions() {
  if (isWindows()) return { recursive: true };
  return { recursive: true, mode: 0o700 };
}

export function isENOENT(error) {
  return error?.code === "ENOENT";
}

export async function ensureDir(dirPath) {
  await mkdir(expandHomePath(dirPath), mkdirOptions());
}

export function ensureDirSync(dirPath) {
  mkdirSync(expandHomePath(dirPath), mkdirOptions());
}

export async function readText(filePath) {
  try {
    return await readFile(expandHomePath(filePath), "utf8");
  } catch (error) {
    if (isENOENT(error)) return "";
    throw error;
  }
}

export async function writeText(filePath, content) {
  const resolved = expandHomePath(filePath);
  await ensureDir(dirname(resolved));
  await writeFile(resolved, content, "utf8");
}

export async function appendText(filePath, content) {
  const resolved = expandHomePath(filePath);
  await ensureDir(dirname(resolved));
  await appendFile(resolved, content, "utf8");
}

export function pathBasename(filePath) {
  return basename(filePath);
}
