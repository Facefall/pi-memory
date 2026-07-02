import type { ResolvedGraph, ResolvedEntity, ResolvedRelation } from "./entityResolver.js";
import type { ExtractedEvent } from "./extractFacts.js";
import { UPDATE_SIGNAL_RE } from "./extractFacts.js";

export type DeltaOp = "add" | "update" | "delete" | "skip";

export interface DeltaLogEntry {
  op: DeltaOp;
  kind: "entity" | "edge" | "event";
  detail: string;
}

export interface DeltaLog {
  entries: DeltaLogEntry[];
  added: number;
  updated: number;
  deleted: number;
  skipped: number;
}

export interface MergeResult {
  graph: ResolvedGraph;
  events: ExtractedEvent[];
  delta: DeltaLog;
}

function edgeKey(headId: string, relation: string, tailId: string): string {
  return `${headId}\0${relation}\0${tailId}`;
}

function headRelKey(headId: string, relation: string): string {
  return `${headId}\0${relation}`;
}

/**
 * Merge new extracted graph + events into an existing bundle graph,
 * producing a combined result with delta operation log.
 *
 * Operations:
 * - SKIP: entity+relation+tail already present with same value
 * - ADD: genuinely new entity/edge/event
 * - UPDATE: same head+relation but different tail, with update signal in evidence
 * - DELETE: negated relation matches existing edge
 */
