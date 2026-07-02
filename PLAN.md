# pi-memory — Implementation Plan

Local episodic memory for Pi Agent — TLM sidecar + `memory_recall` tool + implicit preflight.

Package: `@chendpoc/pi-memory` | Pi Extension via `@earendil-works/pi-coding-agent` `ExtensionAPI`

## Phase 1 — Core Infrastructure ✅

Foundation layer: types, config, paths, sidecar client/process, bundle readability.

- `src/types.ts` — TLM wire types mirroring Kocoro `internal/memory/types.go`
- `src/config.ts` — `MemoryConfig` with defaults + normalization
- `src/paths.ts` — `~/.pi` path helpers (`expandPath`, `defaultBundleRoot`, etc.)
- `src/errclass.ts` — HTTP/transport error classification
- `src/sidecar/client.ts` — Unix socket HTTP client (`/health`, `/query`, `/bundle/reload`)
- `src/sidecar/process.ts` — Spawn `tlm serve`, poll `/health` until ready, cross-platform stop
- `src/sidecar/bundle.ts` — `currentBundleReadable`, `readCurrentManifest`
- `src/service.ts` — `MemoryService` lifecycle (start/stop/query/health)

## Phase 2 — Preflight & Intent Detection ✅

Implicit episodic preflight: detect memory-relevant intents from user text, batch query sidecar, inject `<private_memory>` into the in-flight user message.

- `src/preflight/detectIntents.ts` — Chinese/English/Japanese relationship regex, lexical gate, `MemoryHelperLLM` interface for small-model fallback
- `src/preflight/render.ts` — `renderPrivateMemoryContext` with 8KB body cap
- `src/preflight/strip.ts` — `injectPrivateMemoryContext` / `stripPrivateMemory`
- `src/preflight/hook.ts` — `runMemoryPreflight` + `createBeforeTurnHook`

## Phase 3 — Fallback, Install & Tools ✅

Session keyword search fallback, bundle installer, `memory_recall` / `memory_append` tools, CLI, and extension entry point.

- `src/fallback/sessionSearch.ts` — Keyword AND search over session JSON files
- `src/fallback/memoryMd.ts` — MEMORY.md grep with 4KB cap
- `src/fallback/index.ts` — `createFallbackQuery` factory
- `src/bundle/install.ts` — `installBundle` (staging → bundles/<ts> → atomic current symlink)
- `src/tools/memoryRecall.ts` — `MemoryRecallTool` with sidecar + fallback paths
- `src/tools/memoryAppend.ts` — `appendToMemoryMd` with flock
- `src/extension.ts` — Legacy extension entry (deprecated, re-exports `pi-extension.ts`)
- `src/cli.ts` — `pi-memory` CLI (health, query, status, install-bundle, train, index)

## Phase 4 — Hardening & Polish ✅

Production hardening: version gates, retention, platform portability, degraded preflight.

- **Bundle version gate** — `versionInRange` enforces [0.4.0, 0.7.0) on `manifest.bundle_version` before install proceeds. Ported from Kocoro `bundle.go`.
- **Bundle retention** — `retainBundles(bundleRoot, keep)` prunes old bundle dirs after install, keeping the newest N plus the current symlink target. Ported from Kocoro `Puller.retain`.
- **Preflight fallback path** — When sidecar is not ready but a `FallbackQuery` is available, `runMemoryPreflight` performs lightweight session keyword search + MEMORY.md grep and injects a degraded `<private_memory>` block (lower confidence, keyword-only). Previously preflight silently returned null.
- **Windows `current` pointer** — `swapCurrent` detects `process.platform === 'win32'` and uses `fs.symlink(target, path, 'junction')` (unprivileged directory junction) instead of POSIX atomic tmp-symlink + rename. Ported from Kocoro `bundle_link_windows.go`.

## Phase 5 — Local Trainer ✅

Bundle generation pipeline: session JSON → heuristic fact extraction → entity resolution → TLM-compatible bundle → auto-install.

