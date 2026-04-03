# AGENTS.md — Optio Agent Guidelines

## Project

Optio: workflow orchestration for AI coding agents. Spins up isolated K8s pods per repo, manages git worktrees for concurrent tasks, streams logs to web UI.

## Context-Mode (MANDATORY)

This project uses context-mode MCP tools. See `agent_docs/context-mode.md` for details.

## Progressive Disclosure

Read before working on related tasks:

- `agent_docs/build-commands.md` — Build/test/lint commands
- `agent_docs/code-conventions.md` — Naming, imports, errors, testing
- `agent_docs/database-schema.md` — DB schemas, state machine
- `agent_docs/architecture.md` — System architecture

## Verification

Run before committing:

```bash
node scripts/run-silent.js "lint" "pnpm lint"
node scripts/run-silent.js "typecheck" "pnpm turbo typecheck"
```

## Tilt Usage

- **NEVER run `tilt down`** — deletes PostgreSQL PVC
- Use `tilt up` to start/rebuild
- Use `tilt trigger <resource>` to rebuild specific resources
- Use `docker build` directly for new images
