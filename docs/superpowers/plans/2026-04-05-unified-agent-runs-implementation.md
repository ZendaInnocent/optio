# Unified Agent Runs: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace tasks and interactive sessions with a unified `agent_runs` abstraction supporting autonomous, supervised, and interactive modes, with big-bang migration.

**Architecture:** Single `agent_runs` table with mode field, unified worker and WebSocket, big-bang data migration preserving all existing data.

**Tech Stack:** Drizzle ORM, Fastify, BullMQ, WebSocket, Next.js, Kubernetes/Docker

---

## File Structure

### Database Layer

- `apps/api/src/db/schema/agent-runs.ts` — New `agent_runs` table schema
- `apps/api/src/db/schema/agent-run-events.ts` — New `agent_run_events` table
- `apps/api/src/db/schema/agent-run-prs.ts` — New `agent_run_prs` table
- `apps/api/src/db/migrations/YYYY-unified-agent-runs.ts` — Migration script

### API Layer

- `apps/api/src/routes/agent-runs.ts` — CRUD + mode switching endpoints
- `apps/api/src/services/agent-run-service.ts` — Business logic, FSM transitions
- `apps/api/src/workers/agent-run-worker.ts` — BullMQ worker with mode-aware execution
- `apps/api/src/lib/agent-run-state-machine.ts` — State validation (extend existing)
- `apps/api/src/ws/agent-runs.ts` — Unified WebSocket handler

### Backward Compatibility

- `apps/api/src/routes/tasks.compat.ts` — Redirect old task routes
- `apps/api/src/routes/sessions.compat.ts` — Redirect old session routes
- `apps/api/src/services/migration-service.ts` — Data migration logic

### Web UI

- `apps/web/src/app/agent-runs/page.tsx` — List view with filters
- `apps/web/src/app/agent-runs/[id]/page.tsx` — Detail view with mode controls
- `apps/web/src/components/agent-run/` — Card, header, event timeline, chat pane, terminal pane
- `apps/web/src/components/mode-switch-modal.tsx` — Mode change UI

### Shared Types

- `packages/shared/src/types/agent-run.ts` — TypeScript interfaces
- `packages/shared/src/utils/agent-run-state-machine.ts` — State machine logic

---

## Tasks

### Task 1: Database Schema — Create New Tables

**Files:**

- Create: `apps/api/src/db/schema/agent-runs.ts`
- Create: `apps/api/src/db/schema/agent-run-events.ts`
- Create: `apps/api/src/db/schema/agent-run-prs.ts`
- Modify: `apps/api/src/db/schema/index.ts` (export new schemas)
- Test: `apps/api/src/db/schema/agent-runs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { expect } from "bun-test";
import { agentRuns, agentRunEvents, agentRunPrs } from "./index";

describe("agent_runs schema", () => {
  it("should have correct table structure", () => {
    const table = agentRuns;
    expect(table.columns).toHaveProperty("id");
    expect(table.columns).toHaveProperty("workspaceId");
    expect(table.columns).toHaveProperty("repoId");
    expect(table.columns).toHaveProperty("mode");
    // ... more assertions
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/db/schema/agent-runs.test.ts`
Expected: "Cannot find module" or test fails due to missing schema export

- [ ] **Step 3: Write minimal schema implementation**

```typescript
import {
  pgTable,
  text,
  uuid,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { CreateEnum } from "drizzle-zod-experimental/pg";

export const agentRunMode = CreateEnum("agent_run_mode", [
  "autonomous",
  "supervised",
  "interactive",
]);
export const agentRunState = CreateEnum("agent_run_state", [
  "pending",
  "queued",
  "provisioning",
  "running",
  "needs_attention",
  "completed",
  "failed",
  "cancelled",
]);

export const agentRuns = pgTable("agent_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  initialPrompt: text("initial_prompt").notNull(),
  mode: agentRunMode("mode").notNull().default("autonomous"),
  state: agentRunState("state").notNull().default("pending"),
  agentType: text("agent_type").notNull(),
  model: text("model"),
  branchName: text("branch_name"),
  worktreePath: text("worktree_path"),
  sessionId: text("session_id"),
  prUrl: text("pr_url"),
  costUsd: numeric("cost_usd", { precision: 10, scale: 6 }).default("0"),
  maxTurns: integer("max_turns"),
  metadata: jsonb("metadata").$type<{ dependsOn?: string[]; constraints?: Record<string, any> }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  endedAt: timestamp("ended_at"),
});

export const agentRunEvents = pgTable("agent_run_events", {
  id: bigserial("id").primaryKey(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  type: text("type").notNull(), // 'text', 'tool_use', 'tool_result', 'thinking', 'system', 'error', 'info', 'message'
  content: jsonb("content").$type<any>(),
  turn: integer("turn"),
});

export const agentRunPrs = pgTable("agent_run_prs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  prUrl: text("pr_url").notNull(),
  prNumber: integer("pr_number"),
  title: text("title"),
  state: text("state"), // open, merged, closed
  createdAt: timestamp("created_at").defaultNow(),
});
```

Add indexes:

