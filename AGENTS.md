# AGENTS.md — Agentic Coding Guidelines for Optio

This file provides context and conventions for AI assistants working on the Optio codebase.

## Project Overview

Optio is a workflow orchestration system for AI coding agents — "CI/CD where the build step is an AI agent." It spins up isolated Kubernetes pods per repository, manages git worktrees for concurrent tasks, and streams logs to a web UI.

**Tech Stack:**

- Monorepo: Turbo + pnpm workspaces
- API: Fastify + TypeScript + Drizzle ORM + Postgres + BullMQ
- Web: Next.js 15 + React 19 + Tailwind CSS + Zustand
- Tests: Vitest

---

# Build / Lint / Test Commands

## Root Commands (monorepo-wide)

| Command             | Description              |
| ------------------- | ------------------------ |
| `pnpm dev`          | Run all apps in dev mode |
| `pnpm dev:api`      | Run only API in dev mode |
| `pnpm dev:web`      | Run only Web in dev mode |
| `pnpm build`        | Build all packages/apps  |
| `pnpm lint`         | Run ESLint on all files  |
| `pnpm lint:fix`     | Auto-fix lint errors     |
| `pnpm typecheck`    | Type-check all packages  |
| `pnpm format`       | Format with Prettier     |
| `pnpm format:check` | Check formatting only    |

## Single Test Commands

Run tests in a specific package:

```bash
# API tests
cd apps/api && pnpm test
cd apps/api && pnpm test -- --watch      # watch mode
cd apps/api && pnpm test src/services/task-service.test.ts  # single file

# Web tests
cd apps/web && pnpm test
cd apps/web && pnpm test src/components/Header.test.tsx

# Shared package
cd packages/shared && pnpm test

# Run with coverage
cd apps/api && pnpm test:coverage
```

Vitest is used across all packages. Use `--watch` for TDD, `--coverage` for coverage report.

## Database

```bash
pnpm db:generate   # Generate Drizzle migrations
pnpm db:migrate    # Run pending migrations
```

---

# Code Style Guidelines

## TypeScript Configuration

- **Target**: ES2022
- **Module**: NodeNext
- **Strict mode**: enabled
- Use `.ts` extension for files, `.js` for ESM imports

## Formatting (Prettier)

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

Run `pnpm format` to format. Prettier runs automatically on commit via lint-staged.

## ESLint Rules

The project uses `typescript-eslint` with these rules:

- `@typescript-eslint/no-unused-vars`: warn (prefix unused with `_`)
- `no-console`: warn (allow `warn`, `error`)
- `prefer-const`: warn

Run `pnpm lint` to check. Auto-fix with `pnpm lint:fix`.

## Imports

- Use explicit `.js` extensions for local imports (ESM requirement)
- Group imports: external → workspace packages → local
- Use path aliases defined in tsconfig when available

```typescript
// External
import { z } from "zod";
import type { FastifyInstance } from "fastify";

// Workspace packages
import { TaskState } from "@optio/shared";

// Local
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
```

## Naming Conventions

| Type             | Convention       | Example                                   |
| ---------------- | ---------------- | ----------------------------------------- |
| Files            | kebab-case       | `task-service.ts`, `repo-pool-service.ts` |
| Types/Interfaces | PascalCase       | `TaskState`, `RepoConfig`                 |
| Functions        | camelCase        | `createTask()`, `transitionTask()`        |
| Constants        | UPPER_SNAKE_CASE | `MAX_RETRIES`, `DEFAULT_TIMEOUT`          |
| Database tables  | snake_case       | `tasks`, `repos`, `task_events`           |
| Environment vars | UPPER_SNAKE_CASE | `OPTIO_API_PORT`, `DATABASE_URL`          |

## Error Handling

- Use custom error classes for domain errors
- Include context in error messages
- Use Zod for input validation in routes
- Throw and let Fastify's error handler catch

```typescript
// Custom error example
export class StateRaceError extends Error {
  constructor(
    public attemptedFrom: TaskState,
    public attemptedTo: TaskState,
    public actualState?: TaskState,
  ) {
    super(`State transition from ${attemptedFrom} to ${attemptedTo} failed`);
    this.name = "StateRaceError";
  }
}

// Route validation with Zod
const createTaskSchema = z.object({
  title: z.string().min(1),
  repoId: z.string().uuid(),
  priority: z.number().int().min(1).default(5),
});
```

## Database (Drizzle)

- Use Drizzle ORM with Postgres
- Define schemas in `src/db/schema/`
- Keep queries in service files
- Use migrations for schema changes (`drizzle-kit`)

```typescript
// Schema example
export const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  state: text("state").notNull().default(TaskState.PENDING),
  repoId: uuid("repo_id").references(() => repos.id),
  createdAt: timestamp("created_at").defaultNow(),
});
```

## Testing (Vitest)

- Place tests alongside source files with `.test.ts` suffix
- Use Vitest's `describe`, `it`, `expect`, `vi`
- Mock dependencies with `vi.mock()`
- Use `beforeEach` to reset mocks

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db/client.js", () => ({
  db: { select: vi.fn().mockReturnThis(), ... },
}));

describe("taskService", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a task", async () => {
    const result = await createTask({ title: "Test" });
    expect(result.id).toBeDefined();
  });
});
```

## State Machine

Task states follow a strict lifecycle. All transitions are validated — invalid transitions throw `InvalidTransitionError`. See `packages/shared/src/utils/state-machine.ts`.

```
pending → queued → provisioning → running → pr_opened → completed
                                     ↓  ↑        ↓  ↑
                                needs_attention   needs_attention
                                     ↓                ↓
                                  cancelled         cancelled
                                running → failed → queued (retry)
```

---

# Context-Mode (MANDATORY)

This project uses context-mode MCP tools to protect context windows.

## BLOCKED Commands

- **curl / wget**: Use `context-mode_ctx_fetch_and_index()` or `context-mode_ctx_execute()`
- **Inline HTTP** (`fetch('http`, `requests.get`): Use sandbox execution
- **Direct web fetching**: Use `context-mode_ctx_fetch_and_index()`

## Tool Selection Hierarchy

1. **GATHER**: `context_mode_ctx_batch_execute()` — run commands + search in ONE call
2. **FOLLOW-UP**: `context_mode_ctx_search(queries)` — query indexed content
3. **PROCESSING**: `context_mode_ctx_execute()` / `context_mode_ctx_execute_file()` — sandbox execution
4. **WEB**: `context_mode_ctx_fetch_and_index()` then search
5. **INDEX**: `context_mode_ctx_index()` — store for later search

## Output Constraints

- Keep responses under 500 words
- Write artifacts to FILES — never return inline
- Use descriptive source labels when indexing

---

# Additional Resources

- See `CLAUDE.md` for detailed architecture and domain concepts
- See `CONTRIBUTING.md` for PR and commit conventions
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:`)
