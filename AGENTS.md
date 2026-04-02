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

## Agent System

### Running Agents

```bash
# List available prompts
pnpm agent:list

# View a prompt
pnpm agent:prompt do-work
pnpm agent:prompt do-work implement
pnpm agent:prompt plan analyze
pnpm agent:prompt review code-quality

# Run evals
pnpm eval:prompts              # All prompts (do-work + plan + review + context)
pnpm eval:prompts do-work      # Do-work only
pnpm eval:prompts plan         # Plan only
pnpm eval:prompts review       # Review only
pnpm eval:prompts context      # Context only
```

### API Endpoints

| Method | Endpoint                    | Description                    |
| ------ | --------------------------- | ------------------------------ |
| POST   | `/agents/run`               | Start a new agent run          |
| GET    | `/agents`                   | List all agent threads         |
| GET    | `/agents/:threadId`         | Get thread status              |
| GET    | `/agents/:threadId/history` | Get full event history         |
| POST   | `/agents/:threadId/pause`   | Pause a running thread         |
| POST   | `/agents/:threadId/resume`  | Resume a paused thread         |
| POST   | `/agents/:threadId/fork`    | Fork a thread at current state |
| POST   | `/agents/:threadId/context` | Build context for a thread     |

### Architecture

- **Prompts**: `.agents/prompts/` — Modular prompt files (do-work, plan, review)
- **Events**: `.agents/events/schema.json` — 18 event types for state machine
- **Handlers**: `apps/api/src/lib/agent/handlers/` — Event handlers (TypeScript)
- **Context**: `apps/api/src/lib/agent/context/` — Context management with safety filtering
- **Repository**: `apps/api/src/lib/agent/repository.ts` — DB operations for threads/events
- **Runner**: `apps/api/src/lib/agent/runner.ts` — Event loop executor

### Prompt System

All prompts are modular and testable:

| Prompt  | Files                                          | Tests         |
| ------- | ---------------------------------------------- | ------------- |
| do-work | `config.md`, `phases/*.md`, `anti-patterns.md` | 13 eval tests |
| plan    | `analyze.md`, `decompose.md`                   | 9 eval tests  |
| review  | `code-quality.md`                              | 8 eval tests  |
| context | `config.md`                                    | 8 eval tests  |

**Total: 38 eval tests, all passing.**

## Verification

Run `pnpm lint` and `pnpm typecheck` before committing. Don't manually fix lint/format issues — trust the tools.
