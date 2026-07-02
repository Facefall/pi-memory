/** Wire types mirroring Kocoro internal/memory/types.go (TLM sidecar contract). */

export type QueryMode =
  | "direct_relation"
  | "path_query"
  | "typed_neighborhood";

export interface QueryIntent {
  mode: QueryMode;
  anchor_mentions: string[];
  relation_constraints?: string[];
  candidate_type?: string | null;
  scope_filter?: string[];
  target_slot?: "" | "head" | "tail";
  time_window?: string | null;
  evidence_budget?: number;
  result_limit?: number;
}

export interface QueryRequest {
  intent: QueryIntent;
  user_id?: string | null;
  request_id?: string | null;
}

export interface HopRecord {
  from_entity_id: string;
  from_label: string;
  relation: string;
  direction: string;
  to_entity_id: string;
  to_label: string;
  supporting_event_ids: string[];
}

export interface QueryCandidate {
  value: string;
  score: number;
  evidence: string;
  supporting_event_ids: string[];
  support_count?: number | null;
  distinct_session_count?: number | null;
  entity_id?: string | null;
  scope?: string | null;
  observed_path?: HopRecord[];
  path_collision_count?: number;
}

export interface MemoryCandidateGroup {
  value: string;
  score: number;
  evidence: string;
  support_count: number;
  supporting_event_ids: string[];
  entity_ids: string[];
  scopes: string[];
  via_relations: string[];
  via_anchor_entity_ids: string[];
  observed_path: HopRecord[];
  path_collision_count: number;
}

export interface MemoryBlock {
  groups: MemoryCandidateGroup[];
  no_data_reason?: string | null;
  notes: string[];
}

export interface Warning {
  code: string;
  message: string;
}

export interface ErrorObject {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export function errorSubCode(err: ErrorObject | null | undefined): string {
  if (!err?.details) return "";
  const v = err.details.sub_code;
  return typeof v === "string" ? v : "";
}

export interface ResponseEnvelope {
  protocol_version: number;
  bundle_version?: string;
  bundle_created_at?: string | null;
  bundle_dir?: string;
  request_id: string;
  candidates: QueryCandidate[];
  memory_block?: MemoryBlock | null;
  warnings: Warning[];
  reason: string;
  error?: ErrorObject | null;
  latency_ms: number;
}

export interface ReloadResponse {
  protocol_version: number;
  request_id: string;
  swapped: boolean;
  trigger: string;
  reason: string;
  previous_bundle_dir?: string | null;
  current_bundle_dir?: string | null;
  reload_duration_ms: number;
  warnings: Warning[];
  error?: ErrorObject | null;
}

export interface HealthPayload {
  ready: boolean;
  compatibility: string;
  bundle_version?: string;
  bundle_created_at?: string | null;
  bundle_dir?: string;
  last_reload_age_secs?: number | null;
  last_reload_trigger?: string | null;
  protocol_version: number;
  uptime_secs: number;
  error?: ErrorObject | null;
  status_message?: string;
}

export type ServiceStatus =
  | "disabled"
  | "initializing"
  | "ready"
  | "degraded"
  | "unavailable";

export interface MemoryRecallArgs {
  mode?: string;
  anchor_mentions: string[];
  relation_constraints?: string[];
  candidate_type?: string | null;
  scope_filter?: string[];
  target_slot?: string;
  time_window?: string | null;
  evidence_budget?: number;
  result_limit?: number;
}

export interface ToolResult {
  content: string;
  isError?: boolean;
}

export type ErrorClass = "ok" | "retryable" | "permanent" | "unavailable";

export interface MemoryQuerier {
  status(): ServiceStatus;
  query(
    intent: QueryIntent,
    signal?: AbortSignal,
  ): Promise<{
    env: ResponseEnvelope | null;
    errorClass: ErrorClass;
    transportError?: Error;
  }>;
}

export interface FallbackQuery {
  sessionKeyword(query: string, limit: number): Promise<unknown[]>;
  memoryFileSnippet(query: string): Promise<string>;
}
