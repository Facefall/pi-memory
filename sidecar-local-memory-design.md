# Sidecar 本地记忆方案 — 设计总结

> 基于 Kocoro episodic memory 逆向分析与 Pi agent 集成讨论的最终方案。  
> 目标：**新开 session 时不失忆**；长 session 内靠 Pi compaction 续 context；本地轻量、可跨平台。

---

## 0. 方案清单（Quick Reference）

| 层级 | 选型 |
|------|------|
| **结构化校验** | Zod + sanitize；Preflight QueryIntent **最多 1 次 retry** |
| **进程** | `spawn` / `execa` 管理 Sidecar；**不用 PM2** |
| **IPC** | `node:net` UDS + **NDJSON 行帧**（`ndjson` 拆帧） |
| **向量库** | **`memory.vec.sqlite`**（better-sqlite3 + JS cosine；MVP 全表扫描，非 sqlite-vec ANN） |
| **Session 搜索** | **pi-session-search**（独立 FTS5 索引；**不在 sidecar DB 重复建**） |
| **文件锁** | **proper-lockfile**（macOS + Windows） |
| **存储抽象** | **MemoryStore** — 外界不直接操作 agent 目录文件 |
| **调度** | Extension 内 **24h interval + debounce**；**03:00** 用 **launchd / cron / schtasks** → `pi-memory consolidate --cron` |
| **跨平台** | `platform-paths` 抽象（socket、agentDir、db、chmod） |

| 方向 | 链路 |
|------|------|
| **Read** | Preflight → Sidecar query → Fallback（MEMORY.md 或空注入） |
| **Write 1** | `/remember` → appendUser（sync） |
| **Write 2** | custom compact summary → `session_compact` → `appendFromCompaction`（fire-and-forget） |
| **Write 3** | Consolidate（条件 OR + 03:00）→ rewrite → reindex |

---

## 1. 设计目标与非目标

### 目标

- **跨 session 记忆**：偏好、项目约定、关键决策、待办在新 session 仍可用（Preflight 检索注入）。
- **长 session 内续聊**：交给 **Pi compaction**（`CompactionEntry` + `Session Context`），不重复造轮子。
- **足够轻**：本地 **sqlite-vec**（`memory.db`），Sidecar 独立进程；无 Qdrant / PM2 / 自建 session FTS5。
- **Session 历史搜索**：交给 **pi-session-search**（Agent 工具层）；与 Preflight / Sidecar **解耦**。
- **用户可控**：显式 **`/remember`** 写入，不做自然语言「记住」关键字检测。
- **不阻塞热路径**：MEMORY 入库与整理 **异步**（`appendFromCompaction` fire-and-forget、consolidate debounce/interval）；compact 时用户只等 **一次** custom summary LLM。

### 非目标

