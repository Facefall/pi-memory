import { afterEach, describe, expect, it, vi } from "vitest";

import { createEmbedder, resetEmbedderForTests } from "../../src/adapters/embed/factory.js";
import { createHashEmbedder } from "../../src/adapters/embed/hash.js";
import { createOllamaEmbedder } from "../../src/adapters/embed/ollama.js";
import { resolveEmbedDim } from "../../src/config/env.js";

describe("embed adapters", () => {
  afterEach(() => {
    resetEmbedderForTests();
    vi.restoreAllMocks();
  });

  it("hash embedder returns normalized vectors", async () => {
    const embedder = createHashEmbedder(8);
    const a = await embedder.embed("hello");
    expect(a.length).toBe(8);
    const norm = Math.sqrt([...a].reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("resolveEmbedDim uses known model table", () => {
    expect(resolveEmbedDim("nomic-embed-text")).toBe(768);
    expect(resolveEmbedDim("text-embedding-3-small")).toBe(1536);
    expect(resolveEmbedDim("custom-model", 512)).toBe(512);
  });

  it("factory selects ollama from env", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            model: "nomic-embed-text",
            embeddings: [[0.1, 0.2, 0.3, 0.4]],
          }),
      })),
    );

    const embedder = createEmbedder({
      embedder: "ollama",
      ollamaBaseUrl: "http://127.0.0.1:11434",
      ollamaEmbedModel: "nomic-embed-text",
      openaiEmbedModel: "text-embedding-3-small",
      httpTimeoutMs: 5_000,
      embedDimOverride: 4,
    });

    const vec = await embedder.embed("test");
    expect(embedder.provider).toBe("ollama");
    expect(vec.length).toBe(4);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:11434/api/embed",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("ollama embedBatch sends array input", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      text: async () =>
        JSON.stringify({
          model: "nomic-embed-text",
          embeddings: [
            [1, 0, 0],
            [0, 1, 0],
          ],
        }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const embedder = createOllamaEmbedder({
      baseUrl: "http://127.0.0.1:11434",
      model: "nomic-embed-text",
      dim: 3,
      timeoutMs: 5_000,
    });

    const vectors = await embedder.embedBatch(["a", "b"]);
    expect(vectors).toHaveLength(2);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.input).toEqual(["a", "b"]);
  });
});
