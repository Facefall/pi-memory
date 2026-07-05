# @chendpoc/pi-memory Launch Kit

This document is copy-ready material for sharing `@chendpoc/pi-memory`.
Before each launch, re-check the package version and public links.

## Public Links

- GitHub: https://github.com/chendpoc/pi-memory
- npm: https://www.npmjs.com/package/@chendpoc/pi-memory
- Pi package page: https://pi.dev/packages/@chendpoc/pi-memory
- Install command:

```bash
pi install npm:@chendpoc/pi-memory
```

## Positioning

One-liner:

> Local-first Markdown memory for the Pi coding agent: remember preferences, project conventions, decisions, and todos across sessions without making a hosted database the source of truth.

Short pitch:

> `pi-memory` gives Pi cross-session memory that stays local and inspectable. It writes durable facts to `MEMORY.md`, recalls relevant entries before Pi answers, redacts common secrets before saving, and degrades gracefully when recall is unavailable.

Longer pitch:

> Pi compaction helps a long conversation continue, but it does not make future sessions remember stable preferences, project rules, prior decisions, or unresolved todos. `pi-memory` fills that gap with a local-first loop: explicit `/remember` notes, durable memory export from compaction and shutdown maintenance, `MEMORY.md` as the editable ground truth, and bounded pre-answer recall through a sidecar-derived index.

## Proof Points

Lead with behavior, not architecture:

- A new Pi session can answer from previously saved preferences instead of asking the user to repeat context.
- `/remember` writes user-authored entries that consolidation must preserve.
- `MEMORY.md` remains editable, greppable, copyable, and versionable.
- Common secrets are redacted before durable memory writes.
- Recall has a bounded preflight budget and falls back instead of blocking the agent turn.
- Maintenance runs outside ordinary interactive turns.

## Two-Minute Demo

Use a fresh memory directory for recording so the demo does not expose personal memory:

```bash
export PI_MEMORY_AGENT_DIR="$(mktemp -d)"
pi install npm:@chendpoc/pi-memory
```

In Pi:

```text
/remember Preferences Prefer pnpm over npm in JavaScript projects.
/remember Conventions Public docs should be English-first, with Chinese docs under doc/.
/memory-status expand
```

Show the ground-truth file:

```bash
cat "$PI_MEMORY_AGENT_DIR/MEMORY.md"
```

Start a new Pi session and ask:

```text
For this package, which package manager should I use, and where should Chinese docs live?
```

The expected story is not "magic memory". The expected story is:

1. The user explicitly saved stable preferences.
2. The memory is visible in Markdown.
3. A later session can use it before answering.
4. If recall is unavailable, Pi still answers without memory injection.

## Demo Asset Checklist

The launch posts should link to the repo, but the repo alone is not enough for cold readers. Prepare one short visual proof before posting outside the Pi community.

Recommended asset:

- Length: 30-60 seconds.
- Format: GIF or short MP4.
- First frame: package name, install command, and the phrase "local Markdown memory for Pi".
- Main sequence: `/remember` -> `MEMORY.md` -> new Pi session -> recalled answer -> `/memory-status`.
- Final frame: GitHub URL and `pi install npm:@chendpoc/pi-memory`.

Recording script:

```text
1. Open a clean terminal with PI_MEMORY_AGENT_DIR pointing at a temp directory.
2. Install or show the installed package.
3. In Pi, run two /remember commands.
4. Open MEMORY.md and show the exact saved bullets.
5. Start a new Pi session and ask a question that depends on those bullets.
6. Show /memory-status expand.
```

Do not record a personal `MEMORY.md`. Do not show real API keys, private repo names, or private session paths.

## Copy Blocks

### X / Bluesky

```text
I shipped @chendpoc/pi-memory: local-first Markdown memory for the Pi coding agent.

It keeps preferences, project conventions, decisions, and todos in MEMORY.md, recalls relevant entries before Pi answers, and redacts common secrets before saving.

Install:
pi install npm:@chendpoc/pi-memory

https://github.com/chendpoc/pi-memory
```

### Hacker News / Reddit

Title:

```text
Show HN: pi-memory - local Markdown memory for the Pi coding agent
```

Body:

