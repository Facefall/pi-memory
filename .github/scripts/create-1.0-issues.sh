#!/usr/bin/env bash
# One-shot script to create 1.0 roadmap issues. Safe to re-run only on empty repo.
set -euo pipefail
cd "$(dirname "$0")/../.."

create() {
  local milestone="$1"
  local title="$2"
  local body="$3"
  gh issue create \
    --repo chendpoc/pi-memory \
    --title "$title" \
    --label enhancement \
    --milestone "$milestone" \
    --body "$body"
}

# --- v0.3 P0 Trust & Safety ---

create "v0.3 — P0 Trust & Safety" "Redact secrets and tokens before Ground Truth writes" "$(cat <<'EOF'
## What to build

Scan and redact likely secrets (API keys, tokens, passwords, private keys) before any text is persisted to **Ground Truth** — including `/remember`, **Memory Export** ingest, **Compact Delta**, and shutdown-queue drain paths.

Redaction should replace matched spans with a stable placeholder (e.g. `[REDACTED]`) and log that redaction occurred when `PI_MEMORY_DEBUG=1`.

## Acceptance criteria

- [ ] Shared redaction utility used by all write paths that append to `MEMORY.md` / `auto-*.md`
- [ ] Covers common patterns: `sk-…`, `Bearer …`, `ghp_…`, PEM blocks, `.env`-style `KEY=value` secrets
- [ ] Unit tests with fixture strings; no false-positive regressions on normal coding notes
- [ ] Debug log event `write_redacted` with count of redactions (no secret content in logs)

## Blocked by

None — can start immediately.
EOF
)"

create "v0.3 — P0 Trust & Safety" "Prompt-injection guardrails for LLM Memory Export" "$(cat <<'EOF'
## What to build

When **Memory Export** facts are parsed from a dual-purpose compact summary (or shutdown drain LLM output), reject or sanitize entries that look like prompt-injection attempts — e.g. instructions to ignore prior context, override system prompts, or exfiltrate secrets.

Failed entries should be skipped with a diagnosable reason, not silently merged into **Ground Truth**.

## Acceptance criteria

- [ ] Heuristic and/or lightweight classifier pass on each exported bullet before `appendIfAbsent`
- [ ] Known injection patterns blocked; legitimate technical findings still pass
- [ ] Skipped entries recorded in debug/status output (`export_rejected`, reason code)
- [ ] Tests with adversarial compact-summary fixtures

## Blocked by

None — can start immediately.
EOF
)"

create "v0.3 — P0 Trust & Safety" "Correction detector for explicit user corrections" "$(cat <<'EOF'
## What to build

Detect when the user explicitly corrects a prior memory fact (e.g. "actually we use Vitest not Jest", "forget that", "that's wrong") and update **Ground Truth** accordingly — supersede or remove the old **Memory Entry** instead of appending a conflicting bullet.

## Acceptance criteria

- [ ] Correction intent detected on user turn (rule-based and/or small helper LLM within Preflight budget)
- [ ] Matching prior entries located (by id, section, or lexical overlap) and marked superseded or removed
- [ ] `[user]` entries require explicit user confirmation or stronger match before auto-delete
- [ ] Sidecar reindex triggered after correction write
- [ ] Tests for supersede, retract, and no-op cases

## Blocked by

None — can start immediately.
EOF
)"

create "v0.3 — P0 Trust & Safety" "Diagnostics for skipped writes and Preflight fallback" "$(cat <<'EOF'
## What to build

Make it obvious *why* memory was not written or *why* **Preflight** fell back — without reading source code. Extend `pi-memory status`, `/memory-status`, and `PI_MEMORY_DEBUG` logs with structured reason codes.

## Acceptance criteria

- [ ] Write path emits reason codes: duplicate, empty export, injection rejected, redaction-only, overflow cap, etc.
- [ ] Preflight debug includes: sidecar timeout, empty results, fallback used, intent skipped, budget exhausted
- [ ] `pi-memory status --verbose` summarizes last N skip/fallback events from a small local ring buffer or log file
- [ ] Documented reason-code table in README

## Blocked by

None — can start immediately (incremental; can land before other P0 slices).
EOF
)"

# --- v0.4 P1 Recall Quality ---

create "v0.4 — P1 Recall Quality" "Hybrid lexical + vector recall for Ground Truth" "$(cat <<'EOF'
## What to build

Combine lexical search (BM25/FTS or ripgrep-style token match) with existing vector **Sidecar** query so **Preflight** recall hits exact identifiers (file names, env vars, package names) even when embeddings miss.

Merge and dedupe results before MMR/render, still within the shared Preflight budget.

