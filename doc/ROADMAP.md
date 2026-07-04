# @chendpoc/pi-memory Roadmap

<p align="center">
  <a href="ROADMAP.md">English</a> |
  <a href="ROADMAP-zh.md">简体中文</a>
</p>

This roadmap tracks product direction for `@chendpoc/pi-memory`. The README stays focused on positioning, installation, and the current architecture.

## Current Foundation

- `MEMORY.md` Ground Truth with overflow.
- `/remember` and `/memory-status`.
- Sidecar over UDS JSONL.
- `memory.vec.sqlite` vector index.
- QueryIntent with raw-query fallback.
- 800ms shared Preflight budget.
- Warm sidecar, intent cache, query cache.
- Dual-purpose compaction summary.
- Shutdown Queue + `maintenance`.
- Consolidate + reindex.
- Subagent Memory Cap + Compact Delta.

## P0: Trust And Safety

- Secret and token redaction before memory writes.
- Prompt-injection guardrails for LLM-generated Memory Export.
- Correction detector for explicit user corrections.
- Better diagnostics for skipped writes and fallback reasons.

## P1: Recall Quality

- Hybrid lexical + vector recall for `MEMORY.md` entries.
- Recall eval fixtures for common coding-agent questions.
- Debug metrics split by intent, embed, scan, MMR, render.
- Optional reranker after MMR when latency budget allows.
- Local embedding provider improvements beyond Ollama.

## P2: Memory Lifecycle

- Failure and tool-quirk categories.
- Human-reviewable memory draft or diary before promotion.
- Usage-weighted promotion and pruning.
- Safer consolidate previews before rewrite.
- Explicit stale fact handling instead of simple TODO pruning.

## P3: Product Surface

- Better TUI status panel.
- Memory edit/review commands.
- Import/export between Pi installations.
- Documentation recipes for common Pi setups.
