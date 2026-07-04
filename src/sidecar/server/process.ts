// Sidecar 子进程入口
import { loadEnv } from "../../config/loadEnv.js";
import { createSidecarServer } from "./server.js";

loadEnv();

function readArg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  const value = idx === -1 ? undefined : process.argv[idx + 1];
  if (!value) {
    throw new Error(`Missing required argument: ${flag}`);
  }
  return value;
}

const socketPath = readArg("--socket");
const dbPath = readArg("--db");

const { shutdown } = createSidecarServer({ socketPath, dbPath });

function onSignal(): void {
  shutdown();
  process.exit(0);
}

process.on("SIGTERM", onSignal);
process.on("SIGINT", onSignal);
