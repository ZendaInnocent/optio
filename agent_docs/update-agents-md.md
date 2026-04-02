# Slash Command: Update AGENTS.md

## Purpose

Refresh `AGENTS.md` and related docs following [humanlayer guide](https://www.humanlayer.dev/blog/writing-a-good-claude-md).

## When to Use

- Project structure changes significantly
- New packages/apps added to monorepo
- Tech stack changes
- Context-mode setup changes

## Process

### 1. Analyze Current State

- Count lines in current `AGENTS.md` (target: <60, max <100)
- Identify code snippets that should be `file:line` refs
- Identify task-specific info that should be in separate files

### 2. Create Progressive Disclosure Files

Create `agent_docs/` with task-specific docs:

```
agent_docs/
├── build-commands.md      # pnpm commands, test runners
├── code-conventions.md    # naming, imports, errors, testing
├── database-schema.md     # DB schemas, state machine
├── service-architecture.md # (optional) for backend work
├── frontend-components.md # (optional) for frontend work
```

Each file should use `file:line` references to authoritative code, not copies.

### 3. Update AGENTS.md

Keep only universally applicable content:

- Project overview (WHY/WHAT)
- Setup-specific config (e.g., context-mode)
- Progressive disclosure pointers
- Verification commands

Target: <60 lines

### 4. Validate

- Run `pnpm lint` and `pnpm typecheck`
- Ensure references are valid paths

## Principles (from Guide)

1. **Less is more** — Frontier LLMs follow ~150-200 instructions reliably
2. **Universally applicable** — AGENTS.md goes into every session
3. **Use references, not copies** — Code snippets rot; `file:line` refs stay valid
4. **LLM ≠ linter** — Trust Prettier/ESLint, don't teach style to agent
5. **Progressive disclosure** — Agent reads relevant docs only when needed