```typescript
// In each schema file:
export const agentRunsIdx = {
  workspaceCreatedIdx: index("agent_runs_workspace_created_idx").on(
    agentRuns.workspaceId,
    agentRuns.createdAt,
  ),
  repoStateIdx: index("agent_runs_repo_state_idx").on(agentRuns.repoId, agentRuns.state),
  stateUpdatedIdx: index("agent_runs_state_updated_idx").on(agentRuns.state, agentRuns.updatedAt),
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/api && pnpm test src/db/schema/agent-runs.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/db/schema/agent-runs.ts \
         apps/api/src/db/schema/agent-run-events.ts \
         apps/api/src/db/schema/agent-run-prs.ts \
         apps/api/src/db/schema/index.ts \
         apps/api/src/db/schema/agent-runs.test.ts
git commit -m "feat: add unified agent_runs schema with mode and state enums"
```

---

### Task 2: State Machine — Unified Transitions

**Files:**

- Create: `packages/shared/src/utils/agent-run-state-machine.ts`
- Modify: `packages/shared/src/types/index.ts` (export new types)
- Test: `packages/shared/src/utils/agent-run-state-machine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { canTransition, getInitialState, getTerminalStates } from "./agent-run-state-machine";
import { AgentRunState } from "../types";

describe("agentRunStateMachine", () => {
  it("allows pending -> queued", () => {
    expect(canTransition("pending" as AgentRunState, "queued" as AgentRunState)).toBe(true);
  });

  it("forbids completed -> running", () => {
    expect(canTransition("completed" as AgentRunState, "running" as AgentRunState)).toBe(false);
  });

  it("allows needs_attention -> running (resume)", () => {
    expect(canTransition("needs_attention" as AgentRunState, "running" as AgentRunState)).toBe(
      true,
    );
  });

  it("mode switching from any state allowed", () => {
    // This is a special metadata-driven transition that bypasses normal FSM
    expect(canTransition("running", "running", { modeSwitch: true })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter shared test src/utils/agent-run-state-machine.test.ts`
Expected: "Module not found" or test functions undefined

- [ ] **Step 3: Implement state machine**

```typescript
import { AgentRunState } from "../types";

export type TransitionContext = {
  modeSwitch?: boolean;
  fromMode?: string;
  toMode?: string;
};

const VALID_TRANSITIONS: Record<AgentRunState, AgentRunState[]> = {
  pending: ["queued", "cancelled"],
  queued: ["provisioning", "cancelled"],
  provisioning: ["running", "failed", "cancelled"],
  running: ["needs_attention", "completed", "failed", "cancelled"],
  needs_attention: ["running", "cancelled", "failed"],
  completed: [],
  failed: ["queued"], // retry
  cancelled: [],
};

export function canTransition(
  from: AgentRunState,
  to: AgentRunState,
  ctx: TransitionContext = {},
): boolean {
  // Mode switches are special: they may change the mode field but keep state as-is or move to needs_attention
  if (ctx.modeSwitch) {
    // Allow mode switch from any state to needs_attention (for interactive uplink)
    // Or keep same state if just changing mode mid-run
    return true;
  }

  const allowed = VALID_TRANSITIONS[from];
  return allowed.includes(to);
}

export function getInitialState(): AgentRunState {
  return "pending";
}

export const TERMINAL_STATES: AgentRunState[] = ["completed", "failed", "cancelled"];
```

- [ ] **Step 4: Run test to verify it passes**

Run same test command. Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/utils/agent-run-state-machine.ts \
         packages/shared/src/types/index.ts \
         packages/shared/src/utils/agent-run-state-machine.test.ts
git commit -m "feat: add unified agent run state machine with mode-switch support"
```

---

### Task 3: Backend Service — Agent Run CRUD

**Files:**

- Create: `apps/api/src/services/agent-run-service.ts`
- Modify: `apps/api/src/db/schema/index.ts` (import new tables)
- Test: `apps/api/src/services/agent-run-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "bun-test";
import { agentRunService } from "./agent-run-service";
import { db } from "@/db";
import { agentRuns } from "@/db/schema";

