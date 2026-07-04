import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

import {
  formatMemoryStatusLines,
  gatherMemoryStatus,
} from "../cli/status.js";
import { resolveMemoryAgentDir } from "../config/agentDir.js";
import { createMemoryStatusWidget, type MemoryStatusWidgetState } from "../ui/memoryStatusWidget.js";

import { parseMemoryStatusArgs } from "./parseMemoryStatusArgs.js";

export type MemoryStatusCommandDeps = {
  getAgentDir(): string | null;
};

let memoryStatusWidgetState: MemoryStatusWidgetState | null = null;

export function resetMemoryStatusWidgetState(): void {
  memoryStatusWidgetState = null;
}

function renderMemoryStatusWidget(
  ctx: ExtensionCommandContext,
  state: MemoryStatusWidgetState,
): void {
  ctx.ui.setWidget("pi-memory-status", (tui, theme) => createMemoryStatusWidget(tui, theme, state), {
    placement: "aboveEditor",
  });
}

function applyMemoryStatusAction(
  action: ReturnType<typeof parseMemoryStatusArgs>,
  refreshed: boolean,
): void {
  if (!memoryStatusWidgetState) return;

  if (action === "expand") {
    memoryStatusWidgetState.expanded = true;
    return;
  }
  if (action === "collapse") {
    memoryStatusWidgetState.expanded = false;
    return;
  }
  if (action === "toggle" && !refreshed) {
    memoryStatusWidgetState.expanded = !memoryStatusWidgetState.expanded;
    return;
  }
  if (action === "toggle" && refreshed) {
    memoryStatusWidgetState.expanded = false;
  }
}

export function createMemoryStatusCommand(deps: MemoryStatusCommandDeps) {
  return async (args: string | string[], ctx: ExtensionCommandContext): Promise<void> => {
    const action = parseMemoryStatusArgs(args);

    if (action === "hide") {
      memoryStatusWidgetState = null;
      if (ctx.hasUI) {
        ctx.ui.setWidget("pi-memory-status", undefined);
      }
      return;
    }

    const agentDir = deps.getAgentDir() ?? resolveMemoryAgentDir();

    const needsFetch = action === "refresh" || !memoryStatusWidgetState;

    if (needsFetch) {
      if (ctx.hasUI) {
        ctx.ui.setWorkingMessage("Checking memory…");
      }

      try {
        const report = await gatherMemoryStatus(agentDir);
        memoryStatusWidgetState = {
          report,
          expanded: memoryStatusWidgetState?.expanded ?? false,
        };
      } catch (error) {
        ctx.ui.notify(
          `Memory status failed: ${error instanceof Error ? error.message : String(error)}`,
          "warning",
        );
        return;
      } finally {
        if (ctx.hasUI) {
          ctx.ui.setWorkingMessage();
        }
      }
    }

    applyMemoryStatusAction(action, needsFetch);

    if (ctx.hasUI) {
      renderMemoryStatusWidget(ctx, memoryStatusWidgetState!);
      return;
    }

    const lines = ["pi-memory status", ...formatMemoryStatusLines(memoryStatusWidgetState!.report)];
    ctx.ui.notify(lines.join("\n"), "info");
  };
}

export function getMemoryStatusWidgetStateForTest(): MemoryStatusWidgetState | null {
  return memoryStatusWidgetState;
}

export function setMemoryStatusWidgetStateForTest(state: MemoryStatusWidgetState | null): void {
  memoryStatusWidgetState = state;
}