## Acceptance criteria

- [ ] Lexical index built from **Memory Entry** text (derived, rebuildable like **Vector Index**)
- [ ] Sidecar `query` or Preflight merges lexical + vector candidates
- [ ] Configurable weights or simple union+score fusion; defaults documented
- [ ] Tests: exact-token recall cases that pure vector currently misses
- [ ] Reindex path rebuilds both indexes

## Blocked by

None — can start immediately.
EOF
)"

create "v0.4 — P1 Recall Quality" "Recall eval fixtures and CI regression gate" "$(cat <<'EOF'
## What to build

Curated eval set of coding-agent questions → expected **Memory Entry** ids/sections. Run as part of CI to measure recall@k and prevent regressions when tuning retrieval.

## Acceptance criteria

- [ ] `test/eval/` (or `eval/`) fixtures: question, seeded Ground Truth, expected entry ids
- [ ] `pnpm test:eval` (or vitest project) reports recall@1 / recall@3 metrics
- [ ] CI job runs eval on main; fails on regression beyond threshold
- [ ] README documents how to add fixtures

## Blocked by

- Hybrid lexical + vector recall (#TBD — update after issue numbers exist)

## Notes

Can start with vector-only baseline fixtures before hybrid lands; gate tightens after hybrid merge.
EOF
)"

create "v0.4 — P1 Recall Quality" "Split Preflight debug metrics by phase" "$(cat <<'EOF'
## What to build

Extend Preflight debug JSON to break down latency and outcomes by phase: intent extraction, embed, vector scan, MMR, render — not just `intent_ms` / `sidecar_ms` totals.

## Acceptance criteria

- [ ] Debug log fields: `embed_ms`, `scan_ms`, `mmr_ms`, `render_ms` (or equivalent sidecar-reported breakdown)
- [ ] `PI_MEMORY_DEBUG=1` documented with example payload
- [ ] `/memory-status` optional last-turn timing summary
- [ ] Tests assert fields present when debug enabled

## Blocked by

None — can start immediately.
EOF
)"

create "v0.4 — P1 Recall Quality" "Optional reranker after MMR when budget allows" "$(cat <<'EOF'
## What to build

When Preflight budget remains after MMR selection, optionally rerank top candidates with a lightweight cross-encoder or helper LLM call to improve precision on ambiguous queries.

## Acceptance criteria

- [ ] Opt-in via env (e.g. `PI_MEMORY_RERANK=1`); default off
- [ ] Respects remaining Preflight budget; skips rerank if insufficient time
- [ ] Eval fixtures show measurable precision gain on at least one ambiguous case
- [ ] No rerank does not change current default behavior

## Blocked by

- Recall eval fixtures and CI regression gate

## Notes

Nice-to-have for v0.4; not required for v1.0 gate.
EOF
)"

# --- v0.5 P2 Memory Lifecycle ---

create "v0.5 — P2 Memory Lifecycle" "Failure and tool-quirk Memory Entry categories" "$(cat <<'EOF'
## What to build

Add dedicated **Ground Truth** sections or tags for agent failures and tool quirks (e.g. "eslint fails on this repo until X"), so they are recalled distinctly from **Findings** and survive consolidate without being pruned as noise.

## Acceptance criteria

- [ ] Template + parser support new sections or `[failure]` / `[quirk]` entry markers
- [ ] Consolidate prompt preserves failure/quirk entries with stricter rules than generic findings
- [ ] Preflight render includes section context in chunk prefix
- [ ] Migration: existing entries unchanged; new writes can use categories

## Blocked by

None — can start immediately.
EOF
)"

create "v0.5 — P2 Memory Lifecycle" "Explicit stale fact handling" "$(cat <<'EOF'
## What to build

Replace simple obsolete-TODO pruning with explicit stale-fact lifecycle: detect contradictions, time-decay signals, and user-marked staleness; supersede rather than silently delete when possible.

## Acceptance criteria

- [ ] Consolidate identifies conflicting facts and keeps newer/superseding entry
- [ ] Optional `stale` metadata or section for facts past TTL
- [ ] `[user]` entries never auto-deleted by stale logic
- [ ] Tests for conflict resolution and TTL expiry

## Blocked by

- Correction detector for explicit user corrections

## Notes

Correction detector and stale handling should share supersede mechanics where possible.
EOF
)"

create "v0.5 — P2 Memory Lifecycle" "Consolidate preview before Ground Truth rewrite" "$(cat <<'EOF'
## What to build

