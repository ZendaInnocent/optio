import { pgTable, uuid, timestamp, integer, text, index } from "drizzle-orm/pg-core";
import { agentRuns } from "./agent-runs.js";

export const agentRunPrs = pgTable(
  "agent_run_prs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    prUrl: text("pr_url").notNull(),
    prNumber: integer("pr_number"),
    title: text("title"),
    state: text("state"), // open, merged, closed
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_run_prs_agent_run_id_idx").on(table.agentRunId)],
);
