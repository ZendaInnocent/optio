# Unified Agent Runs: Cutover Guide

> **Big-Bang Migration Strategy** — This guide outlines the step-by-step process for cutting over from legacy `tasks` and `interactive_sessions` tables to the unified `agent_runs` system.

## Pre-Cutover Checklist

- [ ] **Backup Database** — Take a full database dump before proceeding
  ```bash
  pg_dump -h localhost -U optio -d optio > backup-$(date +%Y%m%d-%H%M%S).sql
  ```
- [ ] **Maintenance Window** — Schedule a maintenance window (typically 15-30 minutes)
- [ ] **Stakeholders Notified** — Ensure all users are aware of the migration window
- [ ] **Code Deployed** — New code with unified agent runs APIs deployed (but old routes still active via compat routes)
- [ ] **Health Checks Passing** — `/api/health` and `/api/health/schema` both green
- [ ] **Migration Script Tested** — Tested in staging environment (if available)

---

## Cutover Steps

### Step A: Deploy New Code

1. Deploy the latest code with unified agent runs support:
   ```bash
   tilt up
   ```
2. Verify the API server starts without errors:
   ```bash
   curl http://localhost:30400/api/health
   ```
3. Check schema validation includes new tables:
   ```bash
   curl http://localhost:30400/api/health/schema
   ```
   Should return `"valid": true` and list all required tables including `agent_runs`, `agent_run_events`, `agent_run_prs`.

**At this point:** Old routes (`/api/tasks`, `/api/sessions`) are still active and redirect to new APIs. Both old and new APIs can be used.

---

### Step B: Run Data Migration

Execute the migration script to migrate all legacy data:

```bash
cd apps/api
pnpm tsx scripts/migrate-to-agent-runs.ts
```

**Expected output:**

```
[INFO] Starting unified agent runs migration
[INFO] Migrated X tasks to agent_runs
[INFO] Migrated Y interactive sessions to agent_runs
[INFO] Migrated Z task logs to agent_run_events
[INFO] Migrated W session messages to agent_run_events
[INFO] Migrated V session PRs to agent_run_prs
[INFO] Migration completed successfully
```

**Migration is idempotent** — if the script fails or is interrupted, you can safely re-run it. It uses `onConflictDoNothing` to avoid duplicate inserts.

---

### Step C: Verify Data Integrity

After migration completes, verify data consistency:

**1. Count checks:**

```sql
-- In database (psql)
SELECT
  (SELECT COUNT(*) FROM tasks) as task_count,
  (SELECT COUNT(*) FROM interactive_sessions) as session_count,
  (SELECT COUNT(*) FROM agent_runs) as agent_run_count;
```

The `agent_run_count` should equal `task_count + session_count`.

**2. Spot-check migrated data:**

```sql
-- Verify tasks were migrated correctly
SELECT id, title, state, mode
FROM agent_runs
WHERE id IN (SELECT id FROM tasks LIMIT 5);

-- Verify sessions were migrated correctly
SELECT id, title, state, mode
FROM agent_runs
WHERE id IN (SELECT id FROM interactive_sessions LIMIT 5);
```

**3. Verify events and PRs:**

```sql
SELECT COUNT(*) FROM agent_run_events;
SELECT COUNT(*) FROM agent_run_prs;
```

---

### Step D: Cut Over — Switch to 410 Gone

**This is the critical step where old APIs stop working.**

Update the compatibility routes to return `410 Gone` instead of redirecting/creating new runs.

**Option 1: Immediate cut (recommended for big-bang):**

Modify `apps/api/src/routes/tasks.compat.ts` and `apps/api/src/routes/sessions.compat.ts`:

```typescript
// In both compat files, replace route handlers with:

fastify.get("/api/tasks/:id", async (_request, _reply) => {
  return { error: "Endpoint deprecated. Use /api/agent-runs/:id" };
});
// ... and similarly for all other routes, but with status 410

// Better: Use reply.code(410) for all:
fastify.get("/api/tasks/:id", async (request, reply) => {
  reply.code(410).send({ error: "Endpoint deprecated. Use /api/agent-runs/:id" });
});

fastify.get("/api/tasks", async (request, reply) => {
  reply.code(410).send({ error: "Endpoint deprecated. Use /api/agent-runs?mode=autonomous" });
});

fastify.post("/api/tasks", async (request, reply) => {
  reply.code(410).send({ error: "Endpoint deprecated. Use POST /api/agent-runs" });
});

// Same for /api/sessions routes
```

**Option 2: Feature flag (for gradual cutover):**

If you added `OPTIO_USE_AGENT_RUNS` flag earlier, you could conditionally enable:

