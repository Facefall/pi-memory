# @chendpoc/pi-memory 路线图

<p align="center">
  <a href="ROADMAP.md">English</a> |
  <a href="ROADMAP-zh.md">简体中文</a>
</p>

这是 `@chendpoc/pi-memory` 的公开产品路线图。它聚焦用户可感知的结果，不链接未随 npm 包发布的内部 `dev-doc/` 设计笔记。

## 版本规划

| 版本 | 主题 | 用户可感知结果 |
| --- | --- | --- |
| **0.3.x** | 信任与安全 | 记忆写入更安全、有边界，也更容易诊断。 |
| **0.4.x** | 召回质量 | Pi 在 Preflight 预算内更常召回正确记忆。 |
| **0.5.x** | 记忆生命周期 | 用户能审查、淘汰、纠正长期记忆，减少手动清理。 |
| **0.6.x** | 可观测 + 控制面 | 用户能检查、排障、编辑、审查，并在本地迁移 Pi 记忆。 |
| **0.7.x** | 可选同步 | 在不强制上云的前提下，支持多 agent / 多设备协同记忆。 |

进入 **0.7** 之前，必须先完成三件事：debug/trace、memory edit/review、本地 import/export。Cloud 或多 agent 同步应保持可选，并默认 local-first。

## 产品原则

- `MEMORY.md` 继续作为可编辑的 Ground Truth。
- derived index、sidecar、trace、未来 sync state 都必须能从本地记忆工件重建。
- 召回应改善普通 agent 行为，但不能给每轮对话加入多秒级反思。
- 安全能力对记忆写入应 fail closed；对 agent 回答应 fail open。
- `pi-memory` 不应变成完整 transcript search 产品；旧会话搜索应由专门的 session-search 包负责。

## 当前基础

- 带 overflow 的 `MEMORY.md` Ground Truth。
- `/remember` 和 `/memory-status`。
- 基于 UDS JSONL 的 sidecar。
- `memory.vec.sqlite` 向量索引。
- QueryIntent + raw-query fallback。
- 800ms 共享 Preflight 预算，sidecar query 支持 AbortSignal 取消。
- sidecar warm、intent cache、query cache。
- dual-purpose compaction summary。
- Shutdown Queue + `maintenance`。
- Consolidate + reindex。
- Subagent Memory Cap + Compact Delta。
- Ground Truth 写入前 secret 脱敏。
- `MemoryRuntime` 扩展生命周期与重构后的 store/sidecar 模块。

## P0：信任与安全

**目标版本：0.3.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/1)

用户目标：记忆能力足够安全，可以默认开启。

- ✅ durable memory 写入前做 secret/token redaction — **0.3.0 已交付**。
- ✅ 拆小并澄清 store、ingest、status、lifecycle、sidecar 等运行模块 — **0.3.0 已交付**。
- 为 LLM 生成的 Memory Export 增加 prompt-injection guardrails。
- 针对用户明确纠正做 correction detector，优先限定在 `/remember` 链路。
- 为跳过写入和 fallback 决策提供轻量 reason code；完整 trace UX 放在 **0.6**。

## P1：召回质量

**目标版本：0.4.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/2)

用户目标：Pi 更常召回正确的稳定事实，同时保持交互轮次足够快。

- 对 `MEMORY.md` 条目做 lexical + vector 混合召回：SQLite FTS5 + 现有 vector chunks，RRF merge 后再 MMR。
- 为常见 coding-agent 问题建立 recall eval fixtures。
- debug metrics 拆分 intent、embed、scan、MMR、render、fallback、总 Preflight 时间。
- 改进 Ollama 之外的 embedding provider，在可行时支持免费/开源 embedding API。
- sidecar 检索优化：增量 reindex、batch embed、更清晰的 reindex/query 隔离。
- 只有在延迟预算允许时，才在 MMR 后加入可选 reranker。

## P2：记忆生命周期

**目标版本：0.5.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/3)

用户目标：长期记忆保持有用，而不是变成不断增长的过期事实堆。

- 增加 failure 和 tool-quirk 类别。
- 晋升前提供人类可审查的 memory draft 或 diary。
- 基于使用信号的晋升和裁剪。
- rewrite 前提供更安全的 consolidate preview。
- 显式处理 stale / superseded fact，而不是只做简单 TODO 清理。
- lifecycle 事件进入共享 debug/trace event schema；面向用户的 trace surface 在 **0.6** 交付。

## P3：可观测 + 控制面

**目标版本：0.6.x** · [GitHub milestone](https://github.com/chendpoc/pi-memory/milestone/4)

用户目标：当记忆行为不符合预期时，用户能看懂原因并修正，而不必阅读底层内部状态。

必须完成的出口标准：

- 本地 trace ring buffer，例如 `logs/trace.jsonl`，包含稳定 event name 和 reason code。
- `pi-memory status --verbose` 与 `/memory-status` 能总结最近 skip、fallback、write、reindex、recall 事件。
- memory edit/review 命令，并配合 **0.5** 的 stale/supersede 语义。
- 不同 Pi 安装之间的本地 import/export，并提供 dry-run，为未来 sync 做准备。

0.6 可选 backlog：

- 更好的 TUI status panel。
- 常见 Pi 配置的文档 recipes。
- 剩余 sidecar tuning，例如并行 raw+intent recall、MMR lambda 调参、consolidate 后 recall 抽检，由 p99 延迟和 eval 数据驱动。

## P4：可选同步

**目标版本：0.7.x**

用户目标：跨多个 Pi agent 或设备工作时，可以协同记忆，但不放弃本地控制权。

- 多 agent 跨 session 记忆协同。
- 可选 cloud Pi agent <-> local Pi agent session-memory sync。
- `MEMORY.md` 仍是 source of truth；vector index 在各设备本地 rebuild。
- 默认不自动上传。
- sync 设计必须先定义冲突处理、trust boundary、redaction guarantee、rollback，再进入实现。
- 前置条件：injection + redaction 闭环、stale/edit 语义、本地 import/export、debug/trace 能排障跨进程写入。