describe("AgentRunService", () => {
  it("creates an agent run with correct initial state", async () => {
    const run = await agentRunService.createAgentRun({
      title: "Test run",
      initialPrompt: "Do something",
      repoId: "repo-uuid",
      workspaceId: "workspace-uuid",
      agentType: "claude-code",
      model: "claude-sonnet",
      mode: "autonomous",
    });

    expect(run.state).toBe("pending");
    expect(run.mode).toBe("autonomous");
    expect(run.initialPrompt).toBe("Do something");
  });

  it("transitions state with validation", async () => {
    const run = await agentRunService.createAgentRun(/* ... */);
    await agentRunService.transitionState(run.id, "queued");
    const updated = await agentRunService.getAgentRun(run.id);
    expect(updated.state).toBe("queued");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/services/agent-run-service.test.ts`
Expected: Service not implemented

- [ ] **Step 3: Implement service**

```typescript
import { db } from "@/db";
import { agentRuns, AgentRunMode, AgentRunState } from "@/db/schema";
import { canTransition, TERMINAL_STATES } from "shared/utils/agent-run-state-machine";

export class AgentRunService {
  async createAgentRun(input: {
    title: string;
    initialPrompt: string;
    repoId: string;
    workspaceId: string;
    agentType: string;
    model?: string;
    mode: AgentRunMode;
    maxTurns?: number;
    dependsOn?: string[];
  }) {
    const [run] = await db
      .insert(agentRuns)
      .values({
        ...input,
        maxTurns: input.maxTurns ?? (input.mode === "interactive" ? 100 : 50),
        state: "pending",
      })
      .returning();

    return run;
  }

  async getAgentRun(id: string) {
    return await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  async transitionState(
    runId: string,
    newState: AgentRunState,
    ctx: { modeSwitch?: boolean } = {},
  ) {
    const run = await this.getAgentRun(runId);
    if (!run) throw new Error("Agent run not found");

    if (!canTransition(run.state, newState, ctx)) {
      throw new Error(`Invalid transition: ${run.state} -> ${newState}`);
    }

    const [updated] = await db
      .update(agentRuns)
      .set({ state: newState, updatedAt: new Date() })
      .where(eq(agentRuns.id, runId))
      .returning();

    return updated;
  }

  async switchMode(runId: string, newMode: AgentRunMode) {
    // Mode switch is allowed from any state, but may affect turn limits
    const [updated] = await db
      .update(agentRuns)
      .set({ mode: newMode, updatedAt: new Date() })
      .where(eq(agentRuns.id, runId))
      .returning();

    return updated;
  }

  async recordEvent(runId: string, type: string, content: any, turn?: number) {
    await db.insert(agentRunEvents).values({
      agentRunId: runId,
      type,
      content,
      turn,
    });
  }

  async registerPr(runId: string, prUrl: string, prNumber?: number, title?: string) {
    await db.insert(agentRunPrs).values({
      agentRunId: runId,
      prUrl,
      prNumber,
      title,
      state: "open",
    });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS (service methods work)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/agent-run-service.ts \
         apps/api/src/services/agent-run-service.test.ts
git commit -m "feat: add agent run service with CRUD and state transitions"
```

---

### Task 4: API Routes — Agent Run Endpoints

**Files:**

- Create: `apps/api/src/routes/agent-runs.ts`
- Modify: `apps/api/src/routes/index.ts` (register new routes)
- Test: `apps/api/src/routes/agent-runs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun-test";
import { createFastifyInstance } from "@/test/helpers";
import { agentRunService } from "@/services/agent-run-service";

describe("Agent Run Routes", () => {
  it("POST /api/agent-runs creates a new run", async () => {
    const fastify = await createFastifyInstance();
    const response = await fastify.inject({
      method: "POST",
      url: "/api/agent-runs",
      payload: {
        title: "New agent run",
        initialPrompt: "Fix the bug",
        repoId: "repo-uuid",
        workspaceId: "workspace-uuid",
        agentType: "claude-code",
        mode: "autonomous",
      },
    });

    expect(response.status).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
    expect(body.state).toBe("pending");
  });

  it("POST /api/agent-runs/:id/mode switches mode", async () => {
    // Create run first, then switch mode
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/routes/agent-runs.test.ts`
Expected: Route not registered

- [ ] **Step 3: Implement routes**

```typescript
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { agentRunService } from "@/services/agent-run-service";

const createAgentRunSchema = z.object({
  title: z.string(),
  initialPrompt: z.string(),
  repoId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  agentType: z.string(),
  model: z.string().optional(),
  mode: z.enum(["autonomous", "supervised", "interactive"]),
  maxTurns: z.number().optional(),
  dependsOn: z.array(z.string().uuid()).optional(),
});

export async function registerAgentRunRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/agent-runs",
    {
      schema: { body: createAgentRunSchema },
      preValidation: fastify.authRequired,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const input = createAgentRunSchema.parse(request.body);
      const run = await agentRunService.createAgentRun(input);
      reply.code(201).send(run);
    },
  );

  fastify.get(
    "/api/agent-runs/:id",
    {
      preValidation: fastify.authRequired,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const run = await agentRunService.getAgentRun(request.params.id);
      if (!run) return reply.code(404).send({ error: "Not found" });
      reply.send(run);
    },
  );

  fastify.post(
    "/api/agent-runs/:id/mode",
    {
      schema: { body: z.object({ mode: z.enum(["autonomous", "supervised", "interactive"]) }) },
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      const { mode } = request.body as { mode: string };
      const run = await agentRunService.switchMode(request.params.id, mode);
      reply.send(run);
    },
  );

  fastify.post(
    "/api/agent-runs/:id/interrupt",
    {
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      const run = await agentRunService.transitionState(request.params.id, "needs_attention");
      reply.send(run);
    },
  );

  fastify.post(
    "/api/agent-runs/:id/resume",
    {
      schema: { body: z.object({ prompt: z.string().optional() }).optional() },
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      const run = await agentRunService.transitionState(request.params.id, "running");
      // Re-queue job with optional resume prompt
      // TODO: enqueue in worker
      reply.send(run);
    },
  );

  fastify.post(
    "/api/agent-runs/:id/end",
    {
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      // Only valid for interactive mode
      const run = await agentRunService.transitionState(request.params.id, "ended");
      reply.send(run);
    },
  );

  fastify.get(
    "/api/agent-runs/:id/events",
    {
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      // Paginated events from agent_run_events
      // TODO: implement
      reply.send([]);
    },
  );

  fastify.get(
    "/api/agent-runs/:id/prs",
    {
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      // Fetch from agent_run_prs
      reply.send([]);
    },
  );

  fastify.post(
    "/api/agent-runs/:id/prs",
    {
      schema: {
        body: z.object({
          prUrl: z.string().url(),
          prNumber: z.number().optional(),
          title: z.string().optional(),
        }),
      },
      preValidation: fastify.authRequired,
    },
    async (request, reply) => {
      await agentRunService.registerPr(
        request.params.id,
        request.body.prUrl,
        request.body.prNumber,
        request.body.title,
      );
      reply.code(201).send({ ok: true });
    },
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: All route tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/agent-runs.ts \
         apps/api/src/routes/agent-runs.test.ts \
         apps/api/src/routes/index.ts
git commit -m "feat: add agent runs REST API endpoints"
```

---

### Task 5: Worker — Agent Run Processor

**Files:**

- Create: `apps/api/src/workers/agent-run-worker.ts`
- Modify: `apps/api/src/lib/queue.ts` (register worker)
- Test: `apps/api/src/workers/agent-run-worker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "bun-test";
import { AgentRunWorker } from "./agent-run-worker";

describe("AgentRunWorker", () => {
  it("processes autonomous agent run to completion", async () => {
    // Mock job with agentRun data
    const job = { data: { agentRunId: "test-id", mode: "autonomous" } } as any;
    const worker = new AgentRunWorker();
    const result = await worker.execute(job);
    expect(result).toEqual({ sessionId: "fake-session", prUrl: "https://github.com/..." });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/workers/agent-run-worker.test.ts`
Expected: Class not found

- [ ] **Step 3: Implement worker (copy task-worker structure)**

```typescript
import { Worker } from "bullmq";
import { IJob, Logger } from "@/lib/logger";
import { getContainerRuntime } from "@/services/container-service";
import { agentRunService } from "@/services/agent-run-service";
import { repoPool } from "@/services/repo-pool-service";
import { getOrCreateRepoPod } from "@/services/repo-pool-service";
import { getAgentAdapter } from "@/services/agent-adapter-service";
import { stateTransition } from "@/services/task-service"; // reuse pattern

export class AgentRunWorker {
  private logger = new Logger("agent-run-worker");
  private worker: Worker;

  constructor() {
    this.worker = new Worker("agent-run-queue", async (job: IJob) => {
      return await this.execute(job);
    });
  }

  async execute(job: IJob): Promise<any> {
    const { agentRunId } = job.data;
    this.logger.info("Processing agent run", { agentRunId });

    try {
      // 1. Preflight: validate repo, workspace, secrets
      const run = await agentRunService.getAgentRun(agentRunId);
      if (!run) throw new Error("Agent run not found");

      await agentRunService.transitionState(agentRunId, "provisioning");

      // 2. Prepare: get/create pod, worktree
      const pod = await getOrCreateRepoPod(run.repoId);
      const branchName = `optio/agent-run/${run.id}`;
      const worktreePath = `/worktrees/${run.id}`;

      // Create worktree if not exists
      await execInPod(pod, `git worktree add ${worktreePath} ${branchName} 2>/dev/null || true`);

      await agentRunService.transitionState(agentRunId, "running");

      // 3. Execution: mode-specific
      const adapter = getAgentAdapter(run.agentType);
      const result = await this.executeMode(run, pod, worktreePath, adapter);

      // 4. Result processing
      await agentRunService.transitionState(agentRunId, "completed");
      return result;
    } catch (error) {
      this.logger.error("Agent run failed", { error, agentRunId });
      await agentRunService.transitionState(agentRunId, "failed");
      throw error;
    }
  }

  private async executeMode(
    run: any,
    pod: any,
    worktreePath: string,
    adapter: any,
  ): Promise<{ sessionId?: string; prUrl?: string }> {
    const env = {
      OPTIO_PROMPT: run.initialPrompt,
      OPTIO_AGENT_TYPE: run.agentType,
      OPTIO_MODEL: run.model,
      OPTIO_SESSION_ID: run.sessionId, // for resume
      OPTIO_WORKTREE: worktreePath,
    };

    switch (run.mode) {
      case "autonomous":
        return await this.executeAutonomous(pod, env, adapter);
      case "supervised":
        return await this.executeSupervised(pod, env, adapter, run);
      case "interactive":
        // Interactive mode handled via WebSocket, not worker
        throw new Error("Interactive mode not processed by worker");
      default:
        throw new Error(`Unknown mode: ${run.mode}`);
    }
  }

  private async executeAutonomous(pod: any, env: Record<string, string>, adapter: any) {
    const result = await adapter.runOnce(env);
    return { sessionId: result.sessionId, prUrl: result.prUrl };
  }

  private async executeSupervised(pod: any, env: Record<string, string>, adapter: any, run: any) {
    // Same as autonomous but with monitoring hooks for resume
    const result = await adapter.runWithMonitoring(env, {
      onNeedsAttention: async () => {
        await agentRunService.transitionState(run.id, "needs_attention");
      },
      onResume: async (resumePrompt?: string) => {
        await agentRunService.transitionState(run.id, "running");
        // re-run with resume_session_id + new prompt
      },
    });
    return { sessionId: result.sessionId, prUrl: result.prUrl };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: Worker can process job (mock adapters)

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/agent-run-worker.ts \
         apps/api/src/workers/agent-run-worker.test.ts \
         apps/api/src/lib/queue.ts
git commit -m "feat: add agent run worker with mode-aware execution"
```

---

### Task 6: WebSocket — Unified Session Handler

**Files:**

- Create: `apps/api/src/ws/agent-runs.ts`
- Modify: `apps/api/src/ws/index.ts` (register route)
- Test: `apps/api/src/ws/agent-runs.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun-test";
import { createWebSocketServer } from "@/test/helpers";

describe("AgentRun WebSocket", () => {
  it("accepts messages in interactive mode", async () => {
    const server = await createWebSocketServer();
    const client = new WebSocket(`ws://localhost/ws/agent-runs/test-run`);

    await new Promise((resolve) => (client.onopen = resolve));

    client.send(JSON.stringify({ type: "message", content: "Hello agent" }));

    const response = await new Promise((resolve) => {
      client.onmessage = (event) => resolve(JSON.parse(event.data));
    });

    expect(response.type).toBe("event");
    server.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/ws/agent-runs.test.ts`
Expected: Route not defined

- [ ] **Step 3: Implement WebSocket handler**

```typescript
import { FastifyInstance, WebSocket } from "fastify";
import { agentRunService } from "@/services/agent-run-service";
import { getAgentAdapter } from "@/services/agent-adapter-service";

export async function registerAgentRunWebSocket(fastify: FastifyInstance) {
  fastify.get("/ws/agent-runs/:runId", { websocket: true }, async (connection, request) => {
    const { runId } = request.params as { runId: string };
    const ws = connection.socket as WebSocket;

    // Load agent run
    const run = await agentRunService.getAgentRun(runId);
    if (!run) {
      ws.close();
      return;
    }

    // Only interactive mode accepts messages; others monitor
    const isInteractive = run.mode === "interactive";

    ws.on("message", async (raw: Buffer) => {
      const message = JSON.parse(raw.toString());

      switch (message.type) {
        case "message":
          if (!isInteractive) {
            ws.send(
              JSON.stringify({ type: "error", message: "Cannot send messages in this mode" }),
            );
            return;
          }
          await handleInteractiveMessage(run, message.content, ws);
          break;
        case "interrupt":
          await agentRunService.transitionState(runId, "needs_attention");
          ws.send(JSON.stringify({ type: "state_changed", state: "needs_attention" }));
          break;
        case "mode_switch":
          await agentRunService.switchMode(runId, message.mode);
          ws.send(JSON.stringify({ type: "mode_changed", mode: message.mode }));
          break;
        case "end":
          await agentRunService.transitionState(runId, "ended");
          ws.close();
          break;
        case "terminal_input":
          // Forward to terminal session (separate TTY handler)
          break;
      }
    });

    // Stream events from agent_run_events (using Redis pub/sub or direct DB tail)
    await streamEventsToWebSocket(runId, ws);
  });
}

async function handleInteractiveMessage(run: any, content: string, ws: WebSocket) {
  const adapter = getAgentAdapter(run.agentType);

  // Execute one-shot agent with the message as prompt continuation
  const result = await adapter.runOnce({
    ...run,
    resumePrompt: content,
    resumeSessionId: run.sessionId,
    worktree: run.worktreePath,
  });

  // Stream events back
  for (const event of result.events) {
    ws.send(JSON.stringify({ type: "event", event }));
  }

  // Update cost, sessionId
  await agentRunService.recordEvents(run.id, result.events);
  if (result.sessionId) {
    await agentRunService.updateSessionId(run.id, result.sessionId);
  }
}

async function streamEventsToWebSocket(runId: string, ws: WebSocket) {
  // Implementation: watch agent_run_events table (polling or Redis pub/sub)
  // For now, simplified:
  // setInterval(() => { query new events; send to ws }, 1000);
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: WebSocket accepts connection and handles message

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/ws/agent-runs.ts \
         apps/api/src/ws/agent-runs.test.ts \
         apps/api/src/ws/index.ts
git commit -m "feat: add unified agent runs WebSocket handler"
```

---

### Task 7: Data Migration Script

**Files:**

- Create: `apps/api/src/services/migration-service.ts`
- Create: `apps/api/src/db/migrations/YYYYMMDD-unified-agent-runs.ts`
- Test: `apps/api/src/services/migration-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun-test";
import { migrationService } from "./migration-service";

describe("MigrationService", () => {
  it("migrates tasks to agent_runs", async () => {
    // Insert mock tasks, run migration, assert agent_runs count matches
    await migrationService.migrateAll();
    const count = await db.select().from(agentRuns);
    expect(count.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test src/services/migration-service.test.ts`
Expected: Service not implemented

- [ ] **Step 3: Implement migration service**

```typescript
import { db } from "@/db";
import { tasks, interactiveSessions, taskLogs, sessionMessages, sessionPrs } from "@/db/schema";
import { agentRuns, agentRunEvents, agentRunPrs } from "@/db/schema/agent-runs";
import { eq } from "drizzle-orm";

export class MigrationService {
  async migrateAll() {
    this.logger.info("Starting unified agent runs migration");

    // Migrate tasks
    const allTasks = await db.select().from(tasks);
    for (const task of allTasks) {
      await db
        .insert(agentRuns)
        .values({
          id: task.id,
          workspaceId: task.workspace_id,
          repoId: task.repo_id,
          title: task.title,
          initialPrompt: task.prompt,
          mode: "autonomous", // all tasks are autonomous by default
          state: task.status,
          agentType: task.agent_type,
          model: task.model,
          branchName: task.branch_name,
          worktreePath: task.worktree_path,
          sessionId: task.session_id,
          prUrl: task.pr_url,
          costUsd: parseFloat(task.cost_usd) || 0,
          maxTurns: 50,
          metadata: { dependsOn: task.depends_on || [] },
          createdAt: task.created_at,
          updatedAt: task.updated_at,
          endedAt: task.completed_at,
        })
        .onConflictDoNothing(); // safe for re-runs
    }

    // Migrate interactive sessions
    const allSessions = await db.select().from(interactiveSessions);
    for (const session of allSessions) {
      await db
        .insert(agentRuns)
        .values({
          id: session.id,
          workspaceId: session.workspace_id,
          repoId: session.repo_id,
          title: session.title || `Interactive session ${session.id}`,
          initialPrompt: "", // sessions start empty
          mode: "interactive",
          state: session.ended_at ? "ended" : "running",
          agentType: session.agent_type,
          model: session.model,
          worktreePath: session.worktree_path,
          sessionId: session.session_id,
          costUsd: parseFloat(session.cost_usd) || 0,
          maxTurns: session.max_turns || 100,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          endedAt: session.ended_at,
        })
        .onConflictDoNothing();
    }

    // Migrate logs to events (type: 'log' or 'message')
    const allTaskLogs = await db.select().from(taskLogs);
    for (const log of allTaskLogs) {
      await db.insert(agentRunEvents).values({
        agentRunId: log.task_id,
        timestamp: log.timestamp,
        type: "log",
        content: { text: log.content },
        turn: log.turn,
      });
    }

    const allSessionMsgs = await db.select().from(sessionMessages);
    for (const msg of allSessionMsgs) {
      await db.insert(agentRunEvents).values({
        agentRunId: msg.session_id,
        timestamp: msg.timestamp,
        type: "message",
        content: { role: msg.role, content: msg.content },
        turn: msg.turn,
      });
    }

    // Migrate PRs
    const allSessionPrs = await db.select().from(sessionPrs);
    for (const spr of allSessionPrs) {
      await db.insert(agentRunPrs).values({
        id: spr.id,
        agentRunId: spr.session_id, // session_id points to agent_run for sessions
        prUrl: spr.pr_url,
        prNumber: spr.pr_number,
        title: spr.title,
        state: spr.state,
        createdAt: spr.created_at,
      });
    }

    this.logger.info("Migration completed successfully");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: All data migrated correctly

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/migration-service.ts \
         apps/api/src/services/migration-service.test.ts \
         apps/api/src/db/migrations/YYYYMMDD-unified-agent-runs.ts
git commit -m "feat: add data migration service for tasks and sessions to agent_runs"
```

---

### Task 8: Backward Compatibility — Old API Redirects

**Files:**

- Create: `apps/api/src/routes/tasks.compat.ts`
- Create: `apps/api/src/routes/sessions.compat.ts`
- Modify: `apps/api/src/routes/index.ts` (register compat routes)
- Test: `apps/api/src/routes/compatibility.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test, expect } from "bun-test";
import { createFastifyInstance } from "@/test/helpers";

describe("Compatibility Routes", () => {
  it("GET /api/tasks/:id redirects to /api/agent-runs/:id", async () => {
    const fastify = await createFastifyInstance();
    const response = await fastify.inject({
      method: "GET",
      url: "/api/tasks/123",
    });
    expect(response.status).toBe(301);
    expect(response.headers.location).toBe("/api/agent-runs/123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: Old routes not yet defined

- [ ] **Step 3: Implement compatibility routes**

```typescript
// tasks.compat.ts
import { FastifyInstance } from "fastify";
import { agentRunService } from "@/services/agent-run-service";

export async function registerCompatTaskRoutes(fastify: FastifyInstance) {
  // Redirect all /api/tasks to /api/agent-runs
  fastify.get("/api/tasks/:id", async (request, reply) => {
    reply.redirect(301, `/api/agent-runs/${request.params.id}`);
  });

  fastify.post("/api/tasks", async (request, reply) => {
    // Transform task payload to agent-runs
    const body = request.body as any;
    const result = await agentRunService.createAgentRun({
      title: body.title,
      initialPrompt: body.prompt,
      repoId: body.repoUrl, // need to lookup repoId from URL
      workspaceId: body.workspaceId,
      agentType: body.agentType,
      model: body.model,
      mode: "autonomous",
      dependsOn: body.dependsOn,
    });
    reply.code(201).send(result);
  });

  fastify.get("/api/tasks", async (request, reply) => {
    // List all agent runs with mode=autonomous
    reply.redirect(302, "/api/agent-runs?mode=autonomous");
  });
}

// sessions.compat.ts — similar pattern, mode=interactive
export async function registerCompatSessionRoutes(fastify: FastifyInstance) {
  fastify.get("/api/sessions/:id", async (request, reply) => {
    reply.redirect(301, `/api/agent-runs/${request.params.id}`);
  });

  fastify.post("/api/sessions", async (request, reply) => {
    const body = request.body as any;
    const result = await agentRunService.createAgentRun({
      title: body.title || "Interactive session",
      initialPrompt: "", // sessions start empty, chat builds prompt
      repoId: body.repoUrl,
      workspaceId: body.workspaceId,
      agentType: body.agentType,
      model: body.model,
      mode: "interactive",
      maxTurns: body.maxTurns || 100,
    });
    reply.code(201).send(result);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: Redirects work, legacy payloads transform correctly

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/tasks.compat.ts \
         apps/api/src/routes/sessions.compat.ts \
         apps/api/src/routes/compatibility.test.ts \
         apps/api/src/routes/index.ts
git commit -m "feat: add backward compatibility routes for tasks and sessions"
```

---

### Task 9: UI — Agent Run List Page

**Files:**

- Create: `apps/web/src/app/agent-runs/page.tsx`
- Create: `apps/web/src/components/agent-run/AgentRunCard.tsx`
- Modify: `apps/web/src/components/AgentRunFilterBar.tsx` (new)
- Test: `apps/web/src/app/agent-runs/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { AgentRunListPage } from "./page";

describe("AgentRunListPage", () => {
  it("displays agent runs with mode badges", async () => {
    render(<AgentRunListPage />);
    expect(screen.getByText("autonomous")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/web && pnpm test src/app/agent-runs/page.test.tsx`
Expected: Component not found or route not defined

- [ ] **Step 3: Implement list page**

```tsx
"use client";

import { useState, useEffect } from "react";
import AgentRunCard from "@/components/agent-run/AgentRunCard";
import { AgentRunFilterBar } from "@/components/AgentRunFilterBar";
import { useAgentRuns } from "@/hooks/use-agent-runs";

export default function AgentRunsPage() {
  const { runs, loading, error, fetchRuns } = useAgentRuns();
  const [filters, setFilters] = useState({ mode: "all", state: "all" });

  useEffect(() => {
    fetchRuns(filters);
  }, [filters]);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Agent Runs</h1>
      <AgentRunFilterBar filters={filters} onFilterChange={setFilters} />
      <div className="grid gap-4 mt-4">
        {runs.map((run) => (
          <AgentRunCard key={run.id} run={run} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: Page renders with mocked data

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/agent-runs/page.tsx \
         apps/web/src/components/agent-run/AgentRunCard.tsx \
         apps/web/src/components/AgentRunFilterBar.tsx \
         apps/web/src/hooks/use-agent-runs.ts \
         apps/web/src/app/agent-runs/page.test.tsx
git commit -m "feat: add agent runs list page with filtering UI"
```

---

### Task 10: UI — Agent Run Detail Page

**Files:**

- Create: `apps/web/src/app/agent-runs/[id]/page.tsx`
- Create: `apps/web/src/components/agent-run/AgentRunHeader.tsx`
- Create: `apps/web/src/components/agent-run/UnifiedEventTimeline.tsx`
- Create: `apps/web/src/components/agent-run/ModeSwitchModal.tsx`
- Create: `apps/web/src/components/agent-run/InteractiveChatPane.tsx`
- Create: `apps/web/src/components/agent-run/TerminalPane.tsx`
- Test: `apps/web/src/app/agent-runs/[id]/page.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import { AgentRunDetailPage } from "./page";

describe("AgentRunDetailPage", () => {
  it("shows mode switch button for non-ended runs", async () => {
    render(<AgentRunDetailPage params={{ id: "test-id" }} />);
    expect(screen.getByText("Switch Mode")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: Page/component not found

- [ ] **Step 3: Implement detail page**

```tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAgentRun } from "@/hooks/use-agent-run";
import AgentRunHeader from "@/components/agent-run/AgentRunHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UnifiedEventTimeline from "@/components/agent-run/UnifiedEventTimeline";
import InteractiveChatPane from "@/components/agent-run/InteractiveChatPane";
import TerminalPane from "@/components/agent-run/TerminalPane";
import ModeSwitchModal from "@/components/agent-run/ModeSwitchModal";

export default function AgentRunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { run, loading, error } = useAgentRun(id!);
  const [showModeSwitch, setShowModeSwitch] = useState(false);

  if (loading) return <div>Loading...</div>;
  if (error || !run) return <div>Error: {error?.message}</div>;

  return (
    <div className="container mx-auto p-4">
      <AgentRunHeader run={run} onSwitchMode={() => setShowModeSwitch(true)} />

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
          {run.mode === "interactive" && <TabsTrigger value="chat">Chat</TabsTrigger>}
          {run.mode === "interactive" && <TabsTrigger value="terminal">Terminal</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <div className="mt-4">
            <h2 className="text-xl font-semibold mb-2">PRs</h2>
            {/* PR list component */}
          </div>
        </TabsContent>

        <TabsContent value="logs">
          <UnifiedEventTimeline agentRunId={run.id} />
        </TabsContent>

        {run.mode === "interactive" && (
          <TabsContent value="chat">
            <InteractiveChatPane agentRunId={run.id} />
          </TabsContent>
        )}

        {run.mode === "interactive" && (
          <TabsContent value="terminal">
            <TerminalPane agentRunId={run.id} />
          </TabsContent>
        )}
      </Tabs>

      {showModeSwitch && (
        <ModeSwitchModal
          currentMode={run.mode}
          onConfirm={async (newMode) => {
            // call switch mode API
            setShowModeSwitch(false);
          }}
          onCancel={() => setShowModeSwitch(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: Page renders with mocked data

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/agent-runs/[id]/page.tsx \
         apps/web/src/components/agent-run/AgentRunHeader.tsx \
         apps/web/src/components/agent-run/UnifiedEventTimeline.tsx \
         apps/web/src/components/agent-run/ModeSwitchModal.tsx \
         apps/web/src/components/agent-run/InteractiveChatPane.tsx \
         apps/web/src/components/agent-run/TerminalPane.tsx \
         apps/web/src/app/agent-runs/[id]/page.test.tsx
git commit -m "feat: add agent run detail page with mode switching and interactive panes"
```

---

### Task 11: PR Watcher Integration

**Files:**

- Modify: `apps/api/src/workers/pr-watcher-worker.ts`
- Modify: `apps/api/src/services/agent-run-service.ts` (add PR update method)
- Test: `apps/api/src/workers/pr-watcher-worker.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, beforeEach } from "bun-test";
import { prWatcherWorker } from "./pr-watcher-worker";

describe("PR Watcher Worker", () => {
  it("updates agent run when PR status changes", async () => {
    // Mock PR data with CI pass, verify agentRunService called to transition state
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Expected: Worker not yet updated

- [ ] **Step 3: Update PR watcher to work with agent_runs**

```typescript
// In pr-watcher-worker.ts
import { agentRunService } from "@/services/agent-run-service";

async function processPrEvent(pr: any) {
  // Find agent run by PR URL
  const runs = await db.select().from(agentRunPrs).where(eq(agentRunPrs.prUrl, pr.url));

  if (runs.length === 0) return;

  const agentRunId = runs[0].agentRunId;

  if (pr.merged) {
    await agentRunService.transitionState(agentRunId, "completed");
  } else if (pr.state === "open" && pr.checks === "success") {
    // Could trigger resume if in needs_attention
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Expected: PR watcher updates agent run states correctly

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/workers/pr-watcher-worker.ts \
         apps/api/src/services/agent-run-service.ts \
         apps/api/src/workers/pr-watcher-worker.test.ts
git commit -m "feat: integrate PR watcher with agent runs"
```

---

### Task 12: Migration Execution & Cutover

**Files:**

- Modify: `scripts/setup-local.sh` (add migration flag)
- Create: `scripts/migrate-to-agent-runs.ts`
- Modify: `apps/api/src/plugins/health.ts` (schema validation)
- Test: Manual + integration tests

- [ ] **Step 1: Write the failing test** (integration)

```typescript
// Full end-to-end test
it("end-to-end: create agent run, process, complete", async () => {
  // Create run via API
  // Wait for worker to process
  // Verify state = completed, PR registered
});
```

- [ ] **Step 2: Manual verification (no test run)**

- [ ] **Step 3: Run production migration**

```bash
# Step A: Deploy new code with dual-write support (old APIs still active)
tilt up

# Step B: Run migration script
cd apps/api && pnpm tsx scripts/migrate-to-agent-runs.ts

# Step C: Verify data integrity
# - Check counts: tasks + sessions == agent_runs
# - Sample spot checks

# Step D: Switch feature flag to use new APIs as primary
# (In code: change routing condition)

# Step E: After 7 days, remove compat routes and old tables
# Execute downtime: tilt down, run migration to drop old tables, tilt up
```

- [ ] **Step 4: Verify old APIs now return 410**

```bash
curl -i http://localhost:30400/api/tasks/123
# Expect: HTTP/1.1 410 Gone
# Header: X-Migrated-To: /api/agent-runs/123
```

- [ ] **Step 5: Final commit**

```bash
git add scripts/migrate-to-agent-runs.ts
git commit -m "chore: execute big-bang migration to unified agent runs"
```

---

## Verification Steps (After All Tasks)

1. **Unit tests:** `pnpm turbo test` — all pass
2. **Typecheck:** `pnpm turbo typecheck` — no errors
3. **Lint:** `pnpm lint` — clean
4. **E2E workflow:** Create autonomous run → watch logs → interrupt → resume → PR opened
5. **E2E interactive:** Create interactive → send chat message → use terminal → end session
6. **Mode switch:** Create run → switch mode mid-lifecycle → verify behavior changes
7. **Migration validation:** Compare counts and sample rows between old and new tables

---

## Open Questions for Implementation

1. **WebSocket event streaming strategy:** Polling vs Redis pub/sub vs logical replication?
2. **Session continuity across mode switches:** Does agent session ID persist correctly? Need validation.
3. **PR watcher mapping:** How to reliably find agent run given a PR URL? Index on `agent_run_prs.pr_url`.
4. **Cost tracking precision:** Ensure `cost_usd` aggregates correctly across multiple executions per run.

---

## References

- [Unified Agent Runs Design](../docs/superpowers/specs/2026-04-05-unified-agent-runs-design.md)
- [Task Worker](../../apps/api/src/workers/task-worker.ts) — reference implementation
- [Session Chat](../../apps/api/src/ws/session-chat.ts) — interactive mode reference
