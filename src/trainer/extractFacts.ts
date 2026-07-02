import type { SessionTurn, LoadedSession } from "./sessionLoader.js";

/** Relation catalog mirroring Kocoro compactMemoryRelationCatalog. */
export const RELATION_CATALOG = {
  people_and_social: [
    "employed_at", "previously_employed_at", "works_on", "affiliated_with",
    "studied_under", "studied_at", "collaborates_with", "follows_person",
    "followed_by_person", "commented_on", "knows_about", "has_handle_on",
    "has_email",
  ],
  ownership_and_company: [
    "created", "created_by", "maintained_by", "develops",
    "developed_by_org", "owns", "owned_by", "acquired", "acquired_by",
    "subsidiary_of", "parent_of", "founded", "founded_by", "invested_in",
    "received_investment_from", "customer_of", "has_customer",
    "competes_with", "banking_relationship",
  ],
  technical_and_project: [
    "uses", "used_by", "depends_on", "implemented_in", "runs_on",
    "integrates_with", "supports", "powered_by", "loaded_via",
    "has_component", "part_of", "has_property", "has_path", "stored_at",
    "monitors", "targets", "enables", "enabled_by", "generates",
    "generated_from", "implements", "implemented_by", "excludes",
    "deleted_from",
  ],
  content_and_metadata: [
    "published_on", "released", "latest_release_tag", "forked_from",
    "inspired_by", "succeeds", "preceded_by", "describes", "described_in",
    "category", "has_alias", "has_url", "located_in", "scheduled_for",
    "ranked_on", "listed_on", "features_project",
  ],
  generic_fallback: ["related_to", "other"],
} as const;

export const ALL_RELATIONS = Object.values(RELATION_CATALOG).flat();

export type EntityType =
  | "Person" | "Company" | "Organization" | "Project" | "Tool"
  | "Language" | "Concept" | "Document" | "File" | "Location"
  | "Product" | "Website" | "Platform" | "Unknown";

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  mentions: EntityMention[];
}

export interface EntityMention {
  sessionId: string;
  turnIndex: number;
  snippet: string;
}

export interface ExtractedRelation {
  headName: string;
  relation: string;
  tailName: string;
  sessionId: string;
  turnIndex: number;
  evidence: string;
  /** True when the session explicitly negates this relation ("no longer uses X"). */
  negated?: boolean;
}

export interface ExtractedEvent {
  description: string;
  sessionId: string;
  timestamp: string;
  turnIndex: number;
}

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
  events: ExtractedEvent[];
}

/**
 * Optional LLM-backed extractor interface. The default implementation
 * uses regex/heuristic patterns only and does not require an LLM.
 */
export interface LLMFactExtractor {
  extractFacts(
    turns: SessionTurn[],
    sessionId: string,
  ): Promise<{
    entities: ExtractedEntity[];
    relations: ExtractedRelation[];
    events: ExtractedEvent[];
  }>;
}

export interface ExtractFactsOptions {
  llmExtractor?: LLMFactExtractor | null;
}

// ── Heuristic patterns ──

const CAPITALIZED_NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b/g;

const TOOL_PROJECT_RE =
  /\b(React|Vue|Angular|Svelte|Next\.js|Nuxt|Django|Flask|Rails|Spring|Express|FastAPI|Rust|Go|Python|TypeScript|JavaScript|Node\.js|Docker|Kubernetes|Redis|PostgreSQL|MySQL|MongoDB|SQLite|Terraform|AWS|GCP|Azure|GitHub|GitLab|Slack|Figma|Notion|Linear|Jira|Vercel|Netlify|Supabase|Firebase|Anthropic|OpenAI|Claude|GPT|Gemini|Ollama|Tailwind|GSAP|Prisma|Drizzle|Vite|Webpack|ESLint|Prettier|Vitest|Jest|Playwright|Cypress)\b/gi;

