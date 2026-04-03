# Architecture

## What is Optio?

Workflow orchestration for AI coding agents — "CI/CD where the build step is an AI agent."

- Pod-per-repo: one long-lived K8s pod per repository, multiple worktrees for concurrent tasks
- Task flow: submit task → provision worktree → run agent → open PR → PR watcher tracks CI/review
- Real-time: structured logs streamed to web UI via WebSocket

## System Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────────────┐
│   Web UI    │────→│  API Server  │────→│   K8s Pods          │
│  Next.js    │     │   Fastify    │     │                     │
│  :30310     │     │   :30400     │     │  ┌─ Repo Pod A ──┐  │
│             │←ws──│              │     │  │ clone + sleep  │  │
│             │     │ - BullMQ     │     │  │ ├─ worktree 1  │  │
│             │     │ - Drizzle    │     │  │ ├─ worktree 2  │  │
│             │     │ - WebSocket  │     │  │ └─ worktree N  │  │
│             │     │ - PR Watcher │     │  └────────────────┘  │
│             │     │ - Health Mon │     │                       │
└─────────────┘     └──────┬───────┘     └───────────────────────┘
                           │
                    ┌──────┴───────┐
                    │  Postgres    │  State, logs, secrets, config
                    │  Redis       │  Job queue, pub/sub
                    └──────────────┘
```

### Pod-per-repo with worktrees

Central optimization — one long-lived pod per repository:

- Pod clones repo once, runs `sleep infinity`
- Task arrives: `exec` into pod → `git worktree add` → run agent → cleanup worktree
- Multiple tasks concurrent in same pod (one per worktree)
- Pods use persistent volumes (installed tools survive restarts)
- Pods idle for 10 min (`OPTIO_REPO_POD_IDLE_MS`) before cleanup
- Entry point scripts: `scripts/repo-init.sh`

### Multi-pod scaling

Two per-repo settings control scaling:

- **`maxPodInstances`** (default 1): max pod replicas per repo (1–20)
- **`maxAgentsPerPod`** (default 2): max concurrent agents per pod (1–50)

Total capacity = `maxPodInstances × maxAgentsPerPod`.

Pod scheduling in `repo-pool-service.ts`:

1. Same-pod retry affinity (prefer pod from last attempt)
2. Least-loaded selection (lowest `activeTaskCount`)
3. Dynamic scale-up (create new pod with next `instanceIndex`)
4. Queue overflow (queue on least-loaded pod if at limit)

### Worktree lifecycle

`tasks.worktreeState`:

| State       | Meaning                              |
| ----------- | ------------------------------------ |
| `active`    | Worktree in use by running agent     |
| `dirty`     | Agent finished, not yet cleaned up   |
| `reset`     | Reset for retry on same pod          |
| `preserved` | Kept for manual inspection or resume |
| `removed`   | Cleaned up                           |

`repo-cleanup-worker` decisions:

- **active / preserved**: leave alone
- **dirty + retries remaining**: leave for same-pod retry
- **dirty + no retries**: remove after 2-min grace period
- **orphaned**: remove immediately

### Pod health monitoring

`repo-cleanup-worker` runs every 60s:

1. Checks repo pod status via K8s API
2. Detects crashed/OOM pods, records in `pod_health_events`
3. Fails tasks on dead pods
4. Auto-restarts: deletes dead pod record so next task recreates it
5. Cleans orphaned worktrees
6. Cleans idle pods past timeout

## Task State Machine

```
pending → queued → provisioning → running → pr_opened → completed
                                     ↓  ↑        ↓  ↑
                                needs_attention   needs_attention
                                     ↓                ↓
                                  cancelled         cancelled
                                running → failed → queued (retry)
