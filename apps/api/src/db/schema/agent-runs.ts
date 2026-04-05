import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { workspaces, repos } from "../schema.js";

export const agentRunMode = pgEnum("agent_run_mode", ["autonomous", "supervised", "interactive"]);
export const agentRunState = pgEnum("agent_run_state", [
  "pending",
  "queued",
  "provisioning",
  "running",
  "needs_attention",
  "completed",
  "failed",
  "cancelled",
]);

export const agentRuns = pgTable(
  "agent_runs",
  {
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
    metadata: jsonb("metadata").$type<{
      dependsOn?: string[];
      constraints?: Record<string, unknown>;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
  (table) => [
    index("agent_runs_workspace_created_idx").on(table.workspaceId, table.createdAt),
    index("agent_runs_repo_state_idx").on(table.repoId, table.state),
    index("agent_runs_state_updated_idx").on(table.state, table.updatedAt),
  ],
);
