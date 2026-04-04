# AGENTS.md — Optio Agent Guidelines

## Project

Optio: workflow orchestration for AI coding agents. Spins up isolated K8s pods per repo, manages git worktrees for concurrent tasks, streams logs to web UI.

Always be extremely concise. Sacrifice grammar for the sake of concesion.

**Mandatory**: Read contract `.agent_docs/contact.md`.

## Context-Mode (MANDATORY)

This project uses context-mode MCP tools. See `agent_docs/context-mode.md` for details.

## Progressive Disclosure

Read before working on related tasks:

- `agent_docs/build-commands.md` — Build/test/lint commands
- `agent_docs/code-conventions.md` — Naming, imports, errors, testing
- `agent_docs/database-schema.md` — DB schemas, state machine
- `agent_docs/architecture.md` — System architecture

## Test-Driven Development

When implementing features or fixing bugs, follow TDD principles:

- `agent_docs/tdd.md` — Philosophy, workflow, vertical slices
- `agent_docs/tdd-tests.md` — Good vs bad tests, behavior vs implementation
- `agent_docs/tdd-mocking.md` — When to mock (boundaries only)
- `agent_docs/tdd-deep-modules.md` — Small interfaces, deep implementation
- `agent_docs/tdd-interface.md` — Designing for testability
- `agent_docs/tdd-refactoring.md` — Refactor candidates after green

**Key**: One test → one implementation → repeat. Tests verify behavior through public interfaces, not implementation details.

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