```text
I built pi-memory because Pi compaction helps continue one long session, but I wanted future sessions to remember stable preferences, project conventions, decisions, and open todos.

The design is intentionally local and inspectable:

- MEMORY.md is the ground truth.
- /remember writes explicit user notes.
- compaction and shutdown maintenance can export durable facts.
- a sidecar builds a derived index for pre-answer recall.
- common secrets are redacted before durable memory writes.
- recall is best-effort, so the agent still runs if memory is slow or unavailable.

Install:
pi install npm:@chendpoc/pi-memory

GitHub:
https://github.com/chendpoc/pi-memory

npm:
https://www.npmjs.com/package/@chendpoc/pi-memory

I would especially like feedback on recall quality, memory review UX, and whether hybrid lexical + vector recall should be the next milestone.
```

### Pi Community

```text
I published @chendpoc/pi-memory for Pi.

It adds local cross-session memory: /remember, editable MEMORY.md ground truth, pre-answer recall, compaction/shutdown export, status diagnostics, and secret redaction before durable writes.

Install:
pi install npm:@chendpoc/pi-memory

Pi package page:
https://pi.dev/packages/@chendpoc/pi-memory

GitHub:
https://github.com/chendpoc/pi-memory

Feedback I am looking for: install friction, recall quality, and what memory review/edit commands should look like.
```

### Chinese Short Post

```text
我做了一个 Pi 插件 @chendpoc/pi-memory：给 Pi 加 local-first 跨会话记忆。

核心不是把聊天记录塞进数据库，而是把稳定偏好、项目约定、决策和 TODO 写进可编辑的 MEMORY.md；每次回答前尽量召回相关记忆；写入前会对常见 token/secret 做脱敏；召回失败也不会阻塞正常对话。

安装：
pi install npm:@chendpoc/pi-memory

GitHub:
https://github.com/chendpoc/pi-memory
```

## Launch Sequence

This material can improve conversion, but it will not create demand by itself. The highest-leverage launch path is narrow first, then broader technical audiences.

| Step | Channel | Goal | Success signal |
| --- | --- | --- | --- |
| 1 | GitHub repo metadata | Make the first click understandable | Description, topics, README, and demo asset all tell the same story |
| 2 | Pi community / Discord | Find install friction quickly | 3-5 people try `pi install npm:@chendpoc/pi-memory` |
| 3 | X / Bluesky | Lightweight awareness | Clicks, stars, replies asking what Pi memory does |
| 4 | Reddit / HN | Technical feedback | Comments about design tradeoffs, recall quality, local-first boundary |
| 5 | Technical article | Durable search traffic | People arrive via "Pi agent memory", "local agent memory", or "Markdown memory" searches |

Suggested order:

1. Update the GitHub repo description to the one-liner above.
2. Add one demo GIF/MP4 or screenshot to the README near the top.
3. Share in the Pi package/community channel first, because the install path is Pi-specific.
4. Fix install friction reported by early users before posting broadly.
5. Post the Show HN / Reddit version after the README and demo are stable.
6. Follow up with a technical post comparing local Markdown ground truth, sidecar-derived indexes, and hosted memory APIs.

Track these numbers for one week:

- npm downloads.
- GitHub stars / forks.
- Pi community installs or replies.
- Issues filed about install, recall quality, or memory review UX.
- Number of users who complete the two-minute demo.

## Do Not Claim

- Do not call it a full session search product.
- Do not imply it stores or indexes full chat transcripts as memory.
- Do not claim perfect privacy; the accurate claim is local-first memory files plus redaction before durable memory writes.
- Do not pitch it as a Mem0/Zep replacement; it is a Pi-native, Markdown-first memory loop.
- Do not promise multi-hop graph reasoning or autonomous memory editing before those features ship.
- Do not lead with future cloud sync; for the current product, lead with local-first Ground Truth and optional derived indexes.

## Feedback Questions

- Did install work with `pi install npm:@chendpoc/pi-memory`?
- Was `MEMORY.md` created where you expected?
- Did `/memory-status expand` explain the state clearly?
- Did recall retrieve the memory you expected in a new session?
- Would you rather edit memory through Markdown, commands, or a TUI review panel?