```

All transitions validated via `taskService.transitionTask()`. Invalid transitions throw `InvalidTransitionError`.

### Priority queue and concurrency

- **Global**: `OPTIO_MAX_CONCURRENT` (default 5)
- **Per-repo**: `repos.maxConcurrentTasks` (default 2)

When limits hit, task is re-queued with 10-second delay.

### Subtask system

Three types: **child** (independent), **step** (sequential), **review** (code review).

`blocksParent` indicates if parent should wait. When blocking subtask completes, `onSubtaskComplete()` checks if parent can advance.

### Code review agent

1. Triggered by PR watcher (on CI pass or PR open) or manually (`POST /api/tasks/:id/review`)
2. Creates review subtask with `taskType: "review"`, `blocksParent: true`
3. Uses `repos.reviewPromptTemplate` with variables: `{{PR_NUMBER}}`, `{{TASK_FILE}}`, `{{REPO_NAME}}`, `{{TASK_TITLE}}`, `{{TEST_COMMAND}}`
4. Uses `repos.reviewModel` (default "sonnet")
5. Runs in same repo pod, scoped to PR branch
6. Parent waits for review to complete

### PR watcher

Runs every 30s. For each task in `pr_opened`:

1. Fetches PR data, check runs, reviews from GitHub API
2. Updates task: `prNumber`, `prState`, `prChecksStatus`, `prReviewStatus`, `prReviewComments`
3. Triggers review on CI pass (`reviewTrigger === "on_ci_pass"`)
4. Triggers review on first PR (`reviewTrigger === "on_pr"`)
5. On merge: → `completed`
6. On close without merge: → `failed`
7. On "changes requested" + `autoResumeOnReview`: → `needs_attention` → re-queue with review comments

### Task execution flow

1. User creates task (UI, ticket sync, GitHub Issue)
2. `POST /api/tasks` → insert row, transition `pending → queued`, add BullMQ job
3. Task worker picks up:
   - Concurrency check (global + per-repo)
   - Load `CLAUDE_AUTH_MODE` secret
   - Load prompt template (repo override → global default → hardcoded)
   - Render prompt with `{{TASK_FILE}}`, `{{BRANCH_NAME}}`, etc.
   - Build container config via `adapter.buildContainerConfig()`
   - For max-subscription: fetch `CLAUDE_CODE_OAUTH_TOKEN` from auth service
   - Call `repoPool.getOrCreateRepoPod()`
   - Exec bash script: `git fetch && git worktree add` → run agent → cleanup
4. Stream exec stdout, parse NDJSON via `agent-event-parser.ts`
5. Store session ID, PR URLs, cost from agent result
6. Transition: `running → pr_opened` | `completed` | `failed`
7. If subtask, check if parent should advance

## Authentication

### Web UI (OAuth)

Three providers: **GitHub**, **Google**, **GitLab**.

Enable by setting `*_OAUTH_CLIENT_ID` and `*_OAUTH_CLIENT_SECRET` env vars.

Flow: `GET /api/auth/:provider/login` → redirect → callback → upsert user → create session → set HttpOnly cookie → redirect.

Auth middleware (`apps/api/src/plugins/auth.ts`) protects all routes except `/api/health`, `/api/auth/*`, `/api/setup/*`. WebSocket accepts `?token=` query param.

**Local dev bypass**: `OPTIO_AUTH_DISABLED=true` (API), `NEXT_PUBLIC_AUTH_DISABLED=true` (web).

### Claude Code

Three modes:

1. **API Key**: `ANTHROPIC_API_KEY` injected as env var
2. **OAuth Token** (recommended for k8s): token stored as encrypted secret, injected into pods
3. **Max Subscription** (legacy, local only): reads from host's macOS Keychain

Auth service: `apps/api/src/services/auth-service.ts`. Falls back to secrets store for usage tracking in k8s.

## Prompt Templates

Template language:

- `{{VARIABLE}}` — replaced with value
- `{{#if VAR}}...{{else}}...{{/if}}` — conditional (truthy if non-empty, not "false", not "0")

Standard variables: `{{TASK_FILE}}`, `{{BRANCH_NAME}}`, `{{TASK_ID}}`, `{{TASK_TITLE}}`, `{{REPO_NAME}}`, `{{AUTO_MERGE}}`.

Priority: repo override (`repos.promptTemplateOverride`) → global default (`prompt_templates` table) → hardcoded fallback.

## Error Classification

`packages/shared/src/error-classifier.ts` pattern-matches error messages into categories (image, auth, network, timeout, agent, state, resource) with human-readable titles, descriptions, and remedies. Powers task detail error panel and card previews.

## Cost Tracking

`GET /api/analytics/costs` returns:

- **summary**: total cost, task count, avg cost, cost trend
- **dailyCosts**: per-day breakdown
- **costByRepo**: aggregated by repo
- **costByType**: coding vs review
- **topTasks**: 10 most expensive

Web UI at `/costs` with Recharts charts.

## Directory Layout

```
apps/
  api/
    src/
      routes/       health, tasks, subtasks, bulk, secrets, repos, issues,
                    setup, auth, cluster, resume, prompt-templates, analytics,
                    webhooks, comments, schedules, slack, task-templates,
                    workspaces, dependencies, workflows, mcp-servers, sessions, skills
      services/     task-service, repo-pool-service, secret-service, auth-service,
                    container-service, prompt-template-service, repo-service,
                    repo-detect-service, review-service, subtask-service,
                    ticket-sync-service, event-bus, agent-event-parser, etc.
      workers/      task-worker, pr-watcher-worker, repo-cleanup-worker,
                    ticket-sync-worker, webhook-worker, schedule-worker
      ws/           log-stream, events, session-terminal, session-chat, ws-auth
      db/           schema.ts (~26 tables), migrations (~28)
  web/
    src/
      app/          /, /tasks, /tasks/new, /tasks/[id], /repos, /repos/[id],
                    /cluster, /cluster/[id], /secrets, /settings, /setup,
                    /costs, /login, /sessions, /sessions/[id], /templates,
                    /workspace-settings, /schedules, /workflows
      components/   task-card, log-viewer, web-terminal, event-timeline, etc.
      hooks/        use-store, use-websocket, use-task, use-logs

packages/
  shared/           Types, state machine, prompt template, error classifier
  container-runtime/ DockerContainerRuntime, KubernetesContainerRuntime
  agent-adapters/   ClaudeCodeAdapter, CodexAdapter
  ticket-providers/ GitHubTicketProvider, LinearTicketProvider
```

## Database Schema (~26 tables)

**Core**: `tasks`, `task_events`, `task_logs`, `task_comments`, `task_dependencies`, `task_templates`

**Infrastructure**: `repos`, `repo_pods`, `pod_health_events`, `secrets`

**Auth**: `users`, `sessions`, `workspaces`, `workspace_members`

**Sessions**: `interactive_sessions`, `session_prs`

**Integrations**: `webhooks`, `ticket_providers`, `prompt_templates`, `schedules`, `workflows`, `mcp_servers`, `custom_skills`

## Tech Stack

| Layer      | Technology                              |
| ---------- | --------------------------------------- |
| Monorepo   | Turborepo + pnpm 10                     |
| API        | Fastify 5                               |
| ORM        | Drizzle                                 |
| Queue      | BullMQ + Redis                          |
| Web        | Next.js 15 App Router                   |
| State      | Zustand (use `getState()` in callbacks) |
| K8s client | @kubernetes/client-node                 |
| Validation | Zod                                     |
| Testing    | Vitest                                  |

## Commands

```bash
# Setup / Update
./scripts/setup-local.sh
./scripts/update-local.sh

# Quality (mirrors CI)
pnpm format:check
pnpm turbo typecheck
pnpm turbo test
cd apps/web && npx next build

# Database
cd apps/api && npx drizzle-kit generate
```

## Conventions

- **ESM**: `"type": "module"` with `.js` extensions in imports
- **Tailwind v4**: `@import "tailwindcss"` + `@theme` block, no config file
- **Drizzle**: schema in `apps/api/src/db/schema.ts`
- **Zustand**: use `useStore.getState()` in callbacks/effects, not hook selectors
- **State transitions**: always via `taskService.transitionTask()`
- **Secrets**: never log or return values, only names/scopes. AES-256-GCM encrypted
- **Cost**: stored as string (`costUsd`) to avoid float precision
- **Conventional commits**: enforced by commitlint (`feat:`, `fix:`, `refactor:`)

## Pre-commit Hooks

- **lint-staged**: eslint + prettier on **staged files only**

## Workers

1. **task-worker** — main job processor
2. **pr-watcher-worker** — polls GitHub PRs every 30s
3. **repo-cleanup-worker** — health checks every 60s
4. **ticket-sync-worker** — syncs tickets from GitHub Issues, Linear
5. **webhook-worker** — delivers webhook events
6. **schedule-worker** — triggers scheduled tasks

## Security Model

- **Web/API auth**: Multi-provider OAuth. Sessions use SHA256-hashed tokens with 30-day TTL. HttpOnly + SameSite=Lax cookies.
- **Secrets at rest**: AES-256-GCM. Values never logged or returned via API.
- **Claude Code auth**: API key, OAuth token, or host Keychain.
- **K8s RBAC**: ServiceAccount with namespace-scoped Role + ClusterRole.
- **Multi-tenancy**: Workspace-scoped resources with roles (admin/member/viewer).

## Performance Tuning

- `OPTIO_MAX_CONCURRENT` (default 5): global task concurrency
- `maxPodInstances` (default 1): scale up for high throughput repos
- `maxAgentsPerPod` (default 2): concurrent agents per pod
- `OPTIO_REPO_POD_IDLE_MS` (default 600000): idle pod lifetime
- `OPTIO_PR_WATCH_INTERVAL` (default 30s): PR polling interval
- `OPTIO_HEALTH_CHECK_INTERVAL` (default 60s): health check interval
- `maxTurnsCoding` / `maxTurnsReview`: limit agent turns
