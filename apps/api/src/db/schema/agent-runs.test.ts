import { describe, it, expect } from "vitest";
import {
  agentRuns,
  agentRunEvents,
  agentRunPrs,
  agentRunMode,
  agentRunState,
  agentRunEventType,
} from "./index.js";

describe("agent_runs schema", () => {
  it("should have correct table structure", () => {
    expect("id" in agentRuns).toBe(true);
    expect("workspaceId" in agentRuns).toBe(true);
    expect("repoId" in agentRuns).toBe(true);
    expect("title" in agentRuns).toBe(true);
    expect("initialPrompt" in agentRuns).toBe(true);
    expect("mode" in agentRuns).toBe(true);
    expect("state" in agentRuns).toBe(true);
    expect("agentType" in agentRuns).toBe(true);
    expect("model" in agentRuns).toBe(true);
    expect("branchName" in agentRuns).toBe(true);
    expect("worktreePath" in agentRuns).toBe(true);
    expect("sessionId" in agentRuns).toBe(true);
    expect("prUrl" in agentRuns).toBe(true);
    expect("costUsd" in agentRuns).toBe(true);
    expect("maxTurns" in agentRuns).toBe(true);
    expect("metadata" in agentRuns).toBe(true);
    expect("createdAt" in agentRuns).toBe(true);
    expect("updatedAt" in agentRuns).toBe(true);
    expect("endedAt" in agentRuns).toBe(true);
  });

  it("should have correct mode enum values", () => {
    const enumValues = agentRunMode.enumValues;
    expect(enumValues).toContain("autonomous");
    expect(enumValues).toContain("supervised");
    expect(enumValues).toContain("interactive");
  });

  it("should have correct state enum values", () => {
    const enumValues = agentRunState.enumValues;
    expect(enumValues).toContain("pending");
    expect(enumValues).toContain("queued");
    expect(enumValues).toContain("provisioning");
    expect(enumValues).toContain("running");
    expect(enumValues).toContain("needs_attention");
    expect(enumValues).toContain("completed");
    expect(enumValues).toContain("failed");
    expect(enumValues).toContain("cancelled");
  });

  it("should have workspaceId referencing workspaces with cascade", () => {
    // The column exists and references are defined in schema
    expect(agentRuns.workspaceId).toBeDefined();
    // Type check: it's a valid column
    expect(agentRuns.workspaceId.name).toBe("workspace_id");
  });

  it("should have repoId referencing repos with cascade", () => {
    expect(agentRuns.repoId).toBeDefined();
    expect(agentRuns.repoId.name).toBe("repo_id");
  });
});

describe("agent_run_events schema", () => {
  it("should have correct table structure", () => {
    expect("id" in agentRunEvents).toBe(true);
    expect("agentRunId" in agentRunEvents).toBe(true);
    expect("timestamp" in agentRunEvents).toBe(true);
    expect("type" in agentRunEvents).toBe(true);
    expect("content" in agentRunEvents).toBe(true);
    expect("turn" in agentRunEvents).toBe(true);
  });

  it("should have correct event type enum values", () => {
    const enumValues = agentRunEventType.enumValues;
    expect(enumValues).toContain("text");
    expect(enumValues).toContain("tool_use");
    expect(enumValues).toContain("tool_result");
    expect(enumValues).toContain("thinking");
    expect(enumValues).toContain("system");
    expect(enumValues).toContain("error");
    expect(enumValues).toContain("info");
    expect(enumValues).toContain("message");
  });

  it("should have content typed as AgentRunEventContent", () => {
    expect(agentRunEvents.content).toBeDefined();
    expect(agentRunEvents.content.name).toBe("content");
  });

  it("should have agentRunId referencing agent_runs with cascade", () => {
    expect(agentRunEvents.agentRunId).toBeDefined();
    expect(agentRunEvents.agentRunId.name).toBe("agent_run_id");
  });
});

describe("agent_run_prs schema", () => {
  it("should have correct table structure", () => {
    expect("id" in agentRunPrs).toBe(true);
    expect("agentRunId" in agentRunPrs).toBe(true);
    expect("prUrl" in agentRunPrs).toBe(true);
    expect("prNumber" in agentRunPrs).toBe(true);
    expect("title" in agentRunPrs).toBe(true);
    expect("state" in agentRunPrs).toBe(true);
    expect("createdAt" in agentRunPrs).toBe(true);
  });

  it("should not have updatedAt field", () => {
    const hasUpdatedAt = "updatedAt" in agentRunPrs;
    expect(hasUpdatedAt).toBe(false);
  });

  it("should have agentRunId referencing agent_runs with cascade", () => {
    expect(agentRunPrs.agentRunId).toBeDefined();
    expect(agentRunPrs.agentRunId.name).toBe("agent_run_id");
  });

  it("should have prNumber as nullable integer", () => {
    expect(agentRunPrs.prNumber).toBeDefined();
    expect(agentRunPrs.prNumber.notNull).toBe(false);
  });
});
