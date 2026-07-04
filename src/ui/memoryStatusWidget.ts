import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

import type { MemoryStatusReport } from "../cli/status.js";
import {
  formatMemoryStatusSummary,
  formatMemoryStatusTuiLines,
  piStatusPalette,
} from "../cli/status.js";

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
  private cachedWidth?: number;
  private cachedLines?: string[];
  private version = 0;
  private cachedVersion = -1;

  constructor(
    private readonly theme: Theme,
    private state: MemoryStatusWidgetState,
  ) {}

  invalidate(): void {
    this.cachedLines = undefined;
  }

  render(width: number): string[] {
    if (this.cachedLines && this.cachedWidth === width && this.cachedVersion === this.version) {
      return this.cachedLines;
    }

    const palette = piStatusPalette(this.theme);
    const lines: string[] = [];

    if (!this.state.expanded) {
      const summary = formatMemoryStatusSummary(this.state.report, palette, (text) =>
        this.theme.fg("accent", text),
      );
      const hint = this.theme.fg("dim", " (/memory-status to expand)");
      lines.push(truncateToWidth(`${summary}${hint}`, width));
    } else {
      lines.push(truncateToWidth(formatHeader(this.theme, width), width));
      for (const line of formatMemoryStatusTuiLines(this.state.report, palette, this.theme)) {
        lines.push(truncateToWidth(`  ${line}`, width));
      }
      lines.push(
        truncateToWidth(
          this.theme.fg("dim", "  /memory-status to collapse · /memory-status hide to dismiss"),
          width,
        ),
      );
    }

    this.cachedLines = lines;
    this.cachedWidth = width;
    this.cachedVersion = this.version;
    return lines;
  }
}

export function createMemoryStatusWidget(
  _tui: TUI,
  theme: Theme,
  state: MemoryStatusWidgetState,
): MemoryStatusWidget {
  return new MemoryStatusWidget(theme, state);
}
