import { describe, expect, it } from "vitest";

import { createLLMFactExtractor, type LLMClient } from "../src/trainer/llmExtractor.js";
import type { SessionTurn } from "../src/trainer/sessionLoader.js";

function makeTurns(texts: string[]): SessionTurn[] {
  return texts.map((content, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content,
    turnIndex: i,
  }));
}

describe("createLLMFactExtractor", () => {
  it("extracts entities, relations, and events from LLM response", async () => {
    const mockClient: LLMClient = {
      async complete(_prompt: string): Promise<string> {
        return JSON.stringify({
          entities: [
            { name: "Alice", type: "Person" },
            { name: "Acme Corp", type: "Company" },
            { name: "React", type: "Tool" },
          ],
          relations: [
            { head: "Alice", relation: "employed_at", tail: "Acme Corp", turn_index: 0, evidence: "Alice works at Acme Corp", negated: false },
            { head: "Alice", relation: "uses", tail: "React", turn_index: 2, evidence: "Alice uses React daily", negated: false },
          ],
          events: [
            { description: "Alice joined Acme Corp", turn_index: 0 },
          ],
        });
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient, batchSize: 10 });
    const turns = makeTurns([
      "Alice works at Acme Corp as a frontend engineer.",
      "That's great! What technologies does she use?",
      "Alice uses React daily for their main product.",
    ]);

    const result = await extractor.extractFacts(turns, "session-1");

    expect(result.entities).toHaveLength(3);
    expect(result.entities.map((e) => e.name).sort()).toEqual(["Acme Corp", "Alice", "React"]);
    expect(result.entities.find((e) => e.name === "Alice")!.type).toBe("Person");
    expect(result.entities.find((e) => e.name === "Acme Corp")!.type).toBe("Company");

    expect(result.relations).toHaveLength(2);
    expect(result.relations[0]!.headName).toBe("Alice");
    expect(result.relations[0]!.relation).toBe("employed_at");
    expect(result.relations[0]!.tailName).toBe("Acme Corp");
    expect(result.relations[1]!.relation).toBe("uses");

    expect(result.events).toHaveLength(1);
    expect(result.events[0]!.description).toBe("Alice joined Acme Corp");
    expect(result.events[0]!.sessionId).toBe("session-1");
  });

  it("handles negated relations", async () => {
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        return JSON.stringify({
          entities: [
            { name: "Bob", type: "Person" },
            { name: "Vue", type: "Tool" },
          ],
          relations: [
            { head: "Bob", relation: "uses", tail: "Vue", turn_index: 0, evidence: "Bob no longer uses Vue", negated: true },
          ],
          events: [],
        });
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient });
    const turns = makeTurns(["Bob no longer uses Vue, switched to React."]);
    const result = await extractor.extractFacts(turns, "session-neg");

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]!.negated).toBe(true);
  });

  it("filters invalid relation types from LLM response", async () => {
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        return JSON.stringify({
          entities: [{ name: "X", type: "Tool" }],
          relations: [
            { head: "A", relation: "invented_by", tail: "B", turn_index: 0, evidence: "x" },
            { head: "A", relation: "uses", tail: "X", turn_index: 0, evidence: "valid" },
          ],
          events: [],
        });
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient });
    const turns = makeTurns(["A uses X"]);
    const result = await extractor.extractFacts(turns, "s1");

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]!.relation).toBe("uses");
  });

  it("handles markdown-wrapped JSON in LLM response", async () => {
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        return "```json\n" + JSON.stringify({
          entities: [{ name: "TypeScript", type: "Tool" }],
          relations: [],
          events: [],
        }) + "\n```";
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient });
    const turns = makeTurns(["We use TypeScript."]);
    const result = await extractor.extractFacts(turns, "s2");

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("TypeScript");
  });

  it("batches turns according to batchSize", async () => {
    let callCount = 0;
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        callCount++;
        return JSON.stringify({ entities: [{ name: `Entity${callCount}`, type: "Tool" }], relations: [], events: [] });
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient, batchSize: 3 });
    const turns = makeTurns(Array.from({ length: 7 }, (_, i) => `Turn ${i}`));
    const result = await extractor.extractFacts(turns, "batch-test");

    expect(callCount).toBe(3); // ceil(7/3) = 3 batches
    expect(result.entities).toHaveLength(3);
  });

  it("falls back to regex extractor on LLM failure", async () => {
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        throw new Error("API rate limit exceeded");
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient });
    const turns = makeTurns([
      "Alice works at Google and uses TypeScript for the main project.",
    ]);
    const result = await extractor.extractFacts(turns, "fallback-test");

    // Regex extractor should still extract something (at least TypeScript as a known tool)
    expect(result.entities.length).toBeGreaterThan(0);
    const toolNames = result.entities.map((e) => e.name.toLowerCase());
    expect(toolNames).toContain("typescript");
  });

  it("falls back per-batch: successful batches preserved", async () => {
    let callNum = 0;
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        callNum++;
        if (callNum === 2) throw new Error("fail on batch 2");
        return JSON.stringify({
          entities: [{ name: "LLMEntity", type: "Project" }],
          relations: [],
          events: [],
        });
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient, batchSize: 2 });
    const turns = makeTurns([
      "Working on LLMEntity project.",
      "The team uses Docker for deployment.",
      "Alice created the architecture. She uses TypeScript daily.",
      "Final review done.",
    ]);
    const result = await extractor.extractFacts(turns, "partial-fail");

    const llmEntities = result.entities.filter((e) => e.name === "LLMEntity");
    expect(llmEntities.length).toBeGreaterThanOrEqual(1);
    // Batch 2 fell back to regex — should still have some entities
    expect(result.entities.length).toBeGreaterThan(1);
  });

  it("handles empty entity names gracefully", async () => {
    const mockClient: LLMClient = {
      async complete(): Promise<string> {
        return JSON.stringify({
          entities: [
            { name: "", type: "Person" },
            { name: "Valid", type: "Tool" },
            { name: "A".repeat(200), type: "Tool" },
          ],
          relations: [],
          events: [],
        });
      },
    };

    const extractor = createLLMFactExtractor({ client: mockClient });
    const turns = makeTurns(["test"]);
    const result = await extractor.extractFacts(turns, "empty-name");

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]!.name).toBe("Valid");
  });
});
