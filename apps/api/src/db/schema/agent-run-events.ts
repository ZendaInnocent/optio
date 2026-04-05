import {
  pgTable,
  bigserial,
  uuid,
  timestamp,
  integer,
  jsonb,
  text,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { agentRuns } from "./agent-runs.js";

// Event content types for agent run events
export type AgentRunEventContent =
  | { type: "text"; text: string }
  | { type: "tool_use"; name: string; input: unknown }
  | { type: "tool_result"; content: unknown; isError?: boolean }
  | { type: "thinking"; blocks: unknown[] }
  | { type: "system"; message: string }
  | { type: "error"; message: string }
  | { type: "info"; data: unknown }
  | { type: "message"; role: "user" | "assistant"; content: string }
  | { type: "log"; text: string; stream: string; logType: string };

export const agentRunEventType = pgEnum("agent_run_event_type", [
  "text",
  "tool_use",
  "tool_result",
  "thinking",
  "system",
  "error",
  "info",
  "message",
  "log", // for migrated task logs
]);

// Event stream for agent runs (text, tool use, thinking, errors, etc.)
export const agentRunEvents = pgTable(
  "agent_run_events",
  {
    id: bigserial({ mode: "bigint" }).primaryKey(),
    agentRunId: uuid("agent_run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    type: agentRunEventType("type").notNull(),
    content: jsonb("content").$type<AgentRunEventContent>(),
    turn: integer("turn"),
  },
  (table) => [
    index("agent_run_events_agent_run_id_idx").on(table.agentRunId),
    index("agent_run_events_timestamp_idx").on(table.timestamp),
    index("agent_run_events_agent_run_type_idx").on(table.agentRunId, table.type),
  ],
);
