import { pgTable, uuid, timestamp, integer, jsonb, text, index } from "drizzle-orm/pg-core";
import { agentRuns } from "./agent-runs.js";

export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    type: text("type").notNull(), // 'text', 'tool_use', 'tool_result', 'thinking', 'system', 'error', 'info', 'message'
    content: jsonb("content").$type<any>(),
    turn: integer("turn"),
  },
  (table) => [
    index("agent_run_events_agent_run_id_idx").on(table.agentRunId),
    index("agent_run_events_timestamp_idx").on(table.timestamp),
  ],
);
