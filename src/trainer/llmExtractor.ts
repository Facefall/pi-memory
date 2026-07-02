import type { SessionTurn } from "./sessionLoader.js";
import type {
  ExtractedEntity,
  ExtractedRelation,
  ExtractedEvent,
  LLMFactExtractor,
  EntityType,
} from "./extractFacts.js";
import { extractFacts } from "./extractFacts.js";
import type { LoadedSession } from "./sessionLoader.js";
import { ALL_RELATIONS } from "./extractFacts.js";

/** Provider-agnostic LLM client — any backend that can complete a prompt. */
export interface LLMClient {
  complete(prompt: string): Promise<string>;
}

export interface LLMExtractorOptions {
  client: LLMClient;
  /** How many turns to send per LLM call (default 10). */
  batchSize?: number;
}

const VALID_ENTITY_TYPES = new Set<string>([
  "Person", "Project", "Tool", "Company", "Organization",
  "Location", "Document",
]);

const VALID_ENTITY_TYPES_FULL = new Set<string>([
  ...VALID_ENTITY_TYPES,
  "Language", "Concept", "File", "Product", "Website", "Platform", "Unknown",
]);

const RELATION_SET: Set<string> = new Set(ALL_RELATIONS);

function buildPrompt(turns: SessionTurn[], sessionId: string): string {
  const turnsText = turns
    .map((t) => `[${t.role} #${t.turnIndex}]: ${t.content}`)
    .join("\n\n");

  return `You are a structured fact extractor. Analyze the following conversation turns and extract:

1. **Entities** — people, projects, tools, companies, organizations, locations, documents mentioned.
   Each entity: { "name": string, "type": one of "Person"|"Project"|"Tool"|"Company"|"Organization"|"Location"|"Document" }

2. **Relations** — connections between entities. Use ONLY these relation types:
   ${ALL_RELATIONS.join(", ")}
   Each relation: { "head": string, "relation": string, "tail": string, "turn_index": number, "evidence": string, "negated": boolean }
   Set negated=true only when the text explicitly says something is no longer true (e.g. "no longer uses X").

3. **Events** — decisions, milestones, deadlines, deployments.
   Each event: { "description": string, "turn_index": number }

Session ID: ${sessionId}

Conversation:
${turnsText}

Respond with ONLY a JSON object (no markdown fences, no explanation):
{
  "entities": [...],
  "relations": [...],
  "events": [...]
}`;
}

function parseEntityType(raw: string): EntityType {
  if (VALID_ENTITY_TYPES_FULL.has(raw)) return raw as EntityType;
  return "Unknown";
}

interface RawLLMEntity {
  name?: string;
  type?: string;
}

interface RawLLMRelation {
  head?: string;
  relation?: string;
  tail?: string;
  turn_index?: number;
  evidence?: string;
  negated?: boolean;
}

interface RawLLMEvent {
  description?: string;
  turn_index?: number;
}

interface RawLLMResponse {
  entities?: RawLLMEntity[];
  relations?: RawLLMRelation[];
  events?: RawLLMEvent[];
}

function parseLLMResponse(
  raw: string,
  sessionId: string,
  turns: SessionTurn[],
): { entities: ExtractedEntity[]; relations: ExtractedRelation[]; events: ExtractedEvent[] } {
  const cleaned = raw.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
  const parsed: RawLLMResponse = JSON.parse(cleaned);

  const entities: ExtractedEntity[] = [];
  if (Array.isArray(parsed.entities)) {
    for (const e of parsed.entities) {
      const name = typeof e.name === "string" ? e.name.trim() : "";
      if (!name || name.length > 100) continue;
      entities.push({
        name,
        type: parseEntityType(typeof e.type === "string" ? e.type : "Unknown"),
        mentions: [{
          sessionId,
          turnIndex: 0,
          snippet: name,
        }],
      });
    }
  }

  const relations: ExtractedRelation[] = [];
  if (Array.isArray(parsed.relations)) {
    for (const r of parsed.relations) {
      const head = typeof r.head === "string" ? r.head.trim() : "";
      const tail = typeof r.tail === "string" ? r.tail.trim() : "";
      const relation = typeof r.relation === "string" ? r.relation.trim() : "";
      if (!head || !tail || !relation) continue;
      if (!RELATION_SET.has(relation)) continue;
      const turnIdx = typeof r.turn_index === "number" ? r.turn_index : 0;
      relations.push({
        headName: head,
        relation,
        tailName: tail,
        sessionId,
        turnIndex: turnIdx,
        evidence: typeof r.evidence === "string" ? r.evidence.slice(0, 200) : "",
        negated: r.negated === true ? true : undefined,
      });
    }
  }

  const events: ExtractedEvent[] = [];
  if (Array.isArray(parsed.events)) {
    for (const ev of parsed.events) {
      const desc = typeof ev.description === "string" ? ev.description.trim() : "";
      if (!desc) continue;
      const turnIdx = typeof ev.turn_index === "number" ? ev.turn_index : 0;
      const matchingTurn = turns.find((t) => t.turnIndex === turnIdx);
      events.push({
        description: desc.slice(0, 300),
        sessionId,
        timestamp: new Date().toISOString(),
        turnIndex: matchingTurn?.turnIndex ?? turnIdx,
      });
    }
  }

  return { entities, relations, events };
}

/**
 * LLM-backed fact extractor. Sends turn batches to the LLM, parses
 * structured JSON. Falls back to regex extraction on any LLM failure.
 */
export function createLLMFactExtractor(opts: LLMExtractorOptions): LLMFactExtractor {
  const batchSize = opts.batchSize ?? 10;

  return {
    async extractFacts(
      turns: SessionTurn[],
      sessionId: string,
    ): Promise<{ entities: ExtractedEntity[]; relations: ExtractedRelation[]; events: ExtractedEvent[] }> {
      const allEntities: ExtractedEntity[] = [];
      const allRelations: ExtractedRelation[] = [];
      const allEvents: ExtractedEvent[] = [];

      for (let i = 0; i < turns.length; i += batchSize) {
        const batch = turns.slice(i, i + batchSize);
        try {
          const prompt = buildPrompt(batch, sessionId);
          const response = await opts.client.complete(prompt);
          const parsed = parseLLMResponse(response, sessionId, batch);
          allEntities.push(...parsed.entities);
          allRelations.push(...parsed.relations);
          allEvents.push(...parsed.events);
        } catch {
          const fallbackSession: LoadedSession = {
            id: sessionId,
            title: "",
            createdAt: new Date().toISOString(),
            filePath: "",
            modifiedAt: new Date(),
            turns: batch,
          };
          const fallback = await extractFacts(fallbackSession);
          allEntities.push(...fallback.entities);
          allRelations.push(...fallback.relations);
          allEvents.push(...fallback.events);
        }
      }

      return { entities: allEntities, relations: allRelations, events: allEvents };
    },
  };
}
