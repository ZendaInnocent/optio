# Code Conventions

Reference authoritative patterns from existing code rather than reading this file.

## Naming

| Type             | Convention       | Example           |
| ---------------- | ---------------- | ----------------- |
| Files            | kebab-case       | `task-service.ts` |
| Types/Interfaces | PascalCase       | `TaskState`       |
| Functions        | camelCase        | `createTask()`    |
| Constants        | UPPER_SNAKE_CASE | `MAX_RETRIES`     |
| Database tables  | snake_case       | `tasks`           |

## Imports

- Use explicit `.js` for local imports (ESM requirement)
- Order: external → workspace packages → local

See: `apps/api/src/db/client.ts:1-15` for import patterns.

## Error Handling

- Custom error classes for domain errors
- Use Zod for route validation
- Throw and let Fastify catch

See: `apps/api/src/services/task-service.ts:14` for error patterns.

## Testing

- Place tests alongside source with `.test.ts` suffix
- Use Vitest with `describe`, `it`, `expect`, `vi`

See: `apps/api/src/services/task-service.test.ts` for test patterns.
