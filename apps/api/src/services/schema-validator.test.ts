import { describe, it, expect } from "vitest";
import { TABLE_COLUMNS } from "./schema-validator.js";

describe("schema-validator columns configuration", () => {
  it("includes all core tables with required columns", () => {
    // tasks table should exist and include critical columns
    expect(TABLE_COLUMNS).toHaveProperty("tasks");
    expect(TABLE_COLUMNS.tasks).toContain("workflow_type");
    expect(TABLE_COLUMNS.tasks).toContain("agent_type");
    expect(TABLE_COLUMNS.tasks).toContain("repo_url");

    // workspace_members should include can_build
    expect(TABLE_COLUMNS).toHaveProperty("workspace_members");
    expect(TABLE_COLUMNS.workspace_members).toContain("can_build");

    // repo_pods should include active_task_count
    expect(TABLE_COLUMNS).toHaveProperty("repo_pods");
    expect(TABLE_COLUMNS.repo_pods).toContain("active_task_count");
  });
});
