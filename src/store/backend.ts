import lockfile from "proper-lockfile";

import {
  MEMORY_LOCK_MAX_TIMEOUT_MS,
  MEMORY_LOCK_MIN_TIMEOUT_MS,
  MEMORY_LOCK_RETRIES,
} from "../constants/timing.js";
import {
  ensureDir,
  ensureFile,
  joinPath,
  listDir,
  pathDirname,
  readText,
  removeFile,
  writeText,
} from "../utils/fs.js";

import { isAutoOverflowFile } from "./paths.js";

export class MarkdownMemoryBackend {
  constructor(private readonly memoryFile: string) {}

  async ensureAgentDir(): Promise<void> {
    await ensureDir(pathDirname(this.memoryFile));
  }

  async readText(path: string): Promise<string> {
    return readText(path);
  }

  async writeText(path: string, content: string): Promise<void> {
    await writeText(path, content);
  }

  async listAutoFiles(agentDir: string): Promise<string[]> {
    const names = await listDir(agentDir);
    return names.filter(isAutoOverflowFile).sort();
  }

  autoFilePath(agentDir: string, fileName: string): string {
    return joinPath(agentDir, fileName);
  }

  async deleteAutoFile(path: string): Promise<void> {
    await removeFile(path);
  }

  async withMemoryLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.ensureAgentDir();
    await ensureFile(this.memoryFile);

    const release = await lockfile.lock(this.memoryFile, {
      retries: {
        retries: MEMORY_LOCK_RETRIES,
        minTimeout: MEMORY_LOCK_MIN_TIMEOUT_MS,
        maxTimeout: MEMORY_LOCK_MAX_TIMEOUT_MS,
      },
    });
    try {
      return await fn();
    } finally {
      await release();
    }
  }
}
