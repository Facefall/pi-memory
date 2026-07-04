import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ping, query, reindex } from "../src/sidecar/client.js";
import { resolveSidecarEntry } from "../src/sidecar/paths.js";
import { ensureSidecarRunning, stopSidecar } from "../src/sidecar/sidecarManager.js";

describe("sidecar IPC", () => {
  let tmpDir: string;
  let socketPath: string;
  let dbPath: string;

  beforeAll(() => {
    execSync("pnpm exec tsc", { cwd: join(import.meta.dirname, ".."), stdio: "inherit" });
    tmpDir = mkdtempSync(join(tmpdir(), "pi-memory-sidecar-"));
    socketPath = join(tmpDir, "memory.sock");
    dbPath = join(tmpDir, "memory.db");
  });

  afterAll(async () => {
    await stopSidecar();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it(
    "spawns sidecar and handles ping/query/reindex",
    async () => {
      await ensureSidecarRunning({
        entry: resolveSidecarEntry(),
        socketPath,
        dbPath,
      });

      expect(await ping(socketPath)).toBe(true);

      const reindexRes = await reindex(socketPath, [
        {
          id: "note-1",
          content: "Always run tests before committing",
          source: "MEMORY.md",
          timestamp: "2026-07-04T00:00:00.000Z",
        },
      ]);
      expect(reindexRes.type).toBe("reindex_ok");
      expect(reindexRes.indexed).toBe(1);

      const queryRes = await query(socketPath, "Always run tests before committing");
      expect(queryRes.type).toBe("result");
      expect(queryRes.results.length).toBeGreaterThan(0);
      expect(queryRes.results[0]?.content).toContain("run tests");
    },
    15_000,
  );
});
