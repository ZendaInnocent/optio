import { db } from "../db/client.js";
import { sql } from "drizzle-orm";

interface SchemaIssue {
  table: string;
  issue: "missing_table" | "missing_column";
  column?: string;
  expectedType?: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaIssue[];
  checkedAt: string;
}

const CORE_TABLES = [
  "users",
  "workspaces",
  "workspace_members",
  "repos",
  "repo_pods",
  "interactive_sessions",
  "tasks",
  "agent_runs",
  "agent_run_events",
  "agent_run_prs",
];

export const TABLE_COLUMNS: Record<string, string[]> = {
  interactive_sessions: [
    "id",
    "repo_url",
    "user_id",
    "worktree_path",
    "branch",
    "state",
    "pod_id",
    "agent_type",
    "model",
    "cost_usd",
    "created_at",
    "updated_at",
    "ended_at",
  ],
  repos: [
    "id",
    "repo_url",
    "workspace_id",
    "full_name",
    "default_branch",
    "is_private",
    "image_preset",
    "extra_packages",
    "setup_commands",
    "claude_model",
    "claude_context_window",
    "claude_thinking",
    "claude_effort",
    "max_turns_coding",
    "max_concurrent_tasks",
    "max_pod_instances",
    "max_agents_per_pod",
    "review_enabled",
    "auto_resume",
    "auto_merge",
  ],
  workspaces: ["id", "slug", "name", "created_at"],
  users: ["id", "provider", "external_id", "email", "display_name"],
  tasks: [
    "id",
    "title",
    "prompt",
    "repo_url",
    "repo_branch",
    "state",
    "agent_type",
    "container_id",
    "session_id",
    "pr_url",
    "pr_number",
    "pr_state",
    "pr_checks_status",
    "pr_review_status",
    "pr_review_comments",
    "result_summary",
    "cost_usd",
    "input_tokens",
    "output_tokens",
    "model_used",
    "error_message",
    "ticket_source",
    "ticket_external_id",
    "metadata",
    "retry_count",
    "max_retries",
    "priority",
    "parent_task_id",
    "task_type",
    "workflow_type",
    "subtask_order",
    "blocks_parent",
    "worktree_state",
    "last_pod_id",
    "workflow_run_id",
    "created_by",
    "ignore_off_peak",
    "workspace_id",
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
  ],
  workspace_members: ["id", "workspace_id", "user_id", "role", "can_build", "created_at"],
  repo_pods: [
    "id",
    "repo_url",
    "workspace_id",
    "repo_branch",
    "instance_index",
    "pod_name",
    "pod_id",
    "state",
    "active_task_count",
    "last_task_at",
    "error_message",
    "created_at",
    "updated_at",
  ],
  agent_runs: [
    "id",
    "workspace_id",
    "repo_id",
    "title",
    "initial_prompt",
    "mode",
    "state",
    "agent_type",
    "model",
    "branch_name",
    "worktree_path",
    "session_id",
    "pr_url",
    "cost_usd",
    "max_turns",
    "metadata",
    "created_at",
    "updated_at",
    "ended_at",
  ],
  agent_run_events: ["id", "agent_run_id", "timestamp", "type", "content", "turn"],
  agent_run_prs: ["id", "agent_run_id", "pr_url", "pr_number", "title", "state", "created_at"],
};

export async function validateSchema(): Promise<SchemaValidationResult> {
  const issues: SchemaIssue[] = [];

  for (const tableName of CORE_TABLES) {
    const tableExists = await checkTableExists(tableName);
    if (!tableExists) {
      issues.push({
        table: tableName,
        issue: "missing_table",
      });
      continue;
    }

    const expectedColumns = TABLE_COLUMNS[tableName];
    if (expectedColumns) {
      for (const col of expectedColumns) {
        const columnExists = await checkColumnExists(tableName, col);
        if (!columnExists) {
          issues.push({
            table: tableName,
            issue: "missing_column",
            column: col,
          });
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };
}

export async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}) as exists`,
    );
    return result[0]?.exists ?? false;
  } catch {
    return false;
  }
}

export async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${columnName}) as exists`,
    );
    return result[0]?.exists ?? false;
  } catch {
    return false;
  }
}

export function getMissingColumnsMessage(issues: SchemaIssue[]): string {
  const tableGroups = new Map<string, string[]>();
  for (const issue of issues) {
    const cols = tableGroups.get(issue.table) ?? [];
    if (issue.column) cols.push(issue.column);
    tableGroups.set(issue.table, cols);
  }
  return Array.from(tableGroups.entries())
    .map(([table, cols]) => `${table}: ${cols.join(", ")}`)
    .join("; ");
}
