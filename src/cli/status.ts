import { cliStatusPalette } from "./theme.js";

import type { CliLog } from "./log.js";
import type { MemoryStatusReport } from "../status/types.js";
import { formatMemoryStatusLines, printMemoryStatusRows } from "../status/format.js";
import { gatherMemoryStatus } from "../status/gather.js";

export type { MemoryStatusReport, StatusPalette } from "../status/types.js";
export { gatherMemoryStatus } from "../status/gather.js";
export {
  formatMemoryStatusLines,
  formatMemoryStatusSummary,
  formatMemoryStatusTuiLines,
  piStatusPalette,
} from "../status/format.js";

export function printMemoryStatus(report: MemoryStatusReport, log: CliLog): void {
  printMemoryStatusRows(report, cliStatusPalette(), (label, value) => log.line(label, value));
}

export async function runStatusCommand(agentDir: string, log: CliLog): Promise<number> {
  const report = await gatherMemoryStatus(agentDir);
  printMemoryStatus(report, log);
  return 0;
}