- `src/trainer/sessionLoader.ts` — Scan `~/.pi/sessions/*.json`, parse Pi session format (messages array with role/content), filter by modified-after marker. Return structured turns.
- `src/trainer/extractFacts.ts` — Heuristic regex/pattern extraction of entities (Person, Tool, Company, etc.), relations (from Kocoro `compactMemoryRelationCatalog`: uses, created, works_on, etc.), and events (decisions, milestones). `LLMFactExtractor` interface defined for optional deeper extraction.
- `src/trainer/entityResolver.ts` — Cross-session entity dedup via name normalization (case, whitespace, punctuation). Assigns stable `ent_<sha256[:12]>` IDs. Merges mentions and picks best entity type.
- `src/trainer/bundleBuilder.ts` — Produces TLM-compatible bundle: `bundles/<iso-ts>/manifest.json` + `graph.json` (entities, edges, events). Manifest includes per-file sha256 + integrity hash. Bundle version "0.6.0" (within install gate [0.4.0, 0.7.0)).
- `src/trainer/marker.ts` — `~/.pi/memory/.train_marker` (ISO timestamp). Next run only processes sessions modified after marker.
- `src/trainer/index.ts` — `trainBundle(config)` orchestrator: load → extract → resolve → build → install → update marker.
- CLI `pi-memory train` with `--sessions-dir`, `--full`, `--dry-run` flags.

### Bundle format

```
bundles/<iso-ts>/
  manifest.json   — { bundle_ts, bundle_version, size_bytes, integrity_sha256, files[] }
  graph.json      — { entities[], edges[], events[] }
```

- `entities[]`: `{ entity_id, label, type, aliases, mention_count, distinct_session_count }`
- `edges[]`: `{ head_entity_id, relation, tail_entity_id, supporting_event_ids, evidence }`
- `events[]`: `{ event_id, description, session_id, timestamp }`

Shape aligns with TLM query response (`candidates[].entity_id`, `supporting_event_ids`, `memory_block.groups[].via_relations`).

## Phase 6 — Deep Extraction + Scheduling + FTS5 ✅

LLM 深度提取、定时自动训练、SQLite FTS5 索引 — 三项功能完整实现。

### 6.1 LLM Fact Extractor

- `src/trainer/llmExtractor.ts` — `createLLMFactExtractor(opts)` 实现 `LLMFactExtractor` 接口
- 接受通用 LLM client: `{ complete(prompt: string): Promise<string> }`（不绑定具体厂商）
- 按可配置 batch size（默认 10 turns）分批调用 LLM，构建结构化提示
- 提取实体（Person, Project, Tool, Company, Organization, Location, Document）、关系（catalog 内）、事件
- 解析 JSON 响应，过滤非法关系类型、空实体名、超长名
- 每个 batch 独立 fallback：LLM 失败时退回 regex extractor（fail-safe）
- CLI: `pi-memory train --extractor llm --model deepseek/deepseek-v4-flash`
- Config: `memory.trainer.extractor: "regex" | "llm"`, `memory.trainer.llm_batch_size: 10`

### 6.2 Scheduled Training

- `src/trainer/scheduler.ts` — `createTrainScheduler(config, logger?)` 工厂
- 基于 `setInterval` 的简单调度器，周期性调用 `trainBundle()`
- 支持 "1h" / "6h" / "12h" / "24h" 间隔
- 启动时立即执行一次 tick，后续按间隔重复
- 每次 tick 检查 marker，无新 session 时跳过
- 日志回调记录：timestamp, sessionsProcessed, entityCount, relationCount, eventCount, durationMs, error
- `MemoryService.startAutoTrainer(logger?)` — 启动/重启调度器，service.stop() 时自动停止
- Extension 加载时若 `memory.trainer.auto_interval` 配置存在则自动启动
- CLI: `pi-memory train --watch`（运行一次后进入定时调度模式）

### 6.3 SQLite FTS5 Session Index

- `src/fallback/sessionIndex.ts` — `openSessionIndex(dbPath, injectedDb?)` 工厂
- 使用 `better-sqlite3`（ESM 兼容 via `createRequire`），DB 路径 `~/.pi/memory/sessions.db`
- 虚表: `session_fts(session_id, turn_idx, role, content, session_title, created_at)` FTS5
- `rebuildIndex(sessionsDir)` — 全量扫描并填充
- `incrementalIndex(sessionsDir, lastIndexedTs?)` — 仅索引新/修改的 session
- `search(query, limit)` → `SessionSearchHit[]`（与 file-scan 相同形状）
- DB metadata 表跟踪 `last_indexed_ts`
- `sessionSearch.ts` 优先使用 FTS5（DB 存在时），不存在时回退到文件扫描
- `MemoryService.start()` 后台触发 incremental index（非阻塞）
- CLI: `pi-memory index` — 手动全量重建索引

## Phase 7 — Pi ExtensionAPI Integration ✅

从 stub `PiExtensionAPI` 迁移到 `@earendil-works/pi-coding-agent` 的真实 `ExtensionAPI`，使 pi-memory 成为标准 Pi package。

### 7.1 Package 重构

