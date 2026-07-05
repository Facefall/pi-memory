import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import { createMemoryRuntime } from "../../src/extension/createMemoryRuntime.js";

const mockEpisodicPreflight = vi.fn();

vi.mock("../../src/preflight/episodic.js", () => ({
  runEpisodicPreflight: (...args: unknown[]) => mockEpisodicPreflight(...args),
}));

vi.mock("../../src/adapters/llm/index.js", () => ({
  createLlmClient: vi.fn().mockResolvedValue({ complete: vi.fn() }),
}));

vi.mock("../../src/extension/lifecycle.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/extension/lifecycle.js")>();
  return {
    ...actual,
    bootstrapSidecar: vi.fn().mockResolvedValue({
      reindexScheduler: { schedule: vi.fn(), runNow: vi.fn().mockResolvedValue(undefined) },
      unsubSyncToSidecar: vi.fn(),
    }),
    bootstrapConsolidate: vi.fn().mockReturnValue({
      consolidateScheduler: { schedule: vi.fn(), runNow: vi.fn().mockResolvedValue(undefined) },
      stopConsolidateInterval: vi.fn(),
      unsubConsolidateCheck: vi.fn(),
    }),
    loadSessionMemoryCap: vi.fn().mockResolvedValue("cap-block"),
  };
});

vi.mock("../../src/sidecar/sidecarManager.js", () => ({
  ensureSidecarRunning: vi.fn().mockResolvedValue(undefined),
  stopSidecar: vi.fn().mockResolvedValue(undefined),
}));

function mkCtx(overrides: Record<string, unknown> = {}): ExtensionContext {
  return {
    sessionManager: {
      getSessionFile: () => "/tmp/session.jsonl",
      getHeader: () => ({}),
    },
    hasUI: false,
    signal: new AbortController().signal,
    ...overrides,
  } as ExtensionContext;
}

function userMessage(text: string): AgentMessage {
  return { role: "user", content: text, timestamp: Date.now() } as AgentMessage;
}

describe("MemoryRuntime", () => {
  beforeEach(() => {
    mockEpisodicPreflight.mockReset();
    mockEpisodicPreflight.mockResolvedValue({ privateContext: "episodic ctx" });
  });

  it("runContext reuses turnPreflight cache for matching payload", async () => {
    const ctx = mkCtx();
    const runtime = createMemoryRuntime({ ctx });

    await runtime.runBeforeAgentStart({ prompt: "hello" }, ctx);
    expect(mockEpisodicPreflight).toHaveBeenCalledTimes(1);

    mockEpisodicPreflight.mockClear();
    const result = await runtime.runContext({ messages: [userMessage("hello")] }, ctx);

    expect(mockEpisodicPreflight).not.toHaveBeenCalled();
    expect(String((result!.messages[0] as { content: string }).content)).toContain("episodic ctx");
  });

  it("subagent runBeforeAgentStart does not call episodic preflight", async () => {
    const ctx = mkCtx({
      sessionManager: {
        getSessionFile: () => "/tmp/sub.jsonl",
        getHeader: () => ({ parentSession: "/tmp/parent.jsonl" }),
      },
    });
    const runtime = createMemoryRuntime({ ctx });
    await runtime.reloadSessionMemoryCap();

    await runtime.runBeforeAgentStart({ prompt: "hello" }, ctx);

    expect(mockEpisodicPreflight).not.toHaveBeenCalled();
    expect(runtime.getTurnPreflight()).toEqual({
      userPayload: "hello",
      privateContext: "cap-block",
    });
  });

  it("dispose clears runtime state", async () => {
    const runtime = createMemoryRuntime({ ctx: mkCtx() });
    await runtime.bootstrap(mkCtx(), { getFlag: () => undefined } as never);

    await runtime.dispose();

    expect(runtime.getTurnPreflight()).toBeNull();
    expect(runtime.getLlm()).toBeNull();
  });
});
