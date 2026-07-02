import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { deltaMerge } from "../src/trainer/deltaMerge.js";
import { loadExistingBundle } from "../src/trainer/bundleLoader.js";
import { buildBundle } from "../src/trainer/bundleBuilder.js";
import { extractFacts } from "../src/trainer/extractFacts.js";
import { resolveEntities } from "../src/trainer/entityResolver.js";
import { trainBundle } from "../src/trainer/index.js";
import type { ResolvedGraph, ResolvedEntity, ResolvedRelation } from "../src/trainer/entityResolver.js";
import type { ExtractedEvent } from "../src/trainer/extractFacts.js";
import type { LoadedSession } from "../src/trainer/sessionLoader.js";

function ent(id: string, name: string, type = "Tool" as const): ResolvedEntity {
  return { id, canonicalName: name, type, aliases: [], mentions: [] };
}

function edge(
  head: string, rel: string, tail: string,
  extra?: Partial<ResolvedRelation>,
): ResolvedRelation {
  return {
    headEntityId: head, relation: rel, tailEntityId: tail,
    sessionId: "s1", turnIndex: 0, evidence: "", ...extra,
  };
}

function ev(desc: string, sessionId = "s1"): ExtractedEvent {
  return { description: desc, sessionId, timestamp: "2026-06-01T00:00:00Z", turnIndex: 0 };
}

// ── deltaMerge unit tests ──

