import { beforeEach, describe, expect, it, vi } from "vitest";

import { runEpisodicPreflight } from "../src/preflight/episodic.js";
import type { LlmClient } from "../src/adapters/llm/types.js";
import type { MemoryStore } from "../src/store/memoryStore.js";

const mockQuery = vi.fn();

vi.mock("../src/sidecar/client.js", () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

function createMockStore(overrides: Partial<MemoryStore> = {}): MemoryStore {
  return {
    isEmpty: vi.fn().mockResolvedValue(false),
    readForFallback: vi.fn().mockResolvedValue(""),
    ...overrides,
  } as unknown as MemoryStore;
}

function createMockLlm(response = '{"what":"Vitest"}'): LlmClient {
  return {
    complete: vi.fn().mockResolvedValue(response),
  };
}

describe("runEpisodicPreflight", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({
      type: "result",
      request_id: "req-1",
      results: [{ content: "Use Vitest", source: "MEMORY.md", timestamp: "2026-01-01T00:00:00.000Z", relevance: 0.9 }],
    });
  });

  it("skips helper LLM on first turn when forceEpisodic but not forceIntent", async () => {
    const llm = createMockLlm();

    await runEpisodicPreflight("hello", {
      socketPath: "/tmp/sidecar.sock",
      agentDir: "/tmp/agent",
      store: createMockStore(),
      llm,
      forceEpisodic: true,
    });

    expect(llm.complete).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalled();
  });

  it("calls helper LLM for memory-cue messages", async () => {
    const llm = createMockLlm('{"what":"Vitest"}');

    await runEpisodicPreflight("remember what testing framework we picked last time", {
      socketPath: "/tmp/sidecar.sock",
      agentDir: "/tmp/agent",
      store: createMockStore(),
      llm,
    });

    expect(llm.complete).toHaveBeenCalledTimes(1);
  });

  it("skips episodic when memory store is empty", async () => {
    const llm = createMockLlm();

    const result = await runEpisodicPreflight("remember Vitest", {
      socketPath: "/tmp/sidecar.sock",
      agentDir: "/tmp/agent",
      store: createMockStore({ isEmpty: vi.fn().mockResolvedValue(true) }),
      llm,
      forceEpisodic: true,
    });

    expect(result).toBeNull();
    expect(llm.complete).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("falls back to raw_query when helper LLM times out", async () => {
    const llm: LlmClient = {
      complete: vi.fn((_prompt, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
      ),
    };

    await runEpisodicPreflight("remember what testing framework we picked last time", {
      socketPath: "/tmp/sidecar.sock",
      agentDir: "/tmp/agent",
      store: createMockStore(),
      llm,
      budgetMs: 50,
    });

    expect(mockQuery).toHaveBeenCalled();
  });
});
