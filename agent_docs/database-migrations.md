# Database Migrations

Optio uses [Drizzle ORM](https://orm.drizzle.team/) with PostgreSQL for database migrations.

## Quick Reference

```bash
pnpm db:generate    # Generate migration from schema changes
pnpm db:migrate     # Apply pending migrations to database
```

## Workflow

### Adding a new column or table

1. **Edit the schema** in `apps/api/src/db/schema.ts`
2. **Generate the migration**:
   ```bash
   cd apps/api && pnpm db:generate
   ```
3. **Review the generated SQL** in `apps/api/src/db/migrations/`
4. **Apply locally**:
   ```bash
   pnpm db:migrate
   ```
5. **Commit** — the pre-commit hook will verify the migration is registered

### Rules

1. **Never hand-write SQL migration files.** Always use `pnpm db:generate`.
2. **Never commit files with `-- +goose Up` or `-- +goose Down` markers.** Drizzle doesn't understand Goose format.
3. **Never edit `_journal.json` manually.** `drizzle-kit generate` updates it automatically.
4. **Never rename or delete existing migration files.** This breaks the migration history.
5. **Run `pnpm db:migrate` before starting the API** to ensure your local DB is in sync.

## How It Works

- `schema.ts` defines the desired database state as TypeScript
- `drizzle-kit generate` diffs the schema against the last snapshot and produces a SQL migration
- `_journal.json` tracks which migrations have been applied
- `drizzle-kit migrate` runs unapplied migrations and records them in `__drizzle_migrations`

## Troubleshooting

### "relation does not exist" or "column does not exist"

A migration hasn't been applied. Run `pnpm db:migrate`.

### "column already exists" or "relation already exists"

The migration was already applied but the journal entry is missing. This can happen if someone ran SQL manually. Check `__drizzle_migrations` table and `_journal.json` for consistency.

### Duplicate migration numbers

If two SQL files share the same number prefix (e.g., `0016_a.sql` and `0016_b.sql`), one of them was never registered in the journal. The `migration-registry.test.ts` test catches this — it will fail in CI and as a pre-commit hook.

### Schema drift detected

The API logs a schema validation error at startup. Compare `schema.ts` against the actual database columns and run `pnpm db:generate` to produce a fix migration.
