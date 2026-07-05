# @chendpoc/pi-memory Roadmap

<p align="center">
  <a href="ROADMAP.md">English</a> |
  <a href="ROADMAP-zh.md">简体中文</a>
</p>

This is the public product roadmap for `@chendpoc/pi-memory`. It focuses on user-visible outcomes and intentionally avoids linking to internal `dev-doc/` design notes that are not shipped in the npm package.

## Version Map

| Version | Theme | User-facing outcome |
| --- | --- | --- |
| **0.3.x** | Trust and safety | Memory writes are safer, bounded, and easier to diagnose. |
| **0.4.x** | Recall quality | Pi retrieves the right memory more often under the Preflight budget. |
| **0.5.x** | Memory lifecycle | Users can review, age out, and correct long-lived memory with less manual cleanup. |
| **0.6.x** | Observability + controls | Users can inspect, debug, edit, review, and locally move memory between Pi installs. |
| **0.7.x** | Optional sync | Local-first memory can coordinate across agents or devices without making cloud sync mandatory. |

Before **0.7**, three things must be real: debug/trace, memory edit/review, and local import/export. Cloud or multi-agent sync should remain optional and local-first by default.

## Product Principles

- `MEMORY.md` remains the editable Ground Truth.
- Derived indexes, sidecars, traces, and future sync state must be rebuildable from local memory artifacts.
- Recall should improve ordinary agent behavior without adding multi-second thinking to every turn.
- Safety features should fail closed for memory writes and fail open for agent turns.
- `pi-memory` should not become a full transcript search product; that belongs in a dedicated session-search package.

## Current Foundation

- `MEMORY.md` Ground Truth with overflow.
- `/remember` and `/memory-status`.
- Sidecar over UDS JSONL.
- `memory.vec.sqlite` vector index.
- QueryIntent with raw-query fallback.
- 800ms shared Preflight budget with AbortSignal-aware sidecar query.
- Warm sidecar, intent cache, query cache.
- Dual-purpose compaction summary.
- Shutdown Queue + `maintenance`.
- Consolidate + reindex.
- Subagent Memory Cap + Compact Delta.
- Secret redaction before Ground Truth writes.
- `MemoryRuntime` extension lifecycle and refactored store/sidecar modules.

## P0: Trust And Safety

**Target: 0.3.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/1)

User-facing goal: memory should be safe enough to keep enabled by default.

- ✅ Secret and token redaction before durable memory writes — **shipped in 0.3.0**.
- ✅ Smaller, clearer runtime modules for store, ingest, status, lifecycle, and sidecar behavior — **shipped in 0.3.0**.
- Prompt-injection guardrails for LLM-generated Memory Export.
- Correction detector for explicit user corrections, scoped first to the `/remember` path.
- Lightweight reason codes for skipped writes and fallback decisions; full trace UX is planned for **0.6**.

## P1: Recall Quality

**Target: 0.4.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/2)

User-facing goal: Pi should recall the right stable facts more often, while staying fast enough for interactive turns.

- Hybrid lexical + vector recall for `MEMORY.md` entries: SQLite FTS5 plus existing vector chunks, RRF merge, then MMR.
- Recall eval fixtures for common coding-agent questions.
- Debug metrics split by intent, embed, scan, MMR, render, fallback, and total Preflight time.
- Embedding provider improvements beyond Ollama, including free/open-source embedding APIs where practical.
- Sidecar retrieval optimizations: incremental reindex, batch embed, and clearer reindex/query isolation.
- Optional reranker after MMR only when it fits the latency budget.

## P2: Memory Lifecycle

**Target: 0.5.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/3)

User-facing goal: long-lived memory should stay useful instead of becoming a growing pile of stale facts.

- Failure and tool-quirk categories.
- Human-reviewable memory draft or diary before promotion.
- Usage-weighted promotion and pruning.
- Safer consolidate preview before rewrite.
- Explicit stale/superseded fact handling instead of simple TODO pruning.
- Lifecycle events feed the shared debug/trace event schema; the user-facing trace surfaces ship in **0.6**.

## P3: Observability + Controls

**Target: 0.6.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/4)

User-facing goal: when memory behaves unexpectedly, users can see why and fix it without reading raw internals.

Required exit criteria:

- Local trace ring buffer, for example `logs/trace.jsonl`, with stable event names and reason codes.
- `pi-memory status --verbose` and `/memory-status` surfaces that summarize recent skip, fallback, write, reindex, and recall events.
- Memory edit/review commands paired with stale/supersede semantics from **0.5**.
- Local import/export between Pi installations, with a dry-run mode before any future sync work.

Optional backlog for 0.6:

- Better TUI status panel.
- Documentation recipes for common Pi setups.
- Remaining sidecar tuning such as parallel raw+intent recall, MMR lambda tuning, and post-consolidate recall spot checks, driven by p99 latency and eval data.

## P4: Optional Sync

**Target: 0.7.x**

User-facing goal: users who work across multiple Pi agents or devices can coordinate memory without giving up local control.

- Multi-agent cross-session memory coordination.
- Optional cloud Pi agent <-> local Pi agent session-memory sync.
- `MEMORY.md` remains the source of truth; vector indexes are rebuilt per device.
- No automatic upload by default.
- Sync design must define conflict handling, trust boundaries, redaction guarantees, and rollback before implementation.
- Prerequisites: injection + redaction closed loop, stale/edit semantics, local import/export, and debug/trace for cross-process write troubleshooting.