describe("deltaMerge", () => {
  it("adds new entities and edges", () => {
    const existing = {
      graph: {
        entities: [ent("ent_aaa", "React")],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [ent("ent_bbb", "Vue")],
        relations: [edge("ent_xxx", "uses", "ent_bbb")],
      },
      events: [ev("deployed Vue")],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.entities).toHaveLength(2);
    expect(result.graph.relations).toHaveLength(2);
    expect(result.events).toHaveLength(1);
    expect(result.delta.added).toBeGreaterThanOrEqual(2);
  });

  it("skips duplicate edges", () => {
    const existing = {
      graph: {
        entities: [ent("ent_aaa", "React"), ent("ent_xxx", "Acme", "Company")],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [ent("ent_aaa", "React")],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.relations).toHaveLength(1);
    expect(result.delta.skipped).toBeGreaterThanOrEqual(1);
    const skipEntries = result.delta.entries.filter((e) => e.op === "skip" && e.kind === "edge");
    expect(skipEntries.length).toBeGreaterThanOrEqual(1);
  });

  it("skips duplicate events", () => {
    const existing = {
      graph: { entities: [], relations: [] },
      events: [ev("deployed the app", "s1")],
    };
    const incoming = {
      graph: { entities: [], relations: [] },
      events: [ev("deployed the app", "s1")],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.events).toHaveLength(1);
    expect(result.delta.skipped).toBeGreaterThanOrEqual(1);
  });

  it("deletes edges matching negated relations (wildcard head)", () => {
    const existing = {
      graph: {
        entities: [ent("ent_aaa", "React"), ent("ent_xxx", "Acme", "Company")],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [ent("ent_aaa", "React")],
        relations: [
          { ...edge("", "uses", "ent_aaa"), negated: true },
        ],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.relations).toHaveLength(0);
    expect(result.delta.deleted).toBe(1);
  });

  it("deletes edges matching negated relations (specific head)", () => {
    const existing = {
      graph: {
        entities: [
          ent("ent_aaa", "React"),
          ent("ent_xxx", "Acme", "Company"),
          ent("ent_yyy", "Beta Corp", "Company"),
        ],
        relations: [
          edge("ent_xxx", "uses", "ent_aaa"),
          edge("ent_yyy", "uses", "ent_aaa"),
        ],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [],
        relations: [
          { ...edge("ent_xxx", "uses", "ent_aaa"), negated: true },
        ],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.relations).toHaveLength(1);
    expect(result.graph.relations[0]!.headEntityId).toBe("ent_yyy");
    expect(result.delta.deleted).toBe(1);
  });

  it("updates edge when evidence contains update signal", () => {
    const existing = {
      graph: {
        entities: [
          ent("ent_aaa", "React"),
          ent("ent_bbb", "Vue"),
          ent("ent_xxx", "Acme", "Company"),
        ],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [ent("ent_bbb", "Vue")],
        relations: [edge("ent_xxx", "uses", "ent_bbb", {
          evidence: "Acme now uses Vue for the frontend",
        })],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.relations).toHaveLength(1);
    expect(result.graph.relations[0]!.tailEntityId).toBe("ent_bbb");
    expect(result.delta.updated).toBeGreaterThanOrEqual(1);
  });

  it("adds (not updates) when no update signal in evidence", () => {
    const existing = {
      graph: {
        entities: [
          ent("ent_aaa", "React"),
          ent("ent_bbb", "Vue"),
          ent("ent_xxx", "Acme", "Company"),
        ],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [ent("ent_bbb", "Vue")],
        relations: [edge("ent_xxx", "uses", "ent_bbb", {
          evidence: "Acme also uses Vue",
        })],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.relations).toHaveLength(2);
    expect(result.delta.added).toBeGreaterThanOrEqual(1);
    expect(result.delta.updated).toBe(0);
  });

  it("merges entity mentions from both sources", () => {
    const existing = {
      graph: {
        entities: [{
          ...ent("ent_aaa", "React"),
          mentions: [{ sessionId: "s1", turnIndex: 0, snippet: "old mention" }],
        }],
        relations: [],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [{
          ...ent("ent_aaa", "React"),
          mentions: [{ sessionId: "s2", turnIndex: 0, snippet: "new mention" }],
        }],
        relations: [],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.entities).toHaveLength(1);
    expect(result.graph.entities[0]!.mentions).toHaveLength(2);
  });

  it("handles Chinese negation '不再用'", () => {
    const existing = {
      graph: {
        entities: [ent("ent_aaa", "Redis"), ent("ent_xxx", "Team", "Organization")],
        relations: [edge("ent_xxx", "uses", "ent_aaa")],
      },
      events: [],
    };
    const incoming = {
      graph: {
        entities: [ent("ent_aaa", "Redis")],
        relations: [{ ...edge("", "uses", "ent_aaa"), negated: true }],
      },
      events: [],
    };

    const result = deltaMerge(existing, incoming);
    expect(result.graph.relations).toHaveLength(0);
    expect(result.delta.deleted).toBe(1);
  });
});

// ── bundleLoader ──

describe("bundleLoader", () => {
  let tmpDir: string;
  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no current bundle", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bload-"));
    const result = await loadExistingBundle(tmpDir);
    expect(result).toBeNull();
  });

  it("loads graph.json from current bundle", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-bload-"));

    const graph: ResolvedGraph = {
      entities: [ent("ent_abc", "React")],
      relations: [edge("ent_xxx", "uses", "ent_abc")],
    };
    const events: ExtractedEvent[] = [ev("deployed")];

    const br = await buildBundle({ graph, events }, { outputDir: tmpDir });

    const currentDir = path.join(tmpDir, "current");
    try { await fs.unlink(currentDir); } catch { /* absent */ }
    await fs.symlink(br.bundleDir, currentDir);

    const loaded = await loadExistingBundle(tmpDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.graph.entities).toHaveLength(1);
    expect(loaded!.graph.entities[0]!.id).toBe("ent_abc");
    expect(loaded!.graph.entities[0]!.canonicalName).toBe("React");
    expect(loaded!.graph.relations).toHaveLength(1);
    expect(loaded!.graph.relations[0]!.relation).toBe("uses");
    expect(loaded!.events).toHaveLength(1);
  });
});

// ── extractFacts negation patterns ──

describe("extractFacts negation", () => {
  function fakeSession(content: string): LoadedSession {
    return {
      id: "neg-session", title: "Neg", createdAt: "2026-06-01T00:00:00Z",
      filePath: "/tmp/neg.json", modifiedAt: new Date(),
      turns: [{ role: "user", content, turnIndex: 0 }],
    };
  }

  it("detects 'no longer uses X'", async () => {
    const result = await extractFacts(fakeSession("We no longer use Redis for caching"));
    const negated = result.relations.filter((r) => r.negated);
    expect(negated.length).toBeGreaterThanOrEqual(1);
    expect(negated[0]!.relation).toBe("uses");
    expect(negated[0]!.tailName.toLowerCase()).toContain("redis");
  });

  it("detects 'stopped using X'", async () => {
    const result = await extractFacts(fakeSession("We stopped using MongoDB last month"));
    const negated = result.relations.filter((r) => r.negated);
    expect(negated.length).toBeGreaterThanOrEqual(1);
    expect(negated[0]!.relation).toBe("uses");
  });

  it("detects '不再用 X'", async () => {
    const result = await extractFacts(fakeSession("我们不再用Redis了"));
    const negated = result.relations.filter((r) => r.negated);
    expect(negated.length).toBeGreaterThanOrEqual(1);
    expect(negated[0]!.relation).toBe("uses");
  });

  it("detects 'switched from X to Y'", async () => {
    const result = await extractFacts(fakeSession("We switched from MySQL to PostgreSQL"));
    const negated = result.relations.filter((r) => r.negated);
    expect(negated.length).toBeGreaterThanOrEqual(1);
    expect(negated[0]!.tailName.toLowerCase()).toContain("mysql");
  });
});

// ── trainBundle e2e with delta merge ──

describe("trainBundle delta merge", () => {
  let tmpDir: string;
  afterEach(async () => {
    if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writeSession(
    dir: string, id: string,
    messages: Array<{ role: string; content: string }>,
  ): Promise<void> {
    await fs.writeFile(
      path.join(dir, `${id}.json`),
      JSON.stringify({
        id, title: `Session ${id}`, created_at: "2026-06-01T00:00:00Z", messages,
      }),
      "utf8",
    );
  }

  it("merges new facts into existing bundle", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-delta-e2e-"));
    const sessionsDir = path.join(tmpDir, "sessions");
    const bundleRoot = path.join(tmpDir, "memory");
    await fs.mkdir(sessionsDir, { recursive: true });

    await writeSession(sessionsDir, "s1", [
      { role: "user", content: "Acme uses React for their frontend" },
    ]);

    const r1 = await trainBundle({ sessionsDir, bundleRoot, full: true });
    expect(r1.sessionsProcessed).toBe(1);
    expect(r1.delta).toBeUndefined();

    await new Promise((r) => setTimeout(r, 50));
    await writeSession(sessionsDir, "s2", [
      { role: "user", content: "Acme uses TypeScript for the backend" },
    ]);

    const r2 = await trainBundle({ sessionsDir, bundleRoot });
    expect(r2.sessionsProcessed).toBe(1);
    expect(r2.delta).toBeDefined();
    expect(r2.delta!.added).toBeGreaterThan(0);
    expect(r2.entityCount).toBeGreaterThan(r1.entityCount);
  });

  it("--no-merge produces full rebuild without delta", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nomerge-"));
    const sessionsDir = path.join(tmpDir, "sessions");
    const bundleRoot = path.join(tmpDir, "memory");
    await fs.mkdir(sessionsDir, { recursive: true });

    await writeSession(sessionsDir, "s1", [
      { role: "user", content: "Acme uses React for their frontend" },
    ]);
    await trainBundle({ sessionsDir, bundleRoot, full: true });

    await new Promise((r) => setTimeout(r, 50));
    await writeSession(sessionsDir, "s2", [
      { role: "user", content: "Acme uses TypeScript too" },
    ]);

    const r2 = await trainBundle({ sessionsDir, bundleRoot, noMerge: true });
    expect(r2.sessionsProcessed).toBe(1);
    expect(r2.delta).toBeUndefined();
  });

  it("negation in new session removes existing edge after merge", async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pi-delta-neg-"));
    const sessionsDir = path.join(tmpDir, "sessions");
    const bundleRoot = path.join(tmpDir, "memory");
    await fs.mkdir(sessionsDir, { recursive: true });

    await writeSession(sessionsDir, "s1", [
      { role: "user", content: "Acme uses Redis for caching" },
    ]);
    const r1 = await trainBundle({ sessionsDir, bundleRoot, full: true });
    expect(r1.relationCount).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 50));
    await writeSession(sessionsDir, "s2", [
      { role: "user", content: "We stopped using Redis" },
    ]);

    const r2 = await trainBundle({ sessionsDir, bundleRoot });
    expect(r2.delta).toBeDefined();
    expect(r2.delta!.deleted).toBeGreaterThanOrEqual(1);
    expect(r2.relationCount).toBeLessThan(r1.relationCount);
  });
});