export function deltaMerge(
  existing: { graph: ResolvedGraph; events: ExtractedEvent[] },
  incoming: { graph: ResolvedGraph; events: ExtractedEvent[] },
): MergeResult {
  const delta: DeltaLog = { entries: [], added: 0, updated: 0, deleted: 0, skipped: 0 };

  function log(op: DeltaOp, kind: DeltaLogEntry["kind"], detail: string): void {
    delta.entries.push({ op, kind, detail });
    switch (op) {
      case "add": delta.added++; break;
      case "update": delta.updated++; break;
      case "delete": delta.deleted++; break;
      case "skip": delta.skipped++; break;
    }
  }

  // ── Entities ──
  const entityMap = new Map<string, ResolvedEntity>();
  for (const ent of existing.graph.entities) {
    entityMap.set(ent.id, { ...ent, mentions: [...ent.mentions] });
  }

  for (const ent of incoming.graph.entities) {
    const prev = entityMap.get(ent.id);
    if (prev) {
      const newMentions = ent.mentions.filter(
        (m) => !prev.mentions.some(
          (pm) => pm.sessionId === m.sessionId && pm.turnIndex === m.turnIndex,
        ),
      );
      if (newMentions.length > 0) {
        prev.mentions.push(...newMentions);
        log("update", "entity", `${ent.canonicalName}: +${newMentions.length} mentions`);
      } else {
        log("skip", "entity", ent.canonicalName);
      }
    } else {
      entityMap.set(ent.id, { ...ent, mentions: [...ent.mentions] });
      log("add", "entity", ent.canonicalName);
    }
  }

  // ── Edges: collect negations and normal edges ──
  const existingEdgeMap = new Map<string, ResolvedRelation>();
  const existingByHeadRel = new Map<string, ResolvedRelation[]>();
  for (const edge of existing.graph.relations) {
    const key = edgeKey(edge.headEntityId, edge.relation, edge.tailEntityId);
    existingEdgeMap.set(key, edge);
    const hrKey = headRelKey(edge.headEntityId, edge.relation);
    let arr = existingByHeadRel.get(hrKey);
    if (!arr) { arr = []; existingByHeadRel.set(hrKey, arr); }
    arr.push(edge);
  }

  const negatedRelations: ResolvedRelation[] = [];
  const normalRelations: ResolvedRelation[] = [];
  for (const rel of incoming.graph.relations) {
    if (rel.negated) {
      negatedRelations.push(rel);
    } else {
      normalRelations.push(rel);
    }
  }

  // Process negations → DELETE from existing
  const deletedKeys = new Set<string>();
  for (const neg of negatedRelations) {
    if (neg.headEntityId) {
      const key = edgeKey(neg.headEntityId, neg.relation, neg.tailEntityId);
      if (existingEdgeMap.has(key)) {
        deletedKeys.add(key);
        const ent = entityMap.get(neg.tailEntityId);
        log("delete", "edge", `${neg.headEntityId}:${neg.relation}:${ent?.canonicalName ?? neg.tailEntityId}`);
      }
    } else {
      for (const [key, edge] of existingEdgeMap) {
        if (edge.relation === neg.relation && edge.tailEntityId === neg.tailEntityId) {
          deletedKeys.add(key);
          const headEnt = entityMap.get(edge.headEntityId);
          const tailEnt = entityMap.get(edge.tailEntityId);
          log("delete", "edge", `${headEnt?.canonicalName ?? edge.headEntityId}:${neg.relation}:${tailEnt?.canonicalName ?? edge.tailEntityId}`);
        }
      }
    }
  }

  // Process normal edges → ADD / SKIP / UPDATE
  const mergedEdges: ResolvedRelation[] = [];

  for (const [key, edge] of existingEdgeMap) {
    if (!deletedKeys.has(key)) {
      mergedEdges.push(edge);
    }
  }

  for (const rel of normalRelations) {
    const key = edgeKey(rel.headEntityId, rel.relation, rel.tailEntityId);

    if (existingEdgeMap.has(key) && !deletedKeys.has(key)) {
      const tailEnt = entityMap.get(rel.tailEntityId);
      log("skip", "edge", `${rel.headEntityId}:${rel.relation}:${tailEnt?.canonicalName ?? rel.tailEntityId}`);
      continue;
    }

    if (deletedKeys.has(key)) {
      // Re-adding a previously-deleted edge is still an add
    }

    const hasUpdateSignal = UPDATE_SIGNAL_RE.test(rel.evidence);
    if (hasUpdateSignal) {
      const hrKey = headRelKey(rel.headEntityId, rel.relation);
      const existingForHR = existingByHeadRel.get(hrKey);
      if (existingForHR) {
        for (const oldEdge of existingForHR) {
          if (oldEdge.tailEntityId !== rel.tailEntityId) {
            const oldKey = edgeKey(oldEdge.headEntityId, oldEdge.relation, oldEdge.tailEntityId);
            if (!deletedKeys.has(oldKey)) {
              deletedKeys.add(oldKey);
              const idx = mergedEdges.findIndex(
                (e) => e.headEntityId === oldEdge.headEntityId &&
                       e.relation === oldEdge.relation &&
                       e.tailEntityId === oldEdge.tailEntityId,
              );
              if (idx !== -1) mergedEdges.splice(idx, 1);
              const oldTailEnt = entityMap.get(oldEdge.tailEntityId);
              const newTailEnt = entityMap.get(rel.tailEntityId);
              log("update", "edge",
                `${rel.relation}: ${oldTailEnt?.canonicalName ?? oldEdge.tailEntityId} → ${newTailEnt?.canonicalName ?? rel.tailEntityId}`);
            }
          }
        }
      }
    }

    if (!mergedEdges.some(
      (e) => e.headEntityId === rel.headEntityId &&
             e.relation === rel.relation &&
             e.tailEntityId === rel.tailEntityId,
    )) {
      mergedEdges.push(rel);
      if (!hasUpdateSignal || !existingByHeadRel.has(headRelKey(rel.headEntityId, rel.relation))) {
        const tailEnt = entityMap.get(rel.tailEntityId);
        log("add", "edge", `${rel.headEntityId}:${rel.relation}:${tailEnt?.canonicalName ?? rel.tailEntityId}`);
      }
    }
  }

  // ── Events ──
  const eventSigSet = new Set<string>();
  const mergedEvents: ExtractedEvent[] = [];

  for (const ev of existing.events) {
    const sig = `${ev.sessionId}\0${ev.turnIndex}\0${ev.description.slice(0, 80)}`;
    eventSigSet.add(sig);
    mergedEvents.push(ev);
  }

  for (const ev of incoming.events) {
    const sig = `${ev.sessionId}\0${ev.turnIndex}\0${ev.description.slice(0, 80)}`;
    if (eventSigSet.has(sig)) {
      log("skip", "event", ev.description.slice(0, 60));
    } else {
      eventSigSet.add(sig);
      mergedEvents.push(ev);
      log("add", "event", ev.description.slice(0, 60));
    }
  }

  return {
    graph: {
      entities: [...entityMap.values()],
      relations: mergedEdges,
    },
    events: mergedEvents,
    delta,
  };
}
