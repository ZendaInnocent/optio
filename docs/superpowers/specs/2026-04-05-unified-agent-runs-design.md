# Unified Agent Runs: System Design

**Date:** 2026-04-05  
**Status:** Proposed  
**Author:** Optio Agent (brainstorming session)  
**Related:** [architecture.md](agent_docs/architecture.md), [database-schema.md](agent_docs/database-schema.md), [contract.md](agent_docs/contract.md)

---

## Problem Statement

Optio currently has two separate agent execution systems:

- **Tasks**: fire-and-forget autonomous runs that produce PRs
- **Interactive Sessions**: persistent chat+terminal workspaces

These systems share infrastructure (pod pool, agent adapters, worktree management) but have distinct data models, APIs, and UIs. Users cannot fluidly switch between autonomous and interactive modes during a single agent run.

**Goal:** Unify both into a single `agent_runs` abstraction that supports three modes:

- `autonomous`: full automation (current task behavior)
- `supervised`: autonomous with human oversight/steering
- `interactive`: per-message chat/terminal control (current session behavior)

The mode can be changed at runtime, preserving worktree context and agent memory.

---

## Core Data Model

### `agent_runs` (primary table)

| Column           | Type          | Notes                                     |
| ---------------- | ------------- | ----------------------------------------- |
| `id`             | uuid PK       |                                           |
| `workspace_id`   | uuid FK       |                                           |
| `repo_id`        | uuid FK       |                                           |
| `title`          | text          |                                           |
| `initial_prompt` | text          |                                           |
| `mode`           | enum          | `autonomous`, `supervised`, `interactive` |
| `state`          | enum          | See state machine below                   |
| `agent_type`     | enum          | `claude-code`, `codex`, `opencode`        |
| `model`          | text          | Model identifier                          |
| `branch_name`    | text          | Dedicated branch: `optio/agent-run/{id}`  |
| `worktree_path`  | text          | Path inside pod                           |
| `session_id`     | text          | Agent's internal session ID (for resume)  |
| `pr_url`         | text          | Most recent PR (if any)                   |
| `cost_usd`       | numeric(10,6) | Accumulated cost                          |
| `max_turns`      | integer       | Mode-specific limit                       |
| `metadata`       | jsonb         | `{dependsOn: [], constraints: {}, ...}`   |
| `created_at`     | timestamp     |                                           |
| `updated_at`     | timestamp     |                                           |
| `ended_at`       | timestamp     |                                           |

**Indexes:**

- `(workspace_id, created_at DESC)`
- `(repo_id, state)`
- `(state, updated_at)` for worker polling

### `agent_run_events`

Structured log entries and chat messages.

| Column         | Type         | Notes                                                                                                     |
| -------------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| `id`           | bigserial PK |                                                                                                           |
| `agent_run_id` | uuid FK      |                                                                                                           |
| `timestamp`    | timestamp    |                                                                                                           |
| `type`         | enum         | `text`, `tool_use`, `tool_result`, `thinking`, `system`, `error`, `info`, `message` (user/assistant chat) |
| `content`      | jsonb        | Flexible payload (text, tool call, message role)                                                          |
| `turn`         | integer      | Monotonic per-run counter                                                                                 |

**Indexes:**

- `(agent_run_id, timestamp)`
- `(agent_run_id, turn)`

### `agent_run_prs`

One-to-many relationship (multiple PRs per run possible).

| Column         | Type      | Notes              |
| -------------- | --------- | ------------------ |
| `id`           | uuid PK   |                    |
| `agent_run_id` | uuid FK   |                    |
| `pr_url`       | text      |                    |
| `pr_number`    | integer   |                    |
| `title`        | text      |                    |
| `state`        | text      | open/merged/closed |
| `created_at`   | timestamp |                    |

---

## State Machine

### Universal States

```
pending → queued → provisioning → running → completed
                                  ↓     ↑        ↓  ↑
                             needs_attention   needs_attention
                                  ↓                ↓
                                cancelled         cancelled
                              running → failed → queued (retry)
```

**Transitions:**

- `transitionTask(oldState, newState)` validates via `state-machine.ts`
- Invalid transitions throw `InvalidTransitionError`

### Mode-Specific Behavior

| Mode          | States                                                                              | Completion Trigger                       |
| ------------- | ----------------------------------------------------------------------------------- | ---------------------------------------- |
| `autonomous`  | runs through `running` straight to `completed` (or `failed`/`cancelled`)            | Agent reports PR or declares done        |
| `supervised`  | `running` → `needs_attention` (on error/CI fail) → `running` (resume) → `completed` | User or PR watcher resumes until success |
| `interactive` | `running` (per-turn) → `ended` (user action) → `completed`                          | User clicks "End Session"                |

