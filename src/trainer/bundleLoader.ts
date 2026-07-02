import fs from "node:fs/promises";
import path from "node:path";

import type { ResolvedEntity, ResolvedRelation, ResolvedGraph } from "./entityResolver.js";
import type { ExtractedEvent, EntityType } from "./extractFacts.js";

interface BundleEntityRecord {
  entity_id: string;
  label: string;
  type: string;
  aliases: string[];
  mention_count: number;
  distinct_session_count: number;
}

interface BundleEdgeRecord {
  head_entity_id: string;
  relation: string;
  tail_entity_id: string;
  supporting_event_ids: string[];
  evidence: string;
}

interface BundleEventRecord {
  event_id: string;
  description: string;
  session_id: string;
  timestamp: string;
}

interface GraphDataFile {
  entities: BundleEntityRecord[];
  edges: BundleEdgeRecord[];
  events: BundleEventRecord[];
}

const VALID_ENTITY_TYPES = new Set<string>([
  "Person", "Company", "Organization", "Project", "Tool",
  "Language", "Concept", "Document", "File", "Location",
  "Product", "Website", "Platform", "Unknown",
]);

function toEntityType(t: string): EntityType {
  return VALID_ENTITY_TYPES.has(t) ? (t as EntityType) : "Unknown";
}

export interface ExistingBundle {
  graph: ResolvedGraph;
  events: ExtractedEvent[];
}

/**
 * Load the existing bundle's graph.json from `<bundleRoot>/current/graph.json`.
 * Returns null when no current bundle exists or graph.json is missing/unparseable.
 */
export async function loadExistingBundle(
  bundleRoot: string,
): Promise<ExistingBundle | null> {
  const graphPath = path.join(bundleRoot, "current", "graph.json");

  let raw: string;
  try {
    raw = await fs.readFile(graphPath, "utf8");
  } catch {
    return null;
  }

  let data: GraphDataFile;
  try {
    data = JSON.parse(raw) as GraphDataFile;
  } catch {
    return null;
  }

  if (!data.entities || !data.edges) return null;

  const entities: ResolvedEntity[] = (data.entities ?? []).map((e) => ({
    id: e.entity_id,
    canonicalName: e.label,
    type: toEntityType(e.type),
    aliases: e.aliases ?? [],
    mentions: [],
  }));

  const relations: ResolvedRelation[] = (data.edges ?? []).map((e) => ({
    headEntityId: e.head_entity_id,
    relation: e.relation,
    tailEntityId: e.tail_entity_id,
    sessionId: "",
    turnIndex: 0,
    evidence: e.evidence ?? "",
  }));

  const events: ExtractedEvent[] = (data.events ?? []).map((e) => ({
    description: e.description,
    sessionId: e.session_id,
    timestamp: e.timestamp,
    turnIndex: 0,
  }));

  return {
    graph: { entities, relations },
    events,
  };
}
