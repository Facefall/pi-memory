# pi-memory

Cross-session episodic memory for the [Pi coding agent](https://pi.dev): **MEMORY.md** as ground truth, a JSONL Sidecar for vector retrieval, and Preflight injection before each user turn.

## Architecture

| Layer | Role |
|-------|------|
| **Ground Truth** | `MEMORY.md` + `auto-*.md` overflow files |
| **Vector Index** | `memory.vec.sqlite` (derived; better-sqlite3 + cosine scan + MMR) |
| **Sidecar** | Separate Node process over UDS JSONL (`query`, `reindex`, `ping`) |
| **Preflight** | QueryIntent → Sidecar → Fallback to MEMORY.md → silent empty inject |

### Write paths

1. **`/remember`** — sync user-authored append
2. **Compaction** — dual-purpose summary → `appendFromCompaction` (Compact Delta for subagents)
3. **Consolidate** — OR trigger (overflow ≥12 / 7 days / daily 03:00 cron)

**Shutdown Queue** — `session_shutdown` appends metadata to `.memory_shutdown_queue.jsonl` (offline worker reserved).

## Setup

1. Install dependencies and build:

```bash
pnpm install
pnpm build
```

2. Enable as a Pi extension (see `package.json` → `pi.extensions`).

3. Optional: copy [`.env.example`](./.env.example) to `~/.pi/.env` and configure embedder / helper LLM.

## Environment

| Variable | Purpose |
|----------|---------|
| `PI_MEMORY_EMBEDDER` | `hash` \| `ollama` \| `openai` |
| `PI_MEMORY_HELPER_MODEL` | Helper LLM for QueryIntent + consolidate |
| `PI_MEMORY_PREFLIGHT_TIMEOUT_MS` | Preflight budget (default 800) |
| `PI_MEMORY_REINDEX_DEBOUNCE_MS` | Debounced reindex after writes |

See [`.env.example`](./.env.example) for full list.

## CLI

Daily consolidate via OS scheduler:

```bash
pi-memory consolidate --cron
pi-memory consolidate --force --verbose
```

Templates: [`templates/`](./templates/) (launchd, crontab, schtasks).

## Docs

- [sidecar-local-memory-design.md](./sidecar-local-memory-design.md) — full design
- [kocoro-memory-pi-agent-guide.md](./kocoro-memory-pi-agent-guide.md) — Kocoro → Pi translation
- [UBIQUITOUS_LANGUAGE.md](./UBIQUITOUS_LANGUAGE.md) — domain glossary

## License

MIT
