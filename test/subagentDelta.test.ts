import { describe, expect, it } from "vitest";

import {
  filterCompactionDelta,
  shouldSkipSubagentCompactionIngest,
} from "../src/compact/subagentDelta.js";
import { isSubagentSession } from "../src/utils/session/index.js";

describe("isSubagentSession", () => {
  it("detects parentSession and parent_session", () => {
    const mkCtx = (header: Record<string, unknown>) =>
      ({
        sessionManager: { getHeader: () => header },
      }) as Parameters<typeof isSubagentSession>[0];

    expect(isSubagentSession(mkCtx({ parentSession: "/tmp/parent.jsonl" }))).toBe(true);
    expect(isSubagentSession(mkCtx({ parent_session: "/tmp/parent.jsonl" }))).toBe(true);
    expect(isSubagentSession(mkCtx({}))).toBe(false);
  });
});

describe("subagent compaction delta", () => {
  it("filters entries already in MEMORY", () => {
    const existing = [
      {
        id: "1",
        section: "Findings" as const,
        content: "already known",
        timestamp: "",
        sourceFile: "MEMORY.md",
        line: 1,
      },
    ];
    const parsed = [
      { id: "", section: "Findings" as const, content: "already known", timestamp: "" },
      { id: "", section: "Todos" as const, content: "new task", timestamp: "" },
    ];

    expect(filterCompactionDelta(parsed, existing)).toEqual([
      { id: "", section: "Todos", content: "new task", timestamp: "" },
    ]);
  });

  it("skips ingest when export has no delta", () => {
    const parsed = [{ id: "", section: "Findings" as const, content: "dup", timestamp: "" }];
    expect(shouldSkipSubagentCompactionIngest(parsed, [])).toBe(true);
    expect(shouldSkipSubagentCompactionIngest([], [])).toBe(false);
  });
});