- 包名 `@kocoro/pi-memory` → `@chendpoc/pi-memory`
- `package.json` 添加 `pi.extensions: ["./src/pi-extension.ts"]` 声明
- `peerDependencies`: `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, `typebox`
- `exports` 增加 `./extension` 入口
- `files` 增加 `src/**/*.ts`（jiti 直接加载 `.ts`，无需预编译 extension 入口）
- `keywords` 增加 `pi-package`, `pi-extension`

### 7.2 Pi LLM 适配层

- `src/adapters/piComplete.ts` — 基于 `@earendil-works/pi-ai/compat` 的 `complete()` 函数
- `resolveMemoryHelperLLM(ctx, modelSpec)` — async 工厂，model/auth 不可用时返回 `null`（仅走 regex 快路径）
- `createPiLLMClient(ctx, modelSpec)` — trainer 用 LLM client
- `createStandaloneLLMClient(modelSpec, env)` — CLI 用独立 LLM client（环境变量 API key）
- 默认 helper 模型: `deepseek/deepseek-v4-flash`
- 共享 `resolveModelAuth(ctx, provider, modelId)` 封装 `ctx.modelRegistry.find` / `getApiKeyAndHeaders`

### 7.3 Extension 入口

- `src/pi-extension.ts` — 真正的 `ExtensionAPI` 入口，由 Pi 通过 jiti 加载
- `src/extension.ts` — 标记 deprecated，re-export `pi-extension.ts`

生命周期映射：

| 旧 stub API | Pi 真实 API |
|-------------|-------------|
| factory 内 `service.start()` | `session_start` 事件 |
| `onUnload` | `session_shutdown` 事件 |
| `registerTool` (JSON schema) | `pi.registerTool` (TypeBox 参数) |
| `onBeforeTurn` | `context` 事件（LLM 调用前注入，不写入 session） |

### 7.4 本地安装

- `settings.json` 中 `packages` 数组添加 `"./extensions/pi-memory"`
- `pi list` 已识别并加载

## Phase 8 — Extensions 文档对齐 ✅

按 [Pi Extensions 文档](https://pi.dev/docs/latest/extensions) 补齐细节。

### 8.1 工具 Prompt 元数据

- `memory_recall` / `memory_append` 添加 `promptSnippet`（进入 Available tools 一行摘要）
- 添加 `promptGuidelines`（进入 Guidelines，明确工具名）
- 常量导出自 `src/tools/memoryRecall.ts` / `memoryAppend.ts`

### 8.2 Preflight 缓存 + ctx.signal

- `agent_start` 事件清空 `preflightCache`
- `context` 事件中按 user message text 缓存 preflight 结果，同一 agent loop 多轮 tool call 不重复查询
- `runMemoryPreflight` 传入 `ctx.signal` 支持用户 abort
- `resolveMemoryHelperLLM` 为 async 工厂：model/auth 不可用返回 `null`
- `session_start` + `model_select` 时刷新 `sharedHelper`

### 8.3 /memory 命令

- `pi.registerCommand("memory", ...)` 显示 sidecar status / reason / health
- 输出格式化文本到 `ctx.ui.notify`

### 8.4 Recall 输出截断

- `truncateHead` from `@earendil-works/pi-coding-agent` (200 lines / 32KB)
- 超出时附加截断提示

### 8.5 CLI LLM 接入

- `train --extractor llm` 使用 `createStandaloneLLMClient` + 环境变量 API key
- 支持 `--model deepseek/deepseek-v4-flash` 覆盖默认模型
- LLM 不可用时 CLI 自动回退 regex

## Phase 9 — Future Work

- **LLM Rerank** — FTS5 召回 top-N → 用 `complete()` 对 snippets 做相关性打分/摘要，替代原始关键词排序。无需 embedding 模型，复用 deepseek-v4-flash。
- **Semantic Search** — 复用 LLM rerank 管线替代纯关键词匹配，fallback 和 preflight 均可受益。
- **Session Dedup** — trainer 训练时和 FTS5 索引构建时，按 content hash 去除重复 session/消息，避免同一事实被多次提取、污染排名。
- **Cloud puller (optional)** — HTTP client to pull pre-built bundles from Shannon Cloud `/api/v1/memory/bundle/*`, with tenant fingerprint and 24h pull cycle. Only needed if the user connects to Cloud.
- **`before_agent_start` scaffold 分离** — 在 `before_agent_start` 用 `event.prompt` 做 intent 检测，`context` 只负责注入，实现 scaffold/userPayload 精确分离。
- **`onUpdate` 流式进度** — sidecar 查询较慢时通过 `onUpdate` 给用户流式反馈。
- **`registerFlag` 扩展** — 更多可配置项：`memory-provider`, `tlm-path`, `memory-train-interval` 等。
