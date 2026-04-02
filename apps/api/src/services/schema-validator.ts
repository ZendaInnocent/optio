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
];

const TABLE_COLUMNS: Record<string, string[]> = {
  interactive_sessions: [
    "id",
    "repo_url",
    "user_id",
    "worktree_path",
    "branch",
    "state",
    "pod_id",
    "agent_type",
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

async function checkTableExists(tableName: string): Promise<boolean> {
  try {
    const result = await db.execute<{ exists: boolean }>(
      sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}) as exists`,
    );
    return result[0]?.exists ?? false;
  } catch {
    return false;
  }
}

async function checkColumnExists(tableName: string, columnName: string): Promise<boolean> {
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