const RELATION_PATTERNS: Array<{
  re: RegExp;
  relation: string;
  headGroup: number;
  tailGroup: number;
}> = [
  { re: /\b(\w[\w\s]*?)\s+(?:uses?|is using|使用)\s+(\w[\w\s.]*?\b)/gi, relation: "uses", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:created|built|made|开发了|创建了)\s+(\w[\w\s.]*?\b)/gi, relation: "created", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:works?\s+(?:at|for)|在.+工作)\s+(\w[\w\s.]*?\b)/gi, relation: "employed_at", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:works?\s+on|负责)\s+(\w[\w\s.]*?\b)/gi, relation: "works_on", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:collaborates?\s+with|合作)\s+(\w[\w\s.]*?\b)/gi, relation: "collaborates_with", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:depends?\s+on|依赖)\s+(\w[\w\s.]*?\b)/gi, relation: "depends_on", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:runs?\s+on|运行在)\s+(\w[\w\s.]*?\b)/gi, relation: "runs_on", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:integrates?\s+with|集成)\s+(\w[\w\s.]*?\b)/gi, relation: "integrates_with", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:founded|创立了)\s+(\w[\w\s.]*?\b)/gi, relation: "founded", headGroup: 1, tailGroup: 2 },
  { re: /\b(\w[\w\s]*?)\s+(?:implements?|实现了)\s+(\w[\w\s.]*?\b)/gi, relation: "implements", headGroup: 1, tailGroup: 2 },
];

const NEGATION_PATTERNS: Array<{
  re: RegExp;
  relation: string;
  entityGroup: number;
}> = [
  { re: /\b(?:no longer|stopped|quit|dropped|gave up|abandoned)\s+(?:using|uses?)\s+(\w[\w\s.]*?\b)/gi, relation: "uses", entityGroup: 1 },
  { re: /(?:不再|停止|放弃)(?:使用|用)\s*([A-Za-z][\w\s.]*\w)/gi, relation: "uses", entityGroup: 1 },
  { re: /\b(?:left|quit|resigned from|no longer (?:works?|employed) (?:at|for))\s+(\w[\w\s.]*?\b)/gi, relation: "employed_at", entityGroup: 1 },
  { re: /(?:不再|离开了|辞去了?)(?:在)?\s*([A-Za-z][\w\s.]*\w)/gi, relation: "employed_at", entityGroup: 1 },
  { re: /\b(?:stopped|quit|no longer)\s+(?:working on|developing|maintaining)\s+(\w[\w\s.]*?\b)/gi, relation: "works_on", entityGroup: 1 },
  { re: /(?:不再|停止)\s*(?:负责|开发|维护)\s*([A-Za-z][\w\s.]*\w)/gi, relation: "works_on", entityGroup: 1 },
  { re: /\b(?:removed|dropped|deleted|uninstalled)\s+(\w[\w\s.]*?\b)/gi, relation: "uses", entityGroup: 1 },
  { re: /\b(?:switched|migrated|moved)\s+(?:from)\s+(\w[\w\s.]*?)\s+(?:to)\s+\w/gi, relation: "uses", entityGroup: 1 },
  { re: /(?:从)\s*([A-Za-z][\w\s.]*\w)\s*(?:迁移|切换|换)(?:到|成)/gi, relation: "uses", entityGroup: 1 },
];

export const UPDATE_SIGNAL_RE = /\b(?:now|switched to|migrated to|moved to|changed to|upgraded to|replaced with|改用|换成|切换到|迁移到|升级到)\b/i;

const EVENT_PATTERNS: RegExp[] = [
  /\b(?:decided|agreed|shipped|released|launched|deployed|migrated|completed|finished|merged|approved|resolved)\b/i,
  /\b(?:决定|完成|上线|发布|部署|迁移|合并|通过)\b/,
];

const NOISE_WORDS = new Set([
  "the", "a", "an", "this", "that", "it", "i", "we", "they", "he", "she",
  "my", "our", "their", "you", "your", "its",
  "is", "are", "was", "were", "be", "been", "being",
  "has", "have", "had", "do", "does", "did",
  "will", "would", "could", "should", "can", "may", "might",
  "not", "no", "yes", "ok", "sure", "thanks", "thank",
  "if", "but", "and", "or", "so", "then", "also",
]);

function isNoiseName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (lower.length < 2 || lower.length > 60) return true;
  const words = lower.split(/\s+/);
  return words.every((w) => NOISE_WORDS.has(w));
}

