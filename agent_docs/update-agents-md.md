# Update AGENTS.md

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
- Identify any instructions that conflict with each other. For each contradiction, ask which version user want to keep.

### 2. Create Progressive Disclosure Files

- A minimal root AGENTS.md with markdown links to the separate files
- Each separate file with its relevant instructions
- Create `agent_docs/` with task-specific docs
- Organize instructions into logical categories

Each file should use `file:line` references to authoritative code, not copies.

### 3. Update AGENTS.md

Keep only universally applicable content:

- Project overview (WHY/WHAT): One-sentence project description
- Setup-specific config (e.g., context-mode)
- Progressive disclosure pointers
- Verification commands: Non-standard build/typecheck commands
- Anything truly relevant to every single task

Target: <60 lines

### 4. Validate

- Ensure references are valid paths
- Identify any instructions that are:
  - Redundant (the agent already knows this)
  - Too vague to be actionable
  - Overly obvious (like "write clean code")

## Monorepo

- You can place AGENTS.md files in subdirectories

| Level   | Content                                                                    |
| ------- | -------------------------------------------------------------------------- |
| Root    | Monorepo purpose, how to navigate packages, shared tools (pnpm workspaces) |
| Package | Package purpose, specific tech stack, package-specific conventions         |

## Principles

1. **Less is more**
2. **Universally applicable** — AGENTS.md goes into every session
3. **Use references, not copies** — Code snippets rot; `file:line` refs stay valid
4. **LLM ≠ linter** — Trust Prettier/ESLint, don't teach style to agent
5. **Progressive disclosure** — Agent reads relevant docs only when needed
