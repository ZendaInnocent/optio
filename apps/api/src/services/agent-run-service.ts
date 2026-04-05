import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { agentRuns, AgentRunMode, AgentRunState } from "../db/schema/agent-runs.ts";
import { agentRunEvents } from "../db/schema/agent-run-events.ts";
import { agentRunPrs } from "../db/schema/agent-run-prs.ts";
import {
  agentRunCanTransition as canTransition,
  agentRunTerminalStates as TERMINAL_STATES,
} from "@optio/shared";

export async function createAgentRun(input: {
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

export async function getAgentRun(id: string) {
  const runs = await db.select().from(agentRuns).where(eq(agentRuns.id, id)).limit(1);
  return runs[0];
}

export async function transitionState(
  runId: string,
  newState: AgentRunState,
  ctx: { modeSwitch?: boolean } = {},
) {
  const run = await getAgentRun(runId);
  if (!run) {
    throw new Error("Agent run not found");
  }

  if (!canTransition(run.state, newState, ctx)) {
    throw new Error(`Invalid transition: ${run.state} -> ${newState}`);
  }

  const updated = await db
    .update(agentRuns)
    .set({ state: newState, updatedAt: new Date() })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.state, run.state)))
    .returning();

  if (updated.length === 0) {
    // Another worker changed the state between our read and write
    const current = await getAgentRun(runId);
    if (!current) throw new Error("Agent run not found");
    if (current.state !== run.state) throw new Error("Concurrent state modification detected");
    // If we get here, theoretically unreachable but for safety
    throw new Error("Failed to update state");
  }

  return updated[0];
}

export async function switchMode(runId: string, newMode: AgentRunMode) {
  const run = await getAgentRun(runId);
  if (!run) throw new Error("Agent run not found");

  const updated = await db
    .update(agentRuns)
    .set({ mode: newMode, updatedAt: new Date() })
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.state, run.state)))
    .returning();

  if (!updated || updated.length === 0) {
    const current = await getAgentRun(runId);
    if (!current) throw new Error("Agent run not found");
    if (current.state !== run.state) {
      throw new Error("Concurrent state modification detected - cannot switch mode");
    }
    throw new Error("Failed to update mode");
  }

  return updated[0];
}

export async function recordEvent(runId: string, type: string, content: any, turn?: number) {
  await db.insert(agentRunEvents).values({
    agentRunId: runId,
    type,
    content,
    turn,
  });
}

export async function registerPr(runId: string, prUrl: string, prNumber?: number, title?: string) {
  const run = await getAgentRun(runId);
  if (!run) throw new Error("Agent run not found");
  await db.insert(agentRunPrs).values({
    agentRunId: runId,
    prUrl,
    prNumber,
    title,
    state: "open",
  });
}