```typescript
if (process.env.OPTIO_USE_AGENT_RUNS === "true") {
  // Return 410
} else {
  // Original redirect/create behavior
}
```

But for big-bang, just replace with 410 immediately.

After making changes:

1. Rebuild and restart API server:
   ```bash
   tilt trigger api
   ```
2. Verify old endpoints return 410:

   ```bash
   curl -i http://localhost:30400/api/tasks
   # Expect: HTTP/1.1 410 Gone

   curl -i http://localhost:30400/api/sessions
   # Expect: HTTP/1.1 410 Gone
   ```

3. Verify new endpoints still work:
   ```bash
   curl -i http://localhost:30400/api/agent-runs
   # Expect: HTTP/1.1 200 OK (or 401 if auth required)
   ```

---

### Step E: Monitor for 48 Hours

1. **Watch logs for errors:**
   ```bash
   tail -f apps/api/logs/api.log | grep -i "error\|warn"
   ```
2. **Check health endpoints** every 30 minutes:
   ```bash
   curl http://localhost:30400/api/health
   curl http://localhost:30400/api/health/schema
   ```
3. **Monitor application metrics:**
   - Task completion rates
   - Error rates
   - PR creation success
4. **Enable alerting** on:
   - API error rate > 1%
   - Database connection errors
   - Worker crashes

---

### Step F: Cleanup Old Tables (After 7 Days)

After 7 days of stable operation with no rollback incidents, you can safely drop the legacy tables.

**Warning:** This is irreversible. Ensure you have backups and confidence in the new system.

1. **Create a new migration to drop old tables:**

   ```bash
   cd apps/api
   npx drizzle-kit generate
   ```

   Then create a migration file in `apps/api/src/db/migrations/` with:

   ```sql
   DROP TABLE IF EXISTS tasks CASCADE;
   DROP TABLE IF EXISTS interactive_sessions CASCADE;
   DROP TABLE IF EXISTS task_logs CASCADE;
   DROP TABLE IF EXISTS session_messages CASCADE;
   DROP TABLE IF EXISTS session_prs CASCADE;
   DROP TABLE IF EXISTS task_dependencies CASCADE; -- if no longer needed
   ```

2. **Also update schema-validator.ts:** Remove these tables from `CORE_TABLES` and `TABLE_COLUMNS`.

3. **Deploy cleanup migration:**

   ```bash
   tilt trigger api
   ```

4. **Verify migration applied:**

   ```bash
   curl http://localhost:30400/api/health/schema
   ```

5. **Remove compat route files** (optional but recommended):

   ```bash
   rm apps/api/src/routes/tasks.compat.ts
   rm apps/api/src/routes/sessions.compat.ts
   ```

   Also remove their imports and registrations from `server.ts`.

6. **Commit cleanup:**
   ```bash
   git add .
   git commit -m "chore: drop legacy tables after unified agent runs cutover"
   ```

---

## Rollback Plan

If something goes wrong within the 48-hour monitoring period:

1. **Restore database from backup:**
   ```bash
   psql -h localhost -U optio -d optio < backup-YYYYMMDD-HHMMSS.sql
   ```
2. **Revert code to previous version** (before compat routes returned 410):
   ```bash
   git revert <commit-hash>
   tilt trigger api
   ```
3. **Old APIs will work again** as they were before Step D.

---

## Post-Cutover

- [ ] Update documentation to reference `/api/agent-runs` instead of `/api/tasks` and `/api/sessions`
- [ ] Update web UI if still using old endpoints (should already be using new ones)
- [ ] Archive old migration script and documentation after 30 days
- [ ] Consider removing `agent_run_mode` enum values that are no longer used (none, all are used)

---

## Validation Commands

Quick reference for validation:

```bash
# Health check
curl -s http://localhost:30400/api/health | jq .

# Schema health
curl -s http://localhost:30400/api/health/schema | jq .

# Count verification
echo "
SELECT
  (SELECT COUNT(*) FROM tasks) as tasks,
  (SELECT COUNT(*) FROM interactive_sessions) as sessions,
  (SELECT COUNT(*) FROM agent_runs) as agent_runs;
" | psql -h localhost -U optio -d optio -c -

# Test old endpoints (should return 410)
curl -i http://localhost:30400/api/tasks
curl -i http://localhost:30400/api/sessions

# Test new endpoints
curl -i http://localhost:30400/api/agent-runs
```

---

## Support

If you encounter issues during cutover:

1. Check logs in `apps/api/logs/`
2. Verify migration script output
3. Review database constraints and indexes
4. Rollback immediately if uncertain
