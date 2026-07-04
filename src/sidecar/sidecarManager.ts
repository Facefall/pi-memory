// Agent 侧：connect-or-create、spawn lock、execa 生命周期
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { execa } from "execa";

import { SIDECAR_SPAWN_LOCK_FILE } from "../constants/paths.js";
import {
  SIDECAR_FORCE_KILL_DELAY_MS,
  SIDECAR_SPAWN_LOCK_STALE_MS,
  SIDECAR_START_TIMEOUT_MS,
} from "../constants/timing.js";
import { ensureDirSync, joinPath, pathDirname, pathExists } from "../utils/fs.js";
import { nowMs } from "../utils/time.js";
import { ping } from "./client.js";
import { resolveSidecarEntry } from "./paths.js";
import { canConnect, waitUntilReady } from "./utils.js";

export { resolveSidecarEntry } from "./paths.js";

const START_TIMEOUT_MS = SIDECAR_START_TIMEOUT_MS;

let instance: SidecarManager | undefined;

export type SidecarOpts = {
  entry?: string;
  socketPath: string;
  dbPath: string;
};

/** 上层唯一入口：确保 sidecar 在跑（attach 或 spawn） */
export async function ensureSidecarRunning(opts: SidecarOpts): Promise<void> {
  const resolved = { ...opts, entry: opts.entry ?? resolveSidecarEntry() };
  ensureDirSync(pathDirname(resolved.socketPath));

  if (await canConnect(resolved.socketPath)) return;

  if (!acquireSpawnLock(resolved.socketPath)) {
    await waitUntilReady(() => canConnect(resolved.socketPath), START_TIMEOUT_MS);
    return;
  }

  try {
    if (await canConnect(resolved.socketPath)) return;
    await getInstance().spawn(resolved);
  } finally {
    releaseSpawnLock(resolved.socketPath);
  }
}

export async function stopSidecar(): Promise<void> {
  await getInstance().stop();
}

function getInstance(): SidecarManager {
  instance ??= new SidecarManager();
  return instance;
}

class SidecarManager {
  private child?: ReturnType<typeof execa>;

  async spawn(opts: Required<SidecarOpts>): Promise<void> {
    if (await ping(opts.socketPath)) return;

    this.child = execa(
      process.execPath,
      [opts.entry, "--socket", opts.socketPath, "--db", opts.dbPath],
      {
        stdio: "ignore",
        cleanup: true,
        forceKillAfterDelay: SIDECAR_FORCE_KILL_DELAY_MS,
      },
    );

    this.child.catch(() => {});

    await waitUntilReady(() => ping(opts.socketPath), START_TIMEOUT_MS);
  }

  async stop(): Promise<void> {
    this.child?.kill("SIGTERM");
    await this.child;
    this.child = undefined;
  }
}

function spawnLockPath(socketPath: string): string {
  return joinPath(pathDirname(socketPath), SIDECAR_SPAWN_LOCK_FILE);
}

function acquireSpawnLock(socketPath: string): boolean {
  const lockPath = spawnLockPath(socketPath);
  for (let i = 0; i < 5; i++) {
    try {
      writeFileSync(lockPath, `${process.pid}\n${nowMs()}\n`, { flag: "wx" });
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (isLockStale(lockPath)) {
        try {
          unlinkSync(lockPath);
        } catch {}
        continue;
      }
      return false;
    }
  }
  return false;
}

function isLockStale(lockPath: string): boolean {
  if (!pathExists(lockPath)) return false;
  try {
    const [pidLine = "", tsLine = "0"] = readFileSync(lockPath, "utf8").trim().split("\n");
    const pid = Number.parseInt(pidLine, 10);
    const ts = Number.parseInt(tsLine, 10);
    if (Number.isFinite(pid)) {
      try {
        process.kill(pid, 0);
      } catch {
        return true;
      }
    }
    return !Number.isFinite(ts) || nowMs() - ts > SIDECAR_SPAWN_LOCK_STALE_MS;
  } catch {
    return true;
  }
}

function releaseSpawnLock(socketPath: string): void {
  try {
    unlinkSync(spawnLockPath(socketPath));
  } catch {}
}
