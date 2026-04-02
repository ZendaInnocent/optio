# AGENTS.md — Optio Agent Guidelines

## Project

Optio: workflow orchestration for AI coding agents. Spins up isolated Kubernetes pods per repo, manages git worktrees for concurrent tasks, streams logs to web UI.

**Tech Stack:**

- Monorepo: Turbo + pnpm workspaces
- API: Fastify + TypeScript + Drizzle ORM + Postgres + BullMQ
- Web: Next.js 15 + React 19 + Tailwind CSS + Zustand

## Context-Mode (MANDATORY)

This project uses context-mode MCP tools to protect context windows.

### BLOCKED

- **curl/wget**: Use `context_mode_ctx_fetch_and_index()` or `context_mode_ctx_execute()`
- **Inline HTTP**: Use sandbox execution
- **Direct web fetching**: Use `context_mode_ctx_fetch_and_index()`

### Tool Hierarchy

1. `context_mode_ctx_batch_execute()` — run commands + search in ONE call
2. `context_mode_ctx_search(queries)` — query indexed content
3. `context_mode_ctx_execute()` / `context_mode_ctx_execute_file()` — sandbox execution
4. `context_mode_ctx_fetch_and_index()` then search
5. `context_mode_ctx_index()` — store for later search

### Output Constraints

- Keep responses under 500 words
- Write artifacts to FILES — never return inline
- Use descriptive source labels when indexing

## Progressive Disclosure

Read these before working on related tasks:

- `agent_docs/build-commands.md` — All build/test/lint commands
- `agent_docs/code-conventions.md` — Naming, imports, errors, testing patterns
- `agent_docs/database-schema.md` — DB schemas, state machine, query patterns
- `agent_docs/agent-system-running.md` — Running agent commands and evaluations
- `agent_docs/agent-system-api.md` — Agent API endpoints
- `agent_docs/agent-system-architecture.md` — System architecture
- `agent_docs/agent-system-prompts.md` — Prompt system details

## Context-Efficient Execution (MANDATORY)

Use `scripts/run-silent.js` to run commands. This reduces context waste by:

- Success: Shows only `✓ description` (1 line)
- Failure: Shows full output (helps agent debug)

**Usage:**

```bash
node scripts/run-silent.js "description" "command"
```

**Examples:**

```bash
# Run lint with quiet output
node scripts/run-silent.js "lint" "pnpm lint"

# Run tests with vitest count
node scripts/run-silent.js "API tests" "pnpm --filter @optio/api test"

# Debug: see full output
VERBOSE=1 node scripts/run-silent.js "lint" "pnpm lint"
```

**Framework auto-detection**: vitest, pytest, jest, go test

## Verification

Run `pnpm lint` and `pnpm typecheck` before committing. Don't manually fix lint/format issues — trust the tools.

## Tilt Usage

- **NEVER run `tilt down`** — it deletes the PostgreSQL PVC and wipes all data (repos, sessions, etc.)
- Use `tilt up` to start or rebuild; Tilt live-updates in place
- To trigger a rebuild, use `tilt trigger <resource>` or edit the watched files
- To rebuild Docker images, use `docker build` directly — Tilt picks up the new image