---

## Migration Strategy: Big Bang

**One-shot migration preserving all existing data.**

### 1. New Tables

Create in order:

1. `agent_runs`
2. `agent_run_events`
3. `agent_run_prs`

Keep old `tasks`, `interactive_sessions`, `task_logs`, `session_messages`, `session_prs` for rollback window.

### 2. Data Migration Script

Idempotent SQL that:

- Copies all `tasks` to `agent_runs` with `mode='autonomous'`
- Copies all `interactive_sessions` with `mode='interactive'`
- Maps `task_logs` → `agent_run_events` (type=log)
- Maps `session_messages` → `agent_run_events` (type=message)
- Maps `session_prs` appropriately
- Preserves all `session_id` values for resume continuity

**Rollback:** Truncate new tables, delete new DB migrations.

### 3. API Redirect (Backward Compatibility)

During dual-write period (1 week):

- `/api/tasks/*` and `/api/sessions/*` routes translate to `agent_runs` queries
- Old clients continue working unchanged
- Log deprecation warnings

After 1 week: return `410 Gone` with `X-Migrated-To: /api/agent-runs/:id` header.

### 4. UI Redirect

Old UI routes (`/tasks/*`, `/sessions/*`) redirect to new `/agent-runs/:id` with flash message:

> "This view has been replaced by the unified Agent Runs interface. Your data has been migrated."

---

## API Changes

### New Endpoints

| Method | Path                            | Purpose                                   |
| ------ | ------------------------------- | ----------------------------------------- |
| POST   | `/api/agent-runs`               | Create run (replaces tasks/sessions POST) |
| GET    | `/api/agent-runs`               | List (with filters: mode, state, repo)    |
| GET    | `/api/agent-runs/:id`           | Detail view                               |
| POST   | `/api/agent-runs/:id/mode`      | Change mode `{mode: "interactive"}`       |
| POST   | `/api/agent-runs/:id/interrupt` | Move to `needs_attention`                 |
| POST   | `/api/agent-runs/:id/resume`    | Resume with optional prompt               |
| POST   | `/api/agent-runs/:id/end`       | End interactive session                   |
| GET    | `/api/agent-runs/:id/prs`       | List associated PRs                       |
| POST   | `/api/agent-runs/:id/prs`       | Register PR (from terminal)               |
| GET    | `/api/agent-runs/:id/events`    | Paginated event log                       |
| GET    | `/api/agent-runs/:id/messages`  | Chat message history (interactive only)   |

### WebSocket

Unified: `GET /ws/agent-runs/:runId`

**Client → Server messages:**

- `{type: "message", content: "..."}` — interactive mode only
- `{type: "interrupt"}` — pause run
- `{type: "mode_switch", mode: "interactive"}` — request mode change
- `{type: "terminal_input", input: "..."}` — interactive terminal
- `{type: "end"}` — end interactive session

**Server → Client messages:**

- `{type: "event", event: {...}}` — structured log
- `{type: "mode_changed", mode: "...", reason: "..."}` — confirmation
- `{type: "state_changed", state: "...", reason: "..."}` — FSM transition
- `{type: "pr_detected", prUrl: "...", autoDetected: true}` — PR found in output/terminal

---

## Worker Architecture

### `agent-run-worker.ts`

BullMQ worker that processes `agent_run` jobs from a dedicated queue.

**Phase pipeline** (reused from task-worker):

1. **Preflight** — validate repo access, secrets, workspace limits
2. **Prepare** — get/create pod, create worktree branch, setup auth
3. **Provisioning** — install dependencies, cache warmup
4. **Execution** — run agent with mode-aware logic (see below)
5. **Result Processing** — parse PR URLs, cost, session ID
6. **Post-Completion** — cleanup, webhooks, notifications

**Execution phase branching:**

- `autonomous`: Run agent once with `initial_prompt`. Wait for PR or completion. Monitor for errors → `failed`.
- `supervised`: Same as autonomous but configure agent to emit `needs_attention` on failures/CI status. PR watcher triggers resume.
- `interactive`: WebSocket messages trigger short-lived `claude -p` executions in the same worktree. No automatic transitions.

**Session continuity:**

- Store `session_id` from agent output. Subsequent executions (resume, mode switch) pass `resume_session_id` env var to maintain conversation memory.

---

## UI Changes

### New Pages

