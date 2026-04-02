# Build Commands

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

## Package-specific

```bash
# API
cd apps/api && pnpm test
cd apps/api && pnpm test -- --watch
cd apps/api && pnpm test src/services/task-service.test.ts

# Web
cd apps/web && pnpm test

# Shared
cd packages/shared && pnpm test

# Coverage
cd apps/api && pnpm test:coverage
```

## Database

```bash
pnpm db:generate   # Generate Drizzle migrations
pnpm db:migrate    # Run pending migrations
```

> Use `pnpm lint:fix` and `pnpm format` before committing. Don't lint/format manually - trust the tools.