- 不替代 Pi 的 session 内 compaction（Pi 仍负责 `keepRecentTokens` / `reserveTokens` 等，见 [Pi compaction 文档](https://pi.dev/docs/latest/compaction)）。
- 不在 Preflight 或 compact **之后**再同步跑第二条 memory LLM（Memory Export 规则 parse 为主；parse 失败才 optional fallback）。
- 不把 `<private_memory>` 写回 session 或 MEMORY。
- 不用 Reflect / ToT 增强 QueryIntent；不用 PM2 管 Sidecar 或 consolidate。
- 审计、Shannon Cloud 跨 session（Kocoro 文档称 NOT IMPLEMENTED）本文不展开。
- 不在 `memory.db` 内维护 Kocoro 式 **`sessions_fts`**；Preflight Fallback **不接** pi-session-search。
- **§11 Backlog** 中的 Preflight 预算压缩、Sidecar query 缓存、本地 embed 等**性能优化不属于 MVP 设计目标**；MVP 验收不依赖 Backlog。

---

## 2. 架构总览

```
┌─ Daemon / Pi Agent ─────────────────────────────────────────────┐
│  /remember              → MemoryStore.appendUser (sync)         │
│  session_before_compact → dual-purpose summary (LLM ×1)         │
│  session_compact        → appendFromCompaction (async)            │
│  Preflight              → buildRetrievalQuery → sidecar.query   │
│  consolidate            → MemoryStore.consolidate (async)       │
│  onSyncToSidecar        → debounced sidecar.reindex             │
└───────────────────────────────┬─────────────────────────────────┘
                                │ UDS (NDJSON)
                                ▼
┌─ Sidecar 进程 (spawn/execa) ────────────────────────────────────┐
│  ping/pong 就绪 │ query: embed → cosine scan → MMR → results      │
│  reindex: MemoryStore.exportForIndex → upsert memory.vec.sqlite  │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌─ 存储（本方案） ────────────────────────────────────────────────┐
│  MEMORY.md (+ auto-*.md)     ← Ground truth（有界 150 行）       │
│  memory.vec.sqlite           ← Sidecar 向量索引（派生）            │
└─────────────────────────────────────────────────────────────────┘

┌─ 独立扩展（Pi 生态，非 Sidecar 职责） ──────────────────────────┐
│  pi-session-search           ← session JSONL FTS5 / hybrid 搜索   │
│  Agent 工具 session_search   ← 用户/模型主动搜历史；不进 Preflight Fallback │
└─────────────────────────────────────────────────────────────────┘
```

### 进程边界

| 组件 | 职责 |
|------|------|
| **Daemon / Agent** | QueryIntent、`buildRetrievalQuery`、Preflight、MEMORY 写入、Consolidate、spawn Sidecar |
| **Sidecar** | 向量检索 + reindex；**不**写 MEMORY.md；**不**解析 QueryIntent |
| **MEMORY.md** | 持久事实源；Sidecar 索引为 **派生数据**；Sidecar 失败/空时 Fallback 直读 md |
| **pi-session-search** | 搜 **历史 session**（独立 FTS5 索引）；**不**写入 `memory.db`；**不**参与 Preflight Fallback |

---

## 3. 三条 MEMORY 写入链路

### 3.1 `/remember` — 用户显式写入

| 项 | 说明 |
|----|------|
| **触发** | Pi slash `/remember [section]? content` |
| **路径** | `MemoryStore.appendUser()` → 内部 bounded `memory_append` |
| **同步** | 是；无 LLM |
| **格式** | `[user]`；Consolidate 不可删 |
| **溢出** | >150 行 → `auto-*.md` + 指针行 |
| **索引** | append 后 `onSyncToSidecar` → debounced reindex |

### 3.2 Session compaction — compact 后异步入库

**Pi 事件分工：**

| 事件 | 职责 |
|------|------|
| `session_before_compact` | 调 LLM 生成 **dual-purpose summary**，return `{ compaction }` **替换** Pi 默认摘要 |
| `session_compact` | **fire-and-forget** `MemoryStore.appendFromCompaction`；不在此同步写 MEMORY |

**Dual-purpose summary：**

```markdown
## Session Context
<!-- 本 session 续聊：Goal / Progress / Next Actions / 文件变更摘要 -->

## Memory Export
<!-- 仅跨 session durable 事实；无则省略小节 -->

### Preferences
### Conventions
### Findings
### Todos
```

| 项 | 说明 |
|----|------|
| **Worker** | `appendFromCompaction`：解析 `Memory Export` → subagent **delta filter** → `appendIfAbsent` |
| **队列** | 无独立 `memoryQueue`；extension 内 Promise fire-and-forget；**不阻塞** compact 完成后的聊天 |
| **幂等** | `compactionId` + `hasProcessedCompaction` |
| **Fallback** | 规则 parse 失败 → 小模型 summary → JSON facts → append |
| **用户等待** | compact 过程 **1 次** summary LLM（不可避免）；memory 入库在后台 |

**可选扩展（非主路径）：** `session_before_tree` / branch summary 同样可 enqueue，与三条主链路并列时单独评估。

### 3.3 ConsolidateMemory — 定期整理

| 项 | 说明 |
|----|------|
| **触发（OR）** | `auto-*.md ≥ 12` **或** 距 `.memory_gc ≥ 7` 天 **或** 每日 **03:00** |
| **调度** | Extension **24h interval + debounce**；**03:00** 用 **launchd plist**（mac）/ **crontab** / **任务计划程序**（Win）执行 `pi-memory consolidate --cron` |
| **路径** | `proper-lockfile` → `readResolved()` → LLM merge → `rewriteEntriesUnlocked()` → **删除** `auto-*.md` → `.memory_gc` |
| **后续** | **`sidecar.reindex()`** |
| **目的** | 去重、删过期 TODO；**不是**新事实 |
| **append 后** | `overflowFileCount ≥ 12` 可 **debounce** 触发 consolidate 检查（不必等 3:00） |

---

## 4. Preflight 读取链路

每条 user message、主模型 **之前**（best-effort，Preflight 总超时 **500~800ms**）：

```
1. 小模型 → QueryIntent
   strict schema / generateObject + Zod sanitize + 最多 1 次 retry
   失败 → { raw_query: userInput }

2. buildRetrievalQuery(intent)   ← daemon 纯函数，非 Sidecar
   what + who + where | raw_query

3. sidecar.query(queryString)      ← UDS
   embed(1536d) → sqlite-vec TOP(K×3) → MMR(λ=0.7) → MemoryEntry[]

4. 非空 → user message 前缀：
   <private_memory>...</private_memory>\n\n{原始 userInput}

5. saveSession(原始 userInput)     ← 不含 private_memory
6. compaction 输入剥离 <private_memory>
```

### Fallback（静默，Debug 日志）

相对 Kocoro 四层链（Sidecar → session FTS5 → MEMORY.md → stateless），本方案 **去掉 session FTS5 层**；Preflight 终点只有两种：**注入 MEMORY 内容** 或 **空注入**。

```
Sidecar query（主路径：sqlite-vec + MMR）
  ↓ err / 超时 / 无结果
MemoryStore.readForFallback(maxChars)   ← 读 MEMORY.md（Ground truth；有 char 上限）
  ↓ 非空 → 格式化为 <private_memory> 注入
  ↓ 空文件 / 读失败
stateless（空注入）→ 主模型照常，用户无报错
```

| 项 | 说明 |
|----|------|
| **触发** | Sidecar 不可用、query 超时、或 vec 返回 0 条 |
| **MEMORY 兜底** | 索引 lag 或未 reindex 时仍能读到最新 md |
| **空注入** | MEMORY 为空或读失败时的 **正常终态**，非错误 |
| **不做** | 不在 Fallback 中调 pi-session-search / 自建 FTS5 |
| **日志** | 降级用 `Debug`；不向用户暴露「记忆服务不可用」 |

**与 pi-session-search 分工：** Preflight 管 **跨 session 便签（MEMORY）** 的自动注入；搜 **旧 session 对话** 由 Agent 在需要时调用 `session_search` 工具（pi-session-search 扩展）。

### 4.3 Subagent 会话（读 / 写分工）

Pi 可 fork/spawn **子 agent session**（session header 含 `parentSession` / `parent_session`）。子 session 与 root session **不应共用同一套 Preflight 策略**——对齐 Codex「sub-agent 不触发记忆写入管线」的思路，并在读路径上避免重复 episodic 查询。

#### 识别

```typescript
function isSubagentSession(ctx: ExtensionContext): boolean {
  const header = ctx.sessionManager.getHeader() as Record<string, unknown> | undefined;
  const parent = header?.parentSession ?? header?.parent_session;
  return typeof parent === "string" && parent.trim().length > 0;
}
```

| 信号 | 来源 |
|------|------|
| `parentSession` / `parent_session` | session JSONL header |
| `parentSessionId` / `parent_session_id` | 部分 fork 元数据（写路径 consolidation 已用） |

#### 读路径：Preflight 分级

| Session 类型 | 触发点 | Episodic Preflight（QueryIntent → sidecar） | 静态 MEMORY cap |
|--------------|--------|---------------------------------------------|-----------------|
| **Root** | 每条 user message 的 `before_agent_start` | ✅ 全链路（§4） | ✅ 每轮（有界 char 上限） |
| **Subagent** | `session_start` 一次 + 每轮仅 cap | ❌ **默认跳过** | ✅ `session_start` 注入；`before_agent_start` 可复用缓存 |

**Root session（不变）：** 每条用户消息、`主模型之前`，走完整 Preflight（意图提取 → 检索 → 注入）。**不是** `session_start` 一次性注入——需要 query-dependent 召回（如「测试框架用什么」「Alice 是谁」）。

**Subagent session（简化）：**

```
session_start
  → MemoryStore.readForFallback(maxChars) 或 exportForIndex 摘要 cap
  → 缓存为 session 级 turnMemoryIndex（本 session 内复用）
  → ❌ 不跑 QueryIntent / helper LLM / sidecar episodic query

before_agent_start（子 session 每一轮）
  → 仅附加已缓存的 MEMORY cap（若有）
  → ❌ 不跑 runMemoryPreflight（episodic）

例外（可选，非 MVP）：子 session **首条** prompt 命中关系/记忆 cue（regex gate，无 helper LLM）→ 允许一次轻量 sidecar query；仍不跑 helper intent。
```

**理由：**

- 子 agent 输入多为父 agent 派发的**窄任务 prompt**，不是用户自由问答；全量 Preflight 成本高、收益低。
- 父 root session 的用户消息通常**已跑过** Preflight；子 session 重复查同一条 episodic 记忆冗余。
- 子 agent 仍需要**项目约定 / 偏好**（MEMORY cap）以遵守 Conventions；静态 cap 在 `session_start` 一次即可。

**Pi 事件映射（实现参考）：**

| 事件 | Root | Subagent |
|------|------|----------|
| `session_start` | 初始化 service、helper、索引 | 同上 + **预加载 MEMORY cap 到 session 缓存** |
| `before_agent_start` | `runMemoryPreflight` + cap | **仅**附加 cap；跳过 episodic |
| `context` | 注入 `<private_memory>`；**复用** `turnPreflight` | 同左（来源仅为 cap） |
| `agent_start` | （无特殊处理） | 同左 |

注入语义不变：`<private_memory>` 仍只存在于 in-flight user message；**不**写入 session JSONL；compaction 输入仍剥离。

#### 写路径：已有 subagent 策略（保持不变）

写路径**已**区分 parent/child，实现时与读路径判断共用同一 `isSubagentSession`：

| 项 | Subagent 行为 |
|----|---------------|
| `session_shutdown` enqueue | 记录 `parent_session_id` / `parent_session_file` |
| Stage1 提取 | **delta only**（相对 parent 的新增 turns） |
| Clone session（与 parent 无 delta） | **skip**，不入库 |
| Consolidate 触发 | 与 root 相同（OR 条件）；不因 subagent 单独放宽 |

子 session **不**因「跳过 Preflight」而跳过 compact → Memory Export 异步入库；若子 session 产生新的 durable 事实，仍走 `session_compact` queue（delta 提取避免重复写 parent 已提炼内容）。

#### 与 Codex / Kocoro 对照

| | Codex | Kocoro | 本方案（Pi） |
|--|-------|--------|--------------|
| Sub-agent 记忆写入 | ❌ 不触发 Phase 1/2 | 未明确文档化 | ✅ delta 提取 + skip clone |
| Sub-agent 记忆读取 | 未单独文档化 | 未单独文档化 | ✅ cap only；跳过 episodic Preflight |

---

## 5. Sidecar 实现要点

### 5.1 本质

Sidecar = **检索服务进程**（RAG 的 R）；Augment = Preflight 注入；Generate = 主模型。

### 5.2 sqlite-vec 与 pi-session-search

**`memory.db`（Sidecar 专用）**

- 仅 **sqlite-vec** 向量表 + 可选 **`memory_jobs`** 队列表（与 vec 同库或分文件均可）。
- Sidecar **write** = reindex upsert；**query** = embed + ANN + MMR。
- embedding 模型变更 → **全量 reindex**。
- **不含** Kocoro 式 `sessions_fts`；session 全文搜索 **不**在此库维护。

**pi-session-search（Pi 扩展，独立索引）**

- 索引 Pi session JSONL（常见路径 `~/.pi/session-search/index/`）。
- 提供 `session_search` 等 **Agent 工具**；FTS5 / hybrid 由扩展自行维护。
- 与本方案 **并行存在**，不重复建索引、不接入 Preflight Fallback。

### 5.3 进程与 UDS

| 项 | 说明 |
|----|------|
| 启动 | `spawn(process.execPath, [sidecarEntry, --socket, --db])` |
| 生命周期 | `execa`：`cleanup`、`forceKillAfterDelay: 5s` |
| 协议 | 一行一 JSON + `\n`；`request_id` 关联 |
| 就绪 | poll `ping`/`pong`，超时 fail → Fallback |
| npm | `execa`、`ndjson`；不必 `node-ipc` / zeromq |

### 5.4 跨平台抽象

```typescript
// platform-paths.ts（示意）
paths.socket(app)      // ~/.{app}/memory.sock
paths.agentDir(app, agent)
paths.memoryDb(app, agent)
secureSocketPath(sock) // chmod 600 @ unix only
```

| | macOS | Windows 11 |
|--|-------|------------|
| UDS | ✅ | ✅ AF_UNIX |
| proper-lockfile | ✅ | ✅ |
| sqlite-vec native | 分平台 prebuild | 分平台 prebuild |

---

## 6. MemoryStore 完整设计

外界 **只** 依赖 `MemoryStore` 接口；`MarkdownMemoryBackend` 私有化 flock、150 行 overflow、`auto-*.md`、`.memory_gc`。

### 6.1 MEMORY.md 语义

- **跨 session 便签**（偏好 / 约定 / 结论 / TODO），非活动流水账。
- 模板四段：`## Preferences | Conventions | Findings | Todos`。
- 150 行硬上限；溢出指针 + `auto-*.md`。

### 6.2 接口

```typescript
interface MemoryStore {
  // 生命周期
  ensureInitialized(): Promise<void>;
  isEmpty(): Promise<boolean>;
  getStats(): Promise<MemoryStats>; // lineCount, overflowFileCount, lastConsolidatedAt, …

  // 读
  readRaw(): Promise<string>;
  listEntries(): Promise<ParsedEntry[]>;       // 含 stable id
  readResolved(): Promise<ResolvedMemory>;     // MEMORY + 展开 overflow
  readForFallback(maxChars?: number): Promise<string>; // Preflight Fallback；默认有 char 上限，非 readRaw 全文
  exportForIndex(): Promise<IndexDocument[]>;   // Sidecar reindex 输入

  // 写（增量）
  append(entry: MemoryEntry): Promise<void>;
  appendUser(entry: Omit<MemoryEntry, "userAuthored">): Promise<void>;
  appendMany(entries: MemoryEntry[], opts?: { mode: "ifAbsent" }): Promise<void>;
  appendIfAbsent(entry: MemoryEntry): Promise<boolean>;

  // 写（条目维护）
  updateEntry(id: string, patch: Partial<MemoryEntry>): Promise<void>;
  removeEntry(id: string, opts?: { force?: boolean }): Promise<void>;

  // 写（整文件 — 仅 Consolidate）
  rewrite(content: string): Promise<void>;

  // 整理
  shouldConsolidate(now?: Date, cronFired?: boolean): Promise<boolean>;
  consolidate(llm: LlmClient): Promise<void>;
  forceConsolidate(llm: LlmClient): Promise<void>;

  // compact 幂等
  hasProcessedCompaction(compactionId: string): Promise<boolean>;
  markCompactionProcessed(compactionId: string): Promise<void>;

  //  integrity
  verifyIntegrity(): Promise<IntegrityReport>;

  // Sidecar 联动
  onSyncToSidecar(listener: () => void): () => void;
  onConsolidateCheck(listener: () => void): () => void;
}
```

**规则：**

- 日常增量 **只** 走 `append*`；**仅** Consolidate 走 `rewriteEntriesUnlocked`。
- `append` / `rewrite` 成功后 emit `onSyncToSidecar` → debounced `sidecar.reindex`；append 另 emit `onConsolidateCheck`（consolidate 进行中跳过，避免循环）。
- Consolidate 与 append 互斥：`proper-lockfile` on `MEMORY.md`。

### 6.3 目录布局

```
~/.{app}/agents/{agentName}/
├── MEMORY.md
├── auto-YYYY-MM-DD-<hex>.md
├── .memory_gc
└── memory.vec.sqlite      # Sidecar 向量索引（派生）
```

**pi-session-search** 索引路径由扩展自管（通常 `~/.pi/session-search/`），**不在** agent 目录下与 `memory.db` 合并。

---

## 7. Compact 异步入库（appendFromCompaction）

```typescript
// session_compact → fire-and-forget（非阻塞）
store.appendFromCompaction({
  compactionId,
  summary,
  subagent: isSubagentSession(ctx), // delta filter + skip clone
});
```

- **Subagent**：`filterCompactionDelta` 相对现有 MEMORY 去重；无 delta 则 skip（clone session）。
- **幂等**：`compactionId` + `hasProcessedCompaction`。
- **Fallback parse**（LLM JSON facts）：Backlog，MVP 未实现。

---

## 8. 与 Kocoro 文档的差异

| Kocoro 文档 | 本方案 |
|-------------|--------|
| PersistLearnings compact **前**同步 | custom summary + **`session_compact` 异步入库** |
| tool / 自然语言 memory_append | **`/remember`** |
| Sidecar `tlm` + bundle pull | **sqlite-vec** + 本地 reindex |
| Session Search FTS5（daemon 内置） | **pi-session-search** 扩展；**不在 memory.db 重复建** |
| Preflight Fallback 四层 | **Sidecar → MEMORY.md → 空注入**（无 session FTS 层） |
| Consolidate ≥12 **且** ≥7 天 | **OR** + daily 03:00 |
| QueryIntent prompt + json.Unmarshal | **Zod + 1 retry**（可选 generateObject） |
| Subagent Preflight | 未区分 | **§4.3**：root 每轮全链路；subagent cap only + 写路径 delta |
| 审计 JSONL | 暂不实现 |

---

## 9. 实现顺序

1. `platform-paths` + `MemoryStore` / `MarkdownMemoryBackend`
2. Sidecar：`uds-server` + sqlite-vec + `query` / `reindex`
3. `SidecarManager`（spawn、ping、shutdown）
4. Preflight + Fallback
5. Pi extension：`session_before_compact` + `session_compact` + `appendFromCompaction`
6. `/remember`
7. Consolidate：`24h interval` + OS cron CLI + `onSyncToSidecar` / `onConsolidateCheck`

---

## 10. 一句话

> **MEMORY.md 是源；Sidecar 是 sqlite-vec 检索进程；Preflight 读；写走 /remember、compact Memory Export（异步）、consolidate；compact 一次 LLM 兼顾续聊与 Export；MemoryStore 统一抽象；重活后台、失败静默降级。**

---

## 11. Backlog（后续优化，非设计目标）

> **与 §1 目标分离**：本节仅为讨论记录，**不是 MVP 承诺**，也不写入 §9 实现顺序。  
> MVP 按 §1～§10 验收；Backlog 在 MVP 跑通后，用 p99 latency / recall 抽样再择优实现。

### P0 — Preflight 延迟（首 token 感知最强）

| 项 | 说明 |
|----|------|
| **压缩总预算** | `PREFLIGHT_BUDGET_MS=500～800`（MVP 基线）；超时 → 空注入，不阻断主模型 |
| **分段 deadline** | intent cap ~200ms；sidecar 拿剩余时间（~300~600ms）；共享 `deadline` 避免串行拖满 |
| **QueryIntent 按需** | 短句、slash、无「之前/上次/记得」等 → **跳过 intent**，直接 `raw_query` 检索 |
| **retry 改为 0** | MVP 为最多 1 次 retry（§4）；优化项可改为 **0 retry**，失败即 `raw_query` |
| **条件跳过 Preflight** | `MemoryStore.isEmpty()`、首条且无 session 索引、纯 `/command` → 跳过整段 Preflight |

### P0 — Sidecar query 缓存

| 项 | 说明 |
|----|------|
| **缓存内容** | `normalize(query) + agentId` → `MemoryEntry[]`（或已格式化的 private_memory 块） |
| **命中收益** | 跳过 embed + sqlite-vec + MMR；重复 query 可 \<5ms |
| **主失效** | `indexGeneration`：`reindex` 完成 / `rewrite` 后 `bumpGeneration()` → 清空该 agent 缓存 |
| **辅失效** | Consolidate 完成后 clear（兜底）；可选当日 TTL（23:59 或 24h rolling） |
| **注意** | append / compact 入库后 **不必等 consolidate** 即应失效；**不能只绑 daily consolidate** |
| **空结果** | 可缓存但 **短 TTL**（如 60s），避免反复 embed 仍空 |
| **上限** | 进程内 LRU（如 500～1000 条）；按 agent 隔离；**不持久化**、不写 session |

```typescript
// 示意：缓存与索引代数绑定
type QueryCacheEntry = {
  results: MemoryEntry[];
  cachedAt: number;
  indexGeneration: number;
};
// reindex 完成 → gen++ → map.clear() 或删 agent 前缀
```

### P1 — 检索与索引效率

| 项 | 说明 |
|----|------|
| **增量 reindex** | 按 `exportForIndex` 条目/chunk **upsert**，避免每次全量 rebuild |
| **debounce 调参** | `onDirty` 合并 burst append（如 2～5s）；compact worker 批量入库后再触发一次 reindex |
| **按长度 chunk** | MEMORY 短条目（如 \<8000 chars）**不 chunk**；长 overflow / session 再 `ChunkText` |
| **reindex 与 query 分离** | Sidecar 内 reindex 队列低优先级；query 不被 embed batch 阻塞 |
| **Warm start** | daemon 启动 spawn Sidecar 后 **预 ping + 可选预热** vec 连接，避免首条消息冷启动 |

### P1 — Embedding

| 项 | 说明 |
|----|------|
| **本地 embed（可选）** | Sidecar 内嵌本地小模型（transformers.js / ollama 等）→ 降 Preflight 中 embed API 延迟 |
| **batch embed** | reindex 时 N chunk **一次** API（对齐 Kocoro `BatchEmbed`） |
| **模型版本字段** | `memory.db` 存 embedding 模型 id；变更 → 标记全量 reindex |

### P1 — Preflight 策略进阶

| 项 | 说明 |
|----|------|
| **并行 raw + intent** | `Promise` 同时 `sidecar.query(userInput)` 与 extractIntent；intent 成功且 query 更优再补搜（可选） |
| **缓存 intent** | 同 session 相同 userInput hash → 复用 QueryIntent（收益小于 sidecar cache） |

### P2 — 质量与可观测性

| 项 | 说明 |
|----|------|
| **λ / pool 可调** | MMR λ=0.7、pool×3 为初值；按注入重复率 A/B |
| **Preflight 分段 metrics** | log：`intent_ms` / `embed_ms` / `vec_ms` / `mmr_ms` / `cache_hit`（Debug，无 content） |
| **Fallback 字符上限** | MVP：`readForFallback(maxChars)` 默认上限（如 4k～8k chars）；见 §4 |
| **Consolidate 后 recall 抽检** | 合并后抽样 query 对比 top-K 是否丢关键 `[user]` 条目 |

### 明确不做（除非有数据支撑）

| 项 | 原因 |
|----|------|
| **语义相似 query 缓存** | embedding 近邻作 cache key 易误命中；v1 仅 normalized exact match |
| **Reflect / ToT QueryIntent** | 与低延迟 Preflight 目标冲突 |
| **tlm / bundle** | 本地 sqlite-vec + reindex 已覆盖；不引入 Cloud bundle |
| **PM2** | Sidecar / cron 用 spawn + node-cron / launchd 即可 |

### Backlog 内建议优先级（不影响 §9）

1. Sidecar query cache + `indexGeneration` 失效  
2. Preflight 预算压缩 + skip intent + retry 0  
3. 增量 reindex + debounce 调参  
4. 本地 embed（若 embed API 仍是 p99 瓶颈）  
5. metrics + λ 调参  

---

## 附录 A：UDS 与 Pi 类型

```typescript
type MemoryFrame =
  | { type: "ping" }
  | { type: "pong" }
  | { type: "query"; request_id: string; query: string }
  | { type: "result"; request_id: string; results: MemoryEntry[] }
  | { type: "error"; request_id?: string; error: string };

type MemoryEntry = {
  content: string;
  relevance: number;
  timestamp: string;
  source: string;
};

interface SessionCompactEvent {
  type: "session_compact";
  compactionEntry: CompactionEntry;
  reason: "manual" | "threshold" | "overflow";
  willRetry: boolean;
}
```

## 附录 B：Consolidate 触发逻辑

```typescript
function shouldConsolidate(stats: MemoryStats, cronFired: boolean): boolean {
  return (
    stats.overflowFileCount >= 12 ||
    daysSince(stats.lastConsolidatedAt) >= 7 ||
    cronFired // daily 03:00 job 传入 true
  );
}
```

## 附录 C：embedding 与 MMR

- Embedding：与选型一致（如 1536 维）；Sidecar 与 reindex 共用。
- MMR：候选 `K×3`，λ = 0.7，应用层实现（sqlite-vec 不内置 MMR）。