- `/agent-runs` — list with mode/state filters, bulk actions
- `/agent-runs/[id]` — unified detail view:
  - Header: title, mode badge, state badge, mode switch button, interrupt/end buttons
  - Tabs:
    - **Overview**: PRs, recent activity, stats
    - **Logs**: unified timeline (events + chat messages)
    - **Code**: file viewer (if PR opened)
    - **Settings** (for interactive): model/agent selector
  - **Interactive mode UI**: split panes (chat + terminal)
  - **Autonomous/Supervised UI**: live log stream, "Interrupt" button appears immediately

### Components to Build

- `AgentRunCard` — list item with mode/state badges
- `ModeSwitchModal` — confirm mode change
- `UnifiedEventTimeline` — renders `agent_run_events` with icons/colors by type
- `InteractiveChatPane` — chat interface for interactive mode
- `TerminalPane` — WebSocket terminal for interactive mode
- `AgentRunHeader` — controls toolbar

---

## Implementation Phases

### Phase 1: Schema & Migration (Week 1)

- [ ] Create new tables + indexes in Drizzle schema
- [ ] Write migration SQL script (idempotent, reversible)
- [ ] Test migration on production-like dataset
- [ ] Add state machine tests for agent run states

### Phase 2: Core Worker (Week 1-2)

- [ ] Implement `agent-run-worker.ts` (copy task-worker)
- [ ] Port preflight/prepare/provisioning phases
- [ ] Add mode branching in execution phase
- [ ] Write unit tests for mode logic
- [ ] Implement session continuity (pass `resume_session_id`)

### Phase 3: API & WebSocket (Week 2)

- [ ] New routes: `/api/agent-runs/*`
- [ ] Backward-compatibility wrappers for `/api/tasks` and `/api/sessions`
- [ ] Unified WebSocket handler (`/ws/agent-runs/:runId`)
- [ ] Validate mode transitions, auth, rate limiting
- [ ] E2E tests for API endpoints

### Phase 4: UI (Week 3)

- [ ] New list page (`/agent-runs`) with filters
- [ ] Detail page with tabs and controls
- [ ] Interactive mode split-pane UI (chat + terminal)
- [ ] Mode switch modal
- [ ] Deprecate old task/session pages (redirect)

### Phase 5: Integration & Testing (Week 3-4)

- [ ] E2E: create → run → interrupt → resume → mode switch → complete
- [ ] Load test: 50 concurrent agent runs across modes
- [ ] PR watcher integration (still watches PRs, updates `agent_runs.pr_url`)
- [ ] Cost tracking accuracy across mode switches
- [ ] Session resume across pod restarts

### Phase 6: Cutover (Week 4)

- [ ] Run migration in maintenance window
- [ ] Enable new API routes as primary
- [ ] Set old routes to `410 Gone`
- [ ] Monitor error logs, user feedback
- [ ] Archive old tables after 30 days

---

## Risks & Mitigations

| Risk                             | Mitigation                                                      |
| -------------------------------- | --------------------------------------------------------------- |
| Migration data loss              | Test on production backup; keep rollback window 7 days          |
| Session continuity break         | Verify `session_id` preserved; test resume across mode switches |
| WebSocket complexity             | Unified handler with mode dispatch table; comprehensive tests   |
| Cost tracking drift              | Ensure every execution phase updates `cost_usd` atomically      |
| UI confusion (mode switches)     | Clear UI badges, confirmation modal, audit log in events        |
| Pod worktree branching conflicts | Unique branch names per run; cleanup on completion              |

---

## Open Questions

1. **Should `agent_runs` support subtasks/dependencies?** Initially no — keep simple. Add later if needed.
2. **What happens to task templates and schedules?** These belong to workspace-level config, not per-run. Keep separate; they can create `agent_runs` with pre-filled prompts.
3. **Do we need a "paused" state separate from `needs_attention`?** Not initially — `needs_attention` covers both manual review and error recovery.

---

## Success Criteria

- [ ] All existing task and session data migrates successfully
- [ ] Users can create agent runs in any mode via API/UI
- [ ] Mode switching works without losing worktree context
- [ ] PR watcher still updates runs when PRs are opened/merged
- [ ] Interactive chat/terminal feels identical to current sessions
- [ ] Autonomous runs behave identically to current tasks
- [ ] All old APIs redirect gracefully for 7 days, then return 410
- [ ] Zero data loss incidents during cutover

---

## References

- [Architecture](../agent_docs/architecture.md)
- [Database Schema](../agent_docs/database-schema.md)
- [Ubiquitous Language](../UBIQUITOUS_LANGUAGE.md)
