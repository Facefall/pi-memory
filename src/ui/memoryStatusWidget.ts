import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

import {
  MEMORY_STATUS_COLLAPSE_HINT,
  MEMORY_STATUS_EXPAND_HINT,
  formatMemoryStatusSummary,
  formatMemoryStatusTuiLines,
  piStatusPalette,
  type MemoryStatusReport,
} from "../status/index.js";

export type MemoryStatusWidgetState = {
  report: MemoryStatusReport;
  expanded: boolean;
};

function formatHeader(theme: Theme, width: number): string {
  const title = theme.fg("accent", theme.bold("pi-memory status"));
  const fill = Math.max(0, width - title.length - 2);
  const left = Math.floor(fill / 2);
  const right = fill - left;
  return `${theme.fg("borderMuted", "─".repeat(left))} ${title} ${theme.fg("borderMuted", "─".repeat(right))}`;
}

export class MemoryStatusWidget implements Component {
  constructor(
    private readonly theme: Theme,
    private readonly state: MemoryStatusWidgetState,
  ) {}

  invalidate(): void {}

  render(width: number): string[] {
    const palette = piStatusPalette(this.theme);
    const lines: string[] = [];

    if (!this.state.expanded) {
      const summary = formatMemoryStatusSummary(this.state.report, palette, (text) =>
        this.theme.fg("accent", text),
      );
      const hint = this.theme.fg("dim", MEMORY_STATUS_EXPAND_HINT);
      lines.push(truncateToWidth(`${summary}${hint}`, width));
    } else {
      lines.push(truncateToWidth(formatHeader(this.theme, width), width));
      for (const line of formatMemoryStatusTuiLines(this.state.report, palette, this.theme)) {
        lines.push(truncateToWidth(`  ${line}`, width));
      }
      lines.push(truncateToWidth(this.theme.fg("dim", MEMORY_STATUS_COLLAPSE_HINT), width));
    }

    return lines;
  }
}

export function createMemoryStatusWidget(
  theme: Theme,
  state: MemoryStatusWidgetState,
): MemoryStatusWidget {
  return new MemoryStatusWidget(theme, state);
}