Before **Consolidate** rewrites **Ground Truth**, produce a human-readable preview (diff or draft file) so users can inspect merge/dedupe/prune actions. Default: write preview to agent dir; `--force` or cron applies without prompt.

## Acceptance criteria

- [ ] `pi-memory consolidate --dry-run` (or `--preview`) writes preview artifact without mutating `MEMORY.md`
- [ ] Preview shows added/removed/merged entries with ids
- [ ] `--force` applies preview plan; idempotent if re-run
- [ ] Documented in README maintenance section

## Blocked by

None — can start immediately.
EOF
)"

create "v0.5 — P2 Memory Lifecycle" "Human-reviewable memory draft before promotion" "$(cat <<'EOF'
## What to build

Optional mode where **Memory Export** and shutdown-drain candidates land in a review queue (draft file or JSONL) instead of immediate **Ground Truth** append. User approves via CLI before promotion.

## Acceptance criteria

- [ ] Opt-in env `PI_MEMORY_REVIEW=1` (or similar)
- [ ] Draft queue with pending entries, source session, timestamp
- [ ] `pi-memory review list|approve|reject` commands
- [ ] Approved entries follow normal append + reindex path
- [ ] Default off — no behavior change for existing users

## Blocked by

- Prompt-injection guardrails for LLM Memory Export
- Redact secrets and tokens before Ground Truth writes

## Notes

HITL slice — design approval on queue format before implementation.
EOF
)"

# --- v1.0 Production Ready ---

create "v1.0 — Production Ready" "Memory review and edit CLI" "$(cat <<'EOF'
## What to build

CLI commands to list, search, edit, and delete **Memory Entry** bullets without hand-editing `MEMORY.md` — the minimum product surface for correcting bad recall at 1.0.

## Acceptance criteria

- [ ] `pi-memory entries list [--section]` with id, section, preview text
- [ ] `pi-memory entries edit <id>` or `--replace` for inline correction
- [ ] `pi-memory entries delete <id>` with guard for `[user]` entries
- [ ] Edits trigger debounced reindex
- [ ] Tests for parse round-trip preserving entry metadata comments

## Blocked by

- Diagnostics for skipped writes and Preflight fallback (reason codes help edit UX)

## Notes

Can share machinery with human-reviewable draft queue if that lands in v0.5.
EOF
)"

create "v1.0 — Production Ready" "Documentation recipes for common Pi setups" "$(cat <<'EOF'
## What to build

Opinionated setup guides: Ollama embeddings, OpenAI embeddings, cron maintenance on macOS/Linux/Windows, multi-project agent dirs, subagent-heavy workflows.

## Acceptance criteria

- [ ] `doc/recipes/` (or README section) with at least 4 recipes
- [ ] Each recipe: env vars, init steps, maintenance schedule, troubleshooting
- [ ] Linked from README and README-zh
- [ ] Recipes validated against current CLI flags

## Blocked by

None — can start immediately (content can land incrementally).
EOF
)"

create "v1.0 — Production Ready" "Stable public API and 1.0 migration guide" "$(cat <<'EOF'
## What to build

Document semver guarantees for 1.0: stable env var names, CLI commands, **Ground Truth** entry format, and sidecar IPC schema. Provide migration notes from 0.2.x.

## Acceptance criteria

- [ ] `doc/MIGRATION-0.2-to-1.0.md` (or CHANGELOG major section)
- [ ] All `PI_MEMORY_*` env vars listed with stability tier (stable / experimental)
- [ ] Breaking changes since 0.2.0 explicitly called out (if any remain)
- [ ] ROADMAP updated: 1.0 scope frozen

## Blocked by

- v0.3, v0.4, v0.5 milestone slices substantially complete

## Notes

HITL — you approve the stability contract before tagging 1.0.
EOF
)"

create "v1.0 — Production Ready" "1.0 release gate: recall eval baseline" "$(cat <<'EOF'
## What to build

Define and enforce minimum recall@k thresholds on the eval fixture suite as the final gate before tagging v1.0.

## Acceptance criteria

- [ ] Documented baseline metrics (e.g. recall@3 ≥ X% on N fixtures)
- [ ] CI fails if below baseline
- [ ] CHANGELOG 1.0 entry cites eval results
- [ ] P0 trust slices (redaction, injection guard, correction) all closed

## Blocked by

- Recall eval fixtures and CI regression gate
- Redact secrets and tokens before Ground Truth writes
- Prompt-injection guardrails for LLM Memory Export
- Correction detector for explicit user corrections
- Hybrid lexical + vector recall for Ground Truth
- Memory review and edit CLI

## Notes

Meta issue — close last when all blockers ship.
EOF
)"

echo "Done."