function inferEntityType(name: string): EntityType {
  const lower = name.toLowerCase();
  const toolMatch = name.match(TOOL_PROJECT_RE);
  if (toolMatch && toolMatch[0]!.toLowerCase() === lower) return "Tool";

  if (/\b(?:inc|corp|ltd|llc|gmbh|co|company|group)\b/i.test(name)) return "Company";
  if (/\b(?:university|institute|foundation|org)\b/i.test(name)) return "Organization";
  if (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(name)) return "Person";

  return "Unknown";
}

function snippet(text: string, maxLen = 120): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

/**
 * Extract structured facts from a single session's turns using
 * regex/heuristic patterns. For deeper extraction, pass an LLMFactExtractor.
 */
export async function extractFacts(
  session: LoadedSession,
  opts?: ExtractFactsOptions,
): Promise<ExtractionResult> {
  if (opts?.llmExtractor) {
    return opts.llmExtractor.extractFacts(session.turns, session.id);
  }

  const entMap = new Map<string, ExtractedEntity>();
  const relations: ExtractedRelation[] = [];
  const events: ExtractedEvent[] = [];

  function addEntity(
    name: string,
    type: EntityType,
    turn: SessionTurn,
  ): void {
    const trimmed = name.trim();
    if (isNoiseName(trimmed)) return;
    const key = trimmed.toLowerCase();
    let ent = entMap.get(key);
    if (!ent) {
      ent = { name: trimmed, type, mentions: [] };
      entMap.set(key, ent);
    }
    if (type !== "Unknown" && ent.type === "Unknown") {
      ent.type = type;
    }
    ent.mentions.push({
      sessionId: session.id,
      turnIndex: turn.turnIndex,
      snippet: snippet(turn.content),
    });
  }

  for (const turn of session.turns) {
    const text = turn.content;

    // Extract capitalized multi-word names (likely Person names)
    for (const m of text.matchAll(CAPITALIZED_NAME_RE)) {
      addEntity(m[1]!, inferEntityType(m[1]!), turn);
    }

    // Extract known tools/projects
    for (const m of text.matchAll(TOOL_PROJECT_RE)) {
      addEntity(m[0]!, "Tool", turn);
    }

    // Extract relations
    for (const pattern of RELATION_PATTERNS) {
      for (const m of text.matchAll(pattern.re)) {
        const head = m[pattern.headGroup]?.trim() ?? "";
        const tail = m[pattern.tailGroup]?.trim() ?? "";
        if (isNoiseName(head) || isNoiseName(tail)) continue;
        addEntity(head, inferEntityType(head), turn);
        addEntity(tail, inferEntityType(tail), turn);
        relations.push({
          headName: head,
          relation: pattern.relation,
          tailName: tail,
          sessionId: session.id,
          turnIndex: turn.turnIndex,
          evidence: snippet(text),
        });
      }
    }

    // Extract negated relations ("no longer uses X", "stopped using X")
    for (const pattern of NEGATION_PATTERNS) {
      for (const m of text.matchAll(pattern.re)) {
        const entityName = m[pattern.entityGroup]?.trim() ?? "";
        if (isNoiseName(entityName)) continue;
        addEntity(entityName, inferEntityType(entityName), turn);
        relations.push({
          headName: "",
          relation: pattern.relation,
          tailName: entityName,
          sessionId: session.id,
          turnIndex: turn.turnIndex,
          evidence: snippet(text),
          negated: true,
        });
      }
    }

    // Detect events (decisions, milestones)
    for (const re of EVENT_PATTERNS) {
      if (re.test(text)) {
        events.push({
          description: snippet(text, 200),
          sessionId: session.id,
          timestamp: session.createdAt || new Date().toISOString(),
          turnIndex: turn.turnIndex,
        });
        break;
      }
    }
  }

  return {
    entities: [...entMap.values()],
    relations,
    events,
  };
}

/**
 * Extract facts from multiple sessions and merge results.
 */
export async function extractFactsFromSessions(
  sessions: LoadedSession[],
  opts?: ExtractFactsOptions,
): Promise<ExtractionResult> {
  const allEntities: ExtractedEntity[] = [];
  const allRelations: ExtractedRelation[] = [];
  const allEvents: ExtractedEvent[] = [];

  for (const session of sessions) {
    const result = await extractFacts(session, opts);
    allEntities.push(...result.entities);
    allRelations.push(...result.relations);
    allEvents.push(...result.events);
  }

  return {
    entities: allEntities,
    relations: allRelations,
    events: allEvents,
  };
}
