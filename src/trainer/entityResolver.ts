import { createHash } from "node:crypto";

import type {
  ExtractedEntity,
  ExtractedRelation,
  EntityMention,
  EntityType,
} from "./extractFacts.js";

export interface ResolvedEntity {
  id: string;
  canonicalName: string;
  type: EntityType;
  aliases: string[];
  mentions: EntityMention[];
}

export interface ResolvedRelation {
  headEntityId: string;
  relation: string;
  tailEntityId: string;
  sessionId: string;
  turnIndex: number;
  evidence: string;
  /** True when the session explicitly negates this relation. */
  negated?: boolean;
}

export interface ResolvedGraph {
  entities: ResolvedEntity[];
  relations: ResolvedRelation[];
}

function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`]/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\s+/g, " ")
    .replace(/[.\-_]/g, "")
    .trim();
}

function entityHash(normalizedKey: string): string {
  return "ent_" + createHash("sha256").update(normalizedKey).digest("hex").slice(0, 12);
}

function pickBestType(types: EntityType[]): EntityType {
  const priority: EntityType[] = [
    "Person", "Company", "Organization", "Project", "Tool",
    "Language", "Product", "Platform", "Website", "Location",
    "Document", "File", "Concept", "Unknown",
  ];
  for (const t of priority) {
    if (types.includes(t)) return t;
  }
  return "Unknown";
}

/**
 * Cross-session entity dedup: normalize names, merge by key, assign stable IDs.
 */
export function resolveEntities(
  entities: ExtractedEntity[],
  relations: ExtractedRelation[],
): ResolvedGraph {
  const keyMap = new Map<string, {
    names: Set<string>;
    types: EntityType[];
    mentions: EntityMention[];
  }>();

  for (const ent of entities) {
    const key = normalizeKey(ent.name);
    if (!key) continue;

    let bucket = keyMap.get(key);
    if (!bucket) {
      bucket = { names: new Set(), types: [], mentions: [] };
      keyMap.set(key, bucket);
    }
    bucket.names.add(ent.name);
    bucket.types.push(ent.type);
    bucket.mentions.push(...ent.mentions);
  }

  const nameToId = new Map<string, string>();
  const resolved: ResolvedEntity[] = [];

  for (const [key, bucket] of keyMap) {
    const id = entityHash(key);
    const namesArr = [...bucket.names];
    const canonical = namesArr.sort((a, b) => b.length - a.length)[0] ?? key;

    for (const name of namesArr) {
      nameToId.set(normalizeKey(name), id);
    }

    resolved.push({
      id,
      canonicalName: canonical,
      type: pickBestType(bucket.types),
      aliases: namesArr.filter((n) => n !== canonical),
      mentions: bucket.mentions,
    });
  }

  const resolvedRelations: ResolvedRelation[] = [];
  for (const rel of relations) {
    const tailId = nameToId.get(normalizeKey(rel.tailName));
    if (!tailId) continue;

    if (rel.negated) {
      resolvedRelations.push({
        headEntityId: rel.headName ? (nameToId.get(normalizeKey(rel.headName)) ?? "") : "",
        relation: rel.relation,
        tailEntityId: tailId,
        sessionId: rel.sessionId,
        turnIndex: rel.turnIndex,
        evidence: rel.evidence,
        negated: true,
      });
      continue;
    }

    const headId = nameToId.get(normalizeKey(rel.headName));
    if (!headId) continue;

    resolvedRelations.push({
      headEntityId: headId,
      relation: rel.relation,
      tailEntityId: tailId,
      sessionId: rel.sessionId,
      turnIndex: rel.turnIndex,
      evidence: rel.evidence,
    });
  }

  return { entities: resolved, relations: resolvedRelations };
}
