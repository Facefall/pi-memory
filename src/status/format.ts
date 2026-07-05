import type { Theme } from "@earendil-works/pi-coding-agent";

import type { MemoryStatusReport, StatusPalette } from "./types.js";

const plainPalette: StatusPalette = {
  dim: (text) => text,
  ok: (text) => text,
  bad: (text) => text,
  warn: (text) => text,
};

export function piStatusPalette(theme: Theme): StatusPalette {
  return {
    dim: (text) => theme.fg("dim", text),
    ok: (text) => theme.fg("success", text),
    bad: (text) => theme.fg("error", text),
    warn: (text) => theme.fg("warning", text),
  };
}

type MemoryStatusRow = {
  label: string;
  value: () => string;
};

function embedderMatchesIndex(report: MemoryStatusReport): boolean {
  const { embeddingProvider, embeddingModel, embeddingDim } = report.vectorIndex;
  if (!embeddingProvider || !embeddingModel || embeddingDim === undefined) return true;
  return (
    embeddingProvider === report.embedder.provider &&
    embeddingModel === report.embedder.model &&
    embeddingDim === report.embedder.dim
  );
}

function formatVectorIndexLine(report: MemoryStatusReport): string {
  const { generation, chunkCount, readError } = report.vectorIndex;
  if (readError) {
    return `(unreadable: ${readError})`;
  }
  if (generation === undefined || chunkCount === undefined) {
    return "(unknown — start sidecar or run pi-memory status again)";
  }
  return `gen=${generation} chunks=${chunkCount}`;
}

function formatIndexEmbedderLine(report: MemoryStatusReport, palette: StatusPalette): string {
  const { embeddingProvider, embeddingModel, embeddingDim, chunkCount, readError } = report.vectorIndex;
  if (readError) {
    return palette.dim("(unavailable)");
  }
  if (!embeddingProvider || !embeddingModel || embeddingDim === undefined) {
    if (chunkCount === 0) {
      return palette.dim("(empty — reindex pending)");
    }
    return palette.dim("(no embedding meta — run reindex)");
  }

  const label = `${embeddingProvider}/${embeddingModel} (${embeddingDim}d)`;
  if (embedderMatchesIndex(report)) {
    return label;
  }
  return palette.warn(`${label} ≠ configured`);
}

function memoryStatusRows(report: MemoryStatusReport, palette: StatusPalette = plainPalette): MemoryStatusRow[] {
  const lastConsolidated = report.memory.lastConsolidatedAt ?? "(never)";

  const rows: MemoryStatusRow[] = [
    { label: "agent dir", value: () => report.agentDir },
    { label: "MEMORY lines", value: () => String(report.memory.lineCount) },
    { label: "entries", value: () => String(report.memory.entryCount) },
    { label: "overflow files", value: () => String(report.memory.overflowFileCount) },
    {
      label: "last consolidate",
      value: () =>
        !report.memory.lastConsolidatedAt ? palette.dim(lastConsolidated) : lastConsolidated,
    },
    {
      label: "sidecar",
      value: () => {
        const sidecarState = report.sidecar.running ? "running" : "not reachable";
        const state = report.sidecar.running ? palette.ok(sidecarState) : palette.bad(sidecarState);
        return `${state} ${palette.dim(`(${report.sidecar.socketPath})`)}`;
      },
    },
  ];

  if (!report.vectorIndex.exists) {
    rows.push({
      label: "vector index",
      value: () => palette.dim("(missing — write MEMORY or start session)"),
    });
  } else {
    rows.push({
      label: "vector index",
      value: () => {
        const line = formatVectorIndexLine(report);
        if (report.vectorIndex.readError) return palette.bad(line);
        if (report.vectorIndex.generation === undefined || report.vectorIndex.chunkCount === undefined) {
          return palette.dim(line);
        }
        return line;
      },
    });
    rows.push({
      label: "index embedder",
      value: () => formatIndexEmbedderLine(report, palette),
    });
  }

  rows.push({
    label: "configured embedder",
    value: () => `${report.embedder.provider}/${report.embedder.model} (${report.embedder.dim}d)`,
  });

  return rows;
}

export function formatMemoryStatusSummary(
  report: MemoryStatusReport,
  palette: StatusPalette,
  accent: (text: string) => string,
): string {
  const parts = [
    accent("pi-memory"),
    palette.dim(`entries=${report.memory.entryCount}`),
    report.sidecar.running ? palette.ok("sidecar up") : palette.bad("sidecar down"),
  ];

  if (!report.vectorIndex.exists) {
    parts.push(palette.dim("no index"));
  } else {
    const vec = formatVectorIndexLine(report);
    if (report.vectorIndex.readError) {
      parts.push(palette.bad(vec));
    } else if (report.vectorIndex.generation === undefined || report.vectorIndex.chunkCount === undefined) {
      parts.push(palette.dim(vec));
    } else {
      parts.push(vec);
    }
  }

  return parts.join(palette.dim(" · "));
}

export function formatMemoryStatusLines(report: MemoryStatusReport, palette?: StatusPalette): string[] {
  return memoryStatusRows(report, palette).map(
    ({ label, value }) => `${label.padEnd(16)} ${value()}`,
  );
}

export function formatMemoryStatusTuiLines(
  report: MemoryStatusReport,
  palette: StatusPalette,
  theme: Theme,
): string[] {
  return memoryStatusRows(report, palette).map(
    ({ label, value }) => `${theme.fg("muted", label.padEnd(16))} ${value()}`,
  );
}

export function printMemoryStatusRows(
  report: MemoryStatusReport,
  palette: StatusPalette,
  logLine: (label: string, value: string) => void,
): void {
  for (const { label, value } of memoryStatusRows(report, palette)) {
    logLine(label, value());
  }
}
