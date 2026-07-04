import { accessSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SIDECAR_DB_FILE, SIDECAR_SOCKET_FILE } from "../constants/paths.js";

export type SidecarPaths = {
  socketPath: string;
  dbPath: string;
};

export function resolveSidecarPaths(agentDir: string): SidecarPaths {
  return {
    socketPath: join(agentDir, SIDECAR_SOCKET_FILE),
    dbPath: join(agentDir, SIDECAR_DB_FILE),
  };
}

/** Resolve compiled sidecar entry (dist/sidecar/server/process.js). */
export function resolveSidecarEntry(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, "server/process.js"),
    join(here, "../../dist/sidecar/server/process.js"),
  ];

  for (const entry of candidates) {
    try {
      accessSync(entry, constants.R_OK);
      return entry;
    } catch {
      // try next
    }
  }

  throw new Error("Sidecar entry not found; run `pnpm build` first");
}
