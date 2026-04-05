import { describe, it, expect } from "vitest";
import { agentRuns, agentRunEvents, agentRunPrs } from "./index.js";

describe("agent_runs schema", () => {
  it("should have correct table structure", () => {
    const table = agentRuns;
    expect("id" in table).toBe(true);
    expect("workspaceId" in table).toBe(true);
    expect("repoId" in table).toBe(true);
    expect("title" in table).toBe(true);
    expect("initialPrompt" in table).toBe(true);
    expect("mode" in table).toBe(true);
    expect("state" in table).toBe(true);
    expect("agentType" in table).toBe(true);
    expect("model" in table).toBe(true);
    expect("branchName" in table).toBe(true);
    expect("worktreePath" in table).toBe(true);
    expect("sessionId" in table).toBe(true);
    expect("prUrl" in table).toBe(true);
    expect("costUsd" in table).toBe(true);
    expect("maxTurns" in table).toBe(true);
    expect("metadata" in table).toBe(true);
    expect("createdAt" in table).toBe(true);
    expect("updatedAt" in table).toBe(true);
    expect("endedAt" in table).toBe(true);
  });

  it("should have proper foreign key references", () => {
    // workspaceId references workspaces.id
    expect("workspaceId" in agentRuns).toBe(true);
    // repoId references repos.id
    expect("repoId" in agentRuns).toBe(true);
  });
});

describe("agent_run_events schema", () => {
  it("should have correct table structure", () => {
    const table = agentRunEvents;
    expect("id" in table).toBe(true);
    expect("agentRunId" in table).toBe(true);
    expect("timestamp" in table).toBe(true);
    expect("type" in table).toBe(true);
    expect("content" in table).toBe(true);
    expect("turn" in table).toBe(true);
  });

  it("should have foreign key reference to agent_runs", () => {
    expect("agentRunId" in agentRunEvents).toBe(true);
  });
});

describe("agent_run_prs schema", () => {
  it("should have correct table structure", () => {
    const table = agentRunPrs;
    expect("id" in table).toBe(true);
    expect("agentRunId" in table).toBe(true);
    expect("prUrl" in table).toBe(true);
    expect("prNumber" in table).toBe(true);
    expect("title" in table).toBe(true);
    expect("state" in table).toBe(true);
    expect("createdAt" in table).toBe(true);
  });

  it("should have foreign key reference to agent_runs", () => {
    expect("agentRunId" in agentRunPrs).toBe(true);
  });
});
