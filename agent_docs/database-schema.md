# Database Schema

See: `apps/api/src/db/schema/` for all schemas.

## Key Tables

- `tasks` — Task definitions and state
- `repos` — Repository configurations
- `task_events` — Task state transitions

## State Machine

All transitions validated — invalid transitions throw `InvalidTransitionError`.

```
pending → queued → provisioning → running → pr_opened → completed
                                      ↓  ↑        ↓  ↑
                                 needs_attention   needs_attention
                                      ↓                ↓
                                   cancelled         cancelled
                                 running → failed → queued (retry)
```

See: `packages/shared/src/utils/state-machine.ts`

## Queries

Keep DB queries in service files, not in routes.
