import { describe, expect, it } from "vitest";

import type { ErrorClass, MemoryQuerier, QueryIntent, ResponseEnvelope, ServiceStatus } from "../src/types.js";
import { MemoryRecallTool } from "../src/tools/memoryRecall.js";
import { classifyHTTP } from "../src/errclass.js";

const fixtureEnvelope: ResponseEnvelope = {
  protocol_version: 1,
  bundle_version: "0.6.0",
  request_id: "req-test",
  candidates: [
    {
      value: "Nexus",
      score: 1.0,
      evidence: "observed",
      supporting_event_ids: ["ev_1"],
    },
  ],
  memory_block: {
    groups: [
      {
        value: "Nexus",
        score: 1.0,
        evidence: "observed",
        support_count: 1,
        supporting_event_ids: ["ev_1"],
        entity_ids: ["ent_1"],
        scopes: [],
        via_relations: ["created"],
        via_anchor_entity_ids: [],
        observed_path: [],
        path_collision_count: 0,
      },
    ],
    notes: [],
  },
  warnings: [],
  reason: "",
  latency_ms: 12,
};

class MockQuerier implements MemoryQuerier {
  constructor(
    private st: ServiceStatus,
    private env: ResponseEnvelope | null = fixtureEnvelope,
    private errClass: ErrorClass = "ok",
  ) {}

  status(): ServiceStatus {
    return this.st;
  }

  async query() {
    return { env: this.env, errorClass: this.errClass };
  }
}

describe("classifyHTTP", () => {
  it("maps 200 to ok", () => {
    expect(classifyHTTP(200, fixtureEnvelope)).toBe("ok");
  });
  it("maps 503 not_ready to unavailable", () => {
    expect(
      classifyHTTP(503, {
        ...fixtureEnvelope,
        error: { code: "not_ready", message: "x", details: { sub_code: "not_ready" } },
      }),
    ).toBe("unavailable");
  });
});

describe("MemoryRecallTool", () => {
  it("requires anchor_mentions", async () => {
    const tool = new MemoryRecallTool(new MockQuerier("ready"));
    const r = await tool.run("{}");
    expect(r.isError).toBe(true);
    expect(r.content).toContain("anchor_mentions");
  });

  it("returns structured sidecar result when ready", async () => {
    const tool = new MemoryRecallTool(new MockQuerier("ready"));
    const r = await tool.run(
      JSON.stringify({ anchor_mentions: ["Alice"], mode: "direct_relation" }),
    );
    expect(r.isError).toBeFalsy();
    const body = JSON.parse(r.content) as { source: string; memory_block: unknown };
    expect(body.source).toBe("memory_sidecar");
    expect(body.memory_block).toBeTruthy();
  });

  it("falls back when service unavailable", async () => {
    const tool = new MemoryRecallTool(new MockQuerier("unavailable"), {
      sessionKeyword: async () => [{ snippet: "hello" }],
      memoryFileSnippet: async () => "memory line",
    });
    const r = await tool.run(
      JSON.stringify({ anchor_mentions: ["Bob"], mode: "direct_relation" }),
    );
    const body = JSON.parse(r.content) as {
      source: string;
      evidence_quality: string;
      fallback_reason: string;
    };
    expect(body.source).toBe("fallback");
    expect(body.evidence_quality).toBe("text_search");
    expect(body.fallback_reason).toBe("service_unavailable");
  });

  it("rejects broad relations", async () => {
    const tool = new MemoryRecallTool(new MockQuerier("ready"));
    const r = await tool.run(
      JSON.stringify({
        anchor_mentions: ["X"],
        relation_constraints: ["related_to"],
      }),
    );
    expect(r.isError).toBe(true);
  });

  it("coerces string-encoded anchor array", async () => {
    const tool = new MemoryRecallTool(new MockQuerier("ready"));
    const r = await tool.run(
      JSON.stringify({ anchor_mentions: '["Alice"]' }),
    );
    expect(r.isError).toBeFalsy();
  });
});

describe("QueryIntent defaults", () => {
  it("applies result_limit and evidence_budget defaults via tool", async () => {
    let captured: QueryIntent | null = null;
    const q: MemoryQuerier = {
      status: () => "ready",
      async query(intent) {
        captured = intent;
        return { env: fixtureEnvelope, errorClass: "ok" };
      },
    };
    const tool = new MemoryRecallTool(q);
    await tool.run(JSON.stringify({ anchor_mentions: ["A"] }));
    expect(captured?.result_limit).toBe(10);
    expect(captured?.evidence_budget).toBe(5);
    expect(captured?.mode).toBe("direct_relation");
  });
});
