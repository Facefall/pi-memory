import type { CliLog } from "./log.js";
import { runConsolidateJob } from "../consolidate/runJob.js";
import { runDrainShutdownQueueJob } from "../shutdown/runDrainJob.js";
import type { LlmClient } from "../adapters/llm/types.js";
import type { MemoryStore } from "../store/memoryStore.js";

export type MaintenanceCliOptions = {
  cron: boolean;
  force: boolean;
  verbose: boolean;
};

export async function runMaintenanceCommand(opts: {
  store: MemoryStore;
  agentDir: string;
  llm: LlmClient | null;
  options: MaintenanceCliOptions;
  log: CliLog;
}): Promise<number> {
  const { store, agentDir, llm, options, log } = opts;

  log.debug(`maintenance agentDir=${agentDir} cron=${options.cron} force=${options.force}`);

  log.line("step", "consolidate");
  const consolidateResult = await runConsolidateJob({
    store,
    agentDir,
    llm,
    cronFired: options.cron,
    force: options.force,
  });

  switch (consolidateResult.status) {
    case "skipped":
      log.warn("consolidate skipped (conditions not met)");
      break;
    case "consolidated":
      log.success("consolidate complete");
      if (options.verbose) {
        log.line("entries", `${consolidateResult.stats.entriesBefore} → ${consolidateResult.stats.entriesAfter}`);
        log.line(
          "overflow files",
          `${consolidateResult.stats.overflowBefore} → ${consolidateResult.stats.overflowAfter}`,
        );
      }
      break;
    case "failed":
      log.error(`consolidate failed: ${consolidateResult.error.message}`);
      return 1;
  }

  log.line("step", "drain-shutdown-queue");
  const drainResult = await runDrainShutdownQueueJob({ store, agentDir, llm });

  switch (drainResult.status) {
    case "empty":
      log.warn("shutdown queue empty");
      return 0;
    case "drained":
      log.success("shutdown queue drained");
      if (options.verbose) {
        log.line("queued sessions", String(drainResult.stats.queued));
        log.line("ingested sessions", String(drainResult.stats.ingested));
        log.line("skipped sessions", String(drainResult.stats.skipped));
        log.line("appended entries", String(drainResult.stats.appended));
        if (drainResult.stats.indexGeneration !== undefined) {
          log.line("index generation", String(drainResult.stats.indexGeneration));
        }
      }
      return 0;
    case "failed":
      log.error(`shutdown queue drain failed: ${drainResult.error.message}`);
      return 1;
  }
}

export async function runDrainShutdownQueueCommand(opts: {
  store: MemoryStore;
  agentDir: string;
  llm: LlmClient | null;
  verbose: boolean;
  log: CliLog;
}): Promise<number> {
  const result = await runDrainShutdownQueueJob({
    store: opts.store,
    agentDir: opts.agentDir,
    llm: opts.llm,
  });

  switch (result.status) {
    case "empty":
      opts.log.warn("shutdown queue empty");
      return 0;
    case "drained":
      opts.log.success("shutdown queue drained");
      if (opts.verbose) {
        opts.log.line("queued sessions", String(result.stats.queued));
        opts.log.line("ingested sessions", String(result.stats.ingested));
        opts.log.line("skipped sessions", String(result.stats.skipped));
        opts.log.line("appended entries", String(result.stats.appended));
      }
      return 0;
    case "failed":
      opts.log.error(`shutdown queue drain failed: ${result.error.message}`);
      return 1;
  }
}

export async function runConsolidateCommand(opts: {
  store: MemoryStore;
  agentDir: string;
  llm: LlmClient | null;
  cron: boolean;
  force: boolean;
  verbose: boolean;
  log: CliLog;
}): Promise<number> {
  const result = await runConsolidateJob({
    store: opts.store,
    agentDir: opts.agentDir,
    llm: opts.llm,
    cronFired: opts.cron,
    force: opts.force,
  });

  switch (result.status) {
    case "skipped":
      opts.log.warn("consolidate skipped (conditions not met)");
      return 0;
    case "consolidated":
      opts.log.success("consolidate complete");
      if (opts.verbose) {
        opts.log.line("entries", `${result.stats.entriesBefore} → ${result.stats.entriesAfter}`);
        opts.log.line(
          "overflow files",
          `${result.stats.overflowBefore} → ${result.stats.overflowAfter}`,
        );
      }
      return 0;
    case "failed":
      opts.log.error(`consolidate failed: ${result.error.message}`);
      return 1;
  }
}
