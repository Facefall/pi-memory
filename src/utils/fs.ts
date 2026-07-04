/** Runtime fs helpers. Pre-build postinstall mirror: scripts/platform-fs.mjs */
import { accessSync, existsSync, mkdirSync, constants } from "node:fs";
import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { expandHomePath, mkdirOptions } from "./paths.js";

/** Cross-platform path join (`\` on Windows, `/` on POSIX). */
export function joinPath(...segments: string[]): string {
  return join(...segments);
}

export function pathBasename(filePath: string): string {
  return basename(filePath);
}

export function pathDirname(filePath: string): string {
  return dirname(filePath);
}

export function pathExists(filePath: string): boolean {
  return existsSync(expandHomePath(filePath));
}

/** True when the current process can read the path. */
export function canRead(filePath: string): boolean {
  try {
    accessSync(expandHomePath(filePath), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

export function isENOENT(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}

/** Create directory tree; Unix applies secure mode, Windows omits mode. */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(expandHomePath(dirPath), mkdirOptions());
}

export function ensureDirSync(dirPath: string): void {
  mkdirSync(expandHomePath(dirPath), mkdirOptions());
}

/** Read UTF-8 text; missing file → empty string. */
export async function readText(filePath: string): Promise<string> {
  try {
    return await readFile(expandHomePath(filePath), "utf8");
  } catch (error) {
    if (isENOENT(error)) return "";
    throw error;
  }
}

/** Read UTF-8 text; propagates ENOENT. */
export async function readTextRequired(filePath: string): Promise<string> {
  return readFile(expandHomePath(filePath), "utf8");
}

/** Write UTF-8 text; creates parent directories. */
export async function writeText(filePath: string, content: string): Promise<void> {
  const resolved = expandHomePath(filePath);
  await ensureDir(dirname(resolved));
  await writeFile(resolved, content, "utf8");
}

/** Append UTF-8 text; creates parent directories. */
export async function appendText(filePath: string, content: string): Promise<void> {
  const resolved = expandHomePath(filePath);
  await ensureDir(dirname(resolved));
  await appendFile(resolved, content, "utf8");
}

/** List directory entries; missing dir → empty array. */
export async function listDir(dirPath: string): Promise<string[]> {
  try {
    return await readdir(expandHomePath(dirPath));
  } catch (error) {
    if (isENOENT(error)) return [];
    throw error;
  }
}

/** Delete file; missing file → no-op. */
export async function removeFile(filePath: string): Promise<void> {
  try {
    await unlink(expandHomePath(filePath));
  } catch (error) {
    if (isENOENT(error)) return;
    throw error;
  }
}

/** Ensure file exists (empty) for lockfile targets. */
export async function ensureFile(filePath: string): Promise<void> {
  try {
    await readTextRequired(filePath);
  } catch (error) {
    if (isENOENT(error)) {
      await writeText(filePath, "");
      return;
    }
    throw error;
  }
}
