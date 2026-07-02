# @chendpoc/pi-memory

Pi Agent 本地情景记忆（**模式 B**）— TLM sidecar + `memory_recall` 工具 + **隐式 episodic preflight**。

与 [Kocoro](https://github.com/Kocoro-lab/Kocoro) 的 TLM 协议对齐：`QueryIntent` → Unix socket `POST /query` → `ResponseEnvelope`。

## 前置条件

1. **安装 `tlm` sidecar**（与 Kocoro 相同，建议 v0.6.x+）并加入 `PATH`，或配置 `tlmPath` 绝对路径。
2. **准备本地 bundle**（自行训练或从测试环境拷贝）：

```text
~/.pi/memory/
├── current  →  bundles/2026-06-01T00-00-00Z   # symlink
└── bundles/
    └── 2026-06-01T00-00-00Z/
        ├── manifest.json
        └── …
```

`current` 目录下必须有可解析的 `manifest.json`（与 Kocoro `currentBundleReadable` 一致）。

3. （可选）`~/.pi/MEMORY.md` — sidecar 不可用时的 fallback 关键词匹配；`~/.pi/sessions/*.json` — session 关键词 fallback。

## 安装

### 作为 Pi package（推荐）

本地开发（settings 相对路径）：

```json
{
  "packages": ["./extensions/pi-memory"]
}
```

或发布后：

```bash
pi install npm:@chendpoc/pi-memory
```

`package.json` 中已声明 `pi.extensions`，Pi 会自动加载 `src/pi-extension.ts`。

### 构建 CLI / 库

```bash
cd agent/extensions/pi-memory
npm install
npm run build
```

## CLI 手动测试

```bash
# 检查 sidecar 健康（会尝试 spawn tlm）
npx pi-memory health

# 结构化查询
npx pi-memory query '{"mode":"direct_relation","anchor_mentions":["Alice"]}'

# 安装本地 bundle（staging → bundles/<ts> → current symlink，sidecar 在跑时会 /bundle/reload）
npx pi-memory install-bundle ./path/to/bundle-dir
```

## 在 Pi Agent 中启用

本包已对接 `@earendil-works/pi-coding-agent` 的 `ExtensionAPI`：

| 旧 stub API | Pi 真实 API |
|-------------|-------------|
| factory 内 `service.start()` | `session_start` |
| `onUnload` | `session_shutdown` |
| `registerTool` | `pi.registerTool`（TypeBox 参数） |
| `onBeforeTurn` | `context` 事件（LLM 调用前注入，不写入 session） |

扩展加载后：

1. **`session_start`** — `MemoryService.start()` spawn `tlm serve`
2. 注册 **`memory_recall`** 工具（sidecar 不可用时 fallback 到 session JSON + MEMORY.md）
3. 注册 **`memory_append`** 工具（追加 `~/.pi/MEMORY.md`）
4. **`context` 事件** — 隐式 preflight，注入 `<private_memory>` 到当次 LLM 请求的 messages 副本

Helper 小模型通过 `@earendil-works/pi-ai/compat` 的 `complete()` 调用，默认 `deepseek/deepseek-v4-flash`：

```bash
pi --memory-helper-model deepseek/deepseek-v4-flash
```

### Pi 命令

- `/memory` — 显示 sidecar 状态、reason 与 health 摘要

也可程序化 import：

```typescript
import piMemory from "@chendpoc/pi-memory/extension";
export default piMemory;
```

**持久化：** `context` 事件修改的是 messages 深拷贝，`<private_memory>` 不会写入 session JSON，无需额外 `stripPrivateMemory`。

## 隐式 Episodic Preflight

在每轮 LLM 调用**之前**，通过 `context` 事件检测是否需要召回私人情景记忆，并将结果注入 `<private_memory>` 块。

### 工作流程

1. **Intent 检测** — 中/英/日关系问句正则快路径；可选 `MemoryHelperLLM`（`compile_memory_intents` forced tool_use，由 `complete()` 驱动）。
2. **批量查询** — 对最多 3 个 intent 并发调用 sidecar，`2s` 超时，失败静默跳过。
3. **渲染** — 组装 `<private_memory>` 正文，**8192 字节**上限。
4. **注入** — 通过 `context` 事件写回最后一条 user message。

### Helper LLM（Pi 集成）

```typescript
import { resolveMemoryHelperLLM } from "@chendpoc/pi-memory";

// 在 extension 的 context handler 中：
const helper = await resolveMemoryHelperLLM(ctx, pi.getFlag("memory-helper-model"));
```

`helper` 为 `null` 时仅走正则快路径（fail-silent）。

## 架构

| 模块 | 作用 |
|------|------|
| `src/pi-extension.ts` | Pi ExtensionAPI 入口 |
| `src/adapters/piComplete.ts` | `complete()` 适配（helper + trainer LLM） |
| `SidecarProcess` | spawn / waitReady / stop |
| `SidecarClient` | `/health`, `/query`, `/bundle/reload` |
| `MemoryService` | 本地模式生命周期 + query / queryBatch |
| `MemoryRecallTool` | Agent 工具 + session/MEMORY.md fallback |
| `memory_append` | 追加 MEMORY.md |
| `preflight/*` | 隐式 preflight detect → query → render → inject/strip |
| `bundle/install` | `install-bundle` CLI |

## LLM 深度提取（Trainer）

使用 `@earendil-works/pi-ai/compat` 的 `complete()`，不绑定具体 LLM 厂商：

```typescript
import { createLLMFactExtractor, createStandaloneLLMClient, trainBundle } from "@chendpoc/pi-memory";

const extractor = createLLMFactExtractor({
  client: createStandaloneLLMClient("deepseek/deepseek-v4-flash"),
  batchSize: 10,
});
```

CLI：

```bash
pi-memory train --extractor llm
pi-memory train --extractor llm --model deepseek/deepseek-v4-flash
pi-memory train --extractor regex
```

需配置对应 provider 的环境变量（如 `DEEPSEEK_API_KEY`）。LLM 不可用时 CLI 自动回退 regex。

## peerDependencies

Pi 核心包由 host 提供，列在 `peerDependencies` 中，勿 bundle：

- `@earendil-works/pi-ai`
- `@earendil-works/pi-coding-agent`
- `typebox`

## 开发

```bash
npm test
npm run typecheck
npm run build
```

## 许可

MIT
