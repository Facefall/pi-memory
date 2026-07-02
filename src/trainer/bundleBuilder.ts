import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ResolvedGraph, ResolvedEntity, ResolvedRelation } from "./entityResolver.js";
import type { ExtractedEvent } from "./extractFacts.js";
import type { BundleManifest, BundleManifestFile } from "../sidecar/bundle.js";

export interface BundleData {
  graph: ResolvedGraph;
  events: ExtractedEvent[];
}

/** TLM-compatible entity record for the graph data file. */
interface BundleEntity {
  entity_id: string;
  label: string;
  type: string;
  aliases: string[];
  mention_count: number;
  distinct_session_count: number;
}

/** TLM-compatible relation edge for the graph data file. */
interface BundleEdge {
  head_entity_id: string;
  relation: string;
  tail_entity_id: string;
  supporting_event_ids: string[];
  evidence: string;
}

/** TLM-compatible event record. */
interface BundleEvent {
  event_id: string;
  description: string;
  session_id: string;
  timestamp: string;
}

interface GraphDataFile {
  entities: BundleEntity[];
  edges: BundleEdge[];
  events: BundleEvent[];
}

function eventId(ev: ExtractedEvent, idx: number): string {
  const hash = createHash("sha256")
    .update(`${ev.sessionId}:${ev.turnIndex}:${idx}`)
    .digest("hex")
    .slice(0, 12);
  return `ev_${hash}`;
}

function distinctSessions(ent: ResolvedEntity): number {
  const s = new Set(ent.mentions.map((m) => m.sessionId));
  return s.size;
}

function buildGraphData(
  graph: ResolvedGraph,
  events: ExtractedEvent[],
): GraphDataFile {
  const eventRecords: BundleEvent[] = events.map((ev, i) => ({
    event_id: eventId(ev, i),
    description: ev.description,
    session_id: ev.sessionId,
    timestamp: ev.timestamp,
  }));

  const eventsBySession = new Map<string, string[]>();
  for (const ev of eventRecords) {
    let arr = eventsBySession.get(ev.session_id);
    if (!arr) {
      arr = [];
      eventsBySession.set(ev.session_id, arr);
    }
    arr.push(ev.event_id);
  }

  const entities: BundleEntity[] = graph.entities.map((ent) => ({
    entity_id: ent.id,
    label: ent.canonicalName,
    type: ent.type,
    aliases: ent.aliases,
    mention_count: ent.mentions.length,
    distinct_session_count: distinctSessions(ent),
  }));

  const edges: BundleEdge[] = graph.relations.map((rel) => {
    const evIds = eventsBySession.get(rel.sessionId) ?? [];
    return {
      head_entity_id: rel.headEntityId,
      relation: rel.relation,
      tail_entity_id: rel.tailEntityId,
      supporting_event_ids: evIds.slice(0, 5),
      evidence: rel.evidence,
    };
  });

  return { entities, edges, events: eventRecords };
}

async function writeJsonFile(
  dir: string,
  filename: string,
  data: unknown,
): Promise<BundleManifestFile> {
  const content = JSON.stringify(data, null, 2) + "\n";
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, content, "utf8");
  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    path: filename,
    size: Buffer.byteLength(content, "utf8"),
    sha256,
  };
}

export interface BuildBundleOptions {
  outputDir: string;
  bundleVersion?: string;
}

export interface BuildBundleResult {
  bundleDir: string;
  manifest: BundleManifest;
  stats: {
    entityCount: number;
    edgeCount: number;
    eventCount: number;
  };
}

/**
 * Build a TLM-compatible bundle directory from resolved graph + events.
 *
 * Produces:
 *   <outputDir>/bundles/<iso-ts>/
 *     manifest.json
 *     graph.json      — entities, edges, events
 */
export async function buildBundle(
  data: BundleData,
  opts: BuildBundleOptions,
): Promise<BuildBundleResult> {
  const bundleTs = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const bundleVersion = opts.bundleVersion ?? "0.6.0";

  const bundlesDir = path.join(opts.outputDir, "bundles");
  const bundleDir = path.join(bundlesDir, bundleTs);
  await fs.mkdir(bundleDir, { recursive: true, mode: 0o700 });

  const graphData = buildGraphData(data.graph, data.events);
  const files: BundleManifestFile[] = [];

  const graphFile = await writeJsonFile(bundleDir, "graph.json", graphData);
  files.push(graphFile);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  const integrityInput = files.map((f) => f.sha256).join(":");
  const integritySha256 = createHash("sha256")
    .update(integrityInput)
    .digest("hex");

  const manifest: BundleManifest = {
    bundle_ts: bundleTs,
    bundle_version: bundleVersion,
    size_bytes: totalSize,
    integrity_sha256: integritySha256,
    files,
  };

  const manifestContent = JSON.stringify(manifest, null, 2) + "\n";
  await fs.writeFile(
    path.join(bundleDir, "manifest.json"),
    manifestContent,
    "utf8",
  );

  return {
    bundleDir,
    manifest,
    stats: {
      entityCount: graphData.entities.length,
      edgeCount: graphData.edges.length,
      eventCount: graphData.events.length,
    },
  };
}
