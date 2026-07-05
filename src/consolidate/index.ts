export { dedupeEntries } from "./mergeEntries.js";
export { mergeEntriesWithLlm } from "./mergeWithLlm.js";
export {
  mergeMemoryEntries,
  scheduleMergeMemoryEntriesInBackground,
} from "./mergeMemoryEntries.js";
export { runConsolidateJob, type RunConsolidateJobOptions, type RunConsolidateJobResult } from "./runJob.js";
export { createConsolidateScheduler, startConsolidateInterval, type ConsolidateScheduler } from "./scheduler.js";
