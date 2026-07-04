# Ubiquitous Language

> pi-memory 扩展的领域术语表。实现与文档以本表 canonical 名称为准。

## Storage

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Ground Truth** | The durable cross-session fact store: `MEMORY.md` plus overflow `auto-*.md` files. | memory.db, chat backup |
| **Vector Index** | A derived SQLite file (`memory.vec.sqlite`) holding embeddings for episodic retrieval. | memory.db, sqlite-vec ANN |
| **Memory Entry** | One bullet fact in Ground Truth under Preferences, Conventions, Findings, or Todos. | note, fact, bullet |
| **Overflow File** | An `auto-*.md` spill file created when `MEMORY.md` exceeds the line cap. | auto file, spill |

## Read path

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Preflight** | Best-effort retrieval and injection before the main model sees each user message. | memory recall, pre-fetch |
| **QueryIntent** | Structured retrieval hints (what/who/where or raw_query) extracted by a helper LLM. | search intent |
| **Memory Cap** | Session-scoped static summary of Ground Truth injected without episodic query. | turnMemoryIndex, static cap |
| **Episodic Preflight** | QueryIntent → Sidecar query → optional Fallback for query-dependent recall. | full preflight |
| **Fallback** | Silent read of Ground Truth when Sidecar returns nothing or errors. | md fallback |
| **Private Memory** | The `<private_memory>` block prefixed to in-flight user messages only. | injected context |

## Write path

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Memory Export** | The cross-session facts section inside a dual-purpose compact summary. | memoryQueue, export block |
| **Compact Delta** | New Memory Export facts filtered against existing Ground Truth before append (subagent). | Stage1, shutdown extract |
| **Dual-Purpose Summary** | One LLM compact output with Session Context and Memory Export sections. | compact summary |
| **Consolidate** | Periodic LLM merge/dedupe of Ground Truth; not a source of new facts. | GC, merge |
| **Shutdown Queue** | Append-only JSONL file (`.memory_shutdown_queue.jsonl`) of session metadata on shutdown; drained by `pi-memory maintenance`. | session enqueue pipeline |

## Infrastructure

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Sidecar** | Separate Node process for embed, vector scan, MMR, and reindex over UDS. | tlm, daemon |
| **JSONL Framing** | One JSON object per line over UDS IPC. | NDJSON, ndjson |
| **Index Generation** | Monotonic counter bumped on reindex; invalidates query cache. | indexGeneration |
| **onSyncToSidecar** | Callback fired after Ground Truth writes to schedule debounced reindex. | onDirty |
| **onConsolidateCheck** | Callback fired after writes to schedule debounced consolidate evaluation. | onDirty |

## Session types

| Term | Definition | Aliases to avoid |
| ---- | ---------- | ---------------- |
| **Root Session** | A top-level Pi agent session without a parent session header. | main session |
| **Subagent Session** | A forked session whose header includes `parentSession` or `parent_session`. | child session, fork |

## Relationships

- **Ground Truth** is the source; the **Vector Index** is derived and may lag.
- **Preflight** reads **Ground Truth** via **Sidecar** first, then **Fallback**.
- **Root Session** runs **Episodic Preflight** plus **Memory Cap** each turn; **Subagent Session** runs **Memory Cap** only.
- **Memory Export** from compaction flows through **Compact Delta** for **Subagent Session**, then **appendIfAbsent**.
- **Shutdown Queue** records metadata only; it does not write **Ground Truth**.
- **Consolidate** rewrites **Ground Truth** and triggers **onSyncToSidecar**.

## Example dialogue

> **Dev:** "When a **Subagent Session** compacts, do we run **Episodic Preflight** on its turns?"
>
> **Domain expert:** "No. Subagents get **Memory Cap** at **session_start** and skip **Episodic Preflight**. New durable facts still arrive via **Memory Export**, but **Compact Delta** filters out anything already in parent **Ground Truth**."
>
> **Dev:** "What happens on **session_shutdown**?"
>
> **Domain expert:** "We append one line to the **Shutdown Queue**—session file, parent path, reason. No LLM on shutdown. **`pi-memory maintenance`** drains the queue offline (after consolidate), reusing **Compact Delta** rules for subagents."
>
> **Dev:** "If **Sidecar** is down, does **Preflight** fail?"
>
> **Domain expert:** "It **Fallback**s to **Ground Truth** or **Private Memory** stays empty. The user never sees an error."

## Flagged ambiguities

- **memory.db** was used for the vector file — canonical name is **Vector Index** file `memory.vec.sqlite`.
- **sqlite-vec** implied ANN search — MVP uses **better-sqlite3 + full-table cosine scan**; ANN is future work.
- **NDJSON / ndjson** — canonical term is **JSONL Framing** (one JSON object per line).
- **memoryQueue / onDirty / Stage1** — replaced by **appendFromCompaction**, **onSyncToSidecar**, and **Compact Delta**.
- **MVP chunking**：**1 Memory Entry = 1+ vector chunks**；超过 `PI_MEMORY_CHUNK_MAX_CHARS`（默认 512）按段落/句界拆分，`chunk_id = entry.id` 或 `entry.id#N`；embed 文本带 `[Section]` 前缀。Ground Truth 仍为 1 bullet = 1 entry。
