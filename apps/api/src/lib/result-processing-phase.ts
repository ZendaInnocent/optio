import { TaskContext } from "./task-orchestrator-types.js";
import { TaskState } from "@optio/shared";
import { updateWorktreeState } from "../services/repo-pool-service.js";
import { getTask, transitionTask, updateTaskPr } from "../services/task-service.js";
import { publishEvent } from "../services/event-bus.js";

export interface AgentResult {
  success: boolean;
  summary?: string;
  error?: string;
  prUrl?: string;
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

export interface ResultProcessingResult {
  finalState: TaskState;
}

export async function runResultProcessing(
  ctx: TaskContext,
  agentResult: AgentResult,
): Promise<ResultProcessingResult> {
  const { task, log, taskId, sessionId, prUrl: detectedPrUrl } = ctx;
  const isReviewTask = task.taskType === "review";

  // Pick the best PR URL
  let fallbackPrUrl = agentResult.prUrl;
  if (fallbackPrUrl) {
    const expectedRepo = task.repoUrl
      .replace(/.*github\.com[/:]/, "")
      .replace(/\.git$/, "")
      .toLowerCase();
    const urlRepo = fallbackPrUrl
      .replace(/.*github\.com\//, "")
      .replace(/\/pull\/.*/, "")
      .toLowerCase();
    if (urlRepo !== expectedRepo) {
      fallbackPrUrl = undefined;
    }
  }
  const finalPrUrl = detectedPrUrl || fallbackPrUrl;

  if (!sessionId && !isReviewTask) {
    // Agent never started
    await updateWorktreeState(taskId, "dirty");
    await transitionTask(
      taskId,
      TaskState.FAILED,
      "agent_no_output",
      "Agent process exited without producing any output",
    );
    log.warn("Agent exited without output — no session ID captured");
    return { finalState: TaskState.FAILED };
  }

  if (finalPrUrl && !isReviewTask) {
    // PR exists
    const currentTask = await getTask(taskId);
    if (finalPrUrl !== currentTask?.prUrl) {
      await updateTaskPr(taskId, finalPrUrl);
    }
    await updateWorktreeState(taskId, "preserved");
    await transitionTask(taskId, TaskState.PR_OPENED, "pr_detected", finalPrUrl);
    log.info({ prUrl: finalPrUrl }, "PR opened");
    return { finalState: TaskState.PR_OPENED };
  }

  if (agentResult.success || isReviewTask) {
    await updateWorktreeState(taskId, "removed");
    await transitionTask(taskId, TaskState.COMPLETED, "agent_success", agentResult.summary);
    log.info("Task completed");
    return { finalState: TaskState.COMPLETED };
  }

  // Agent failed
  await updateWorktreeState(taskId, "dirty");
  await transitionTask(taskId, TaskState.FAILED, "agent_failure", agentResult.error);
  log.warn({ error: agentResult.error }, "Task failed");

  // Publish global alert for auth failures
  if (
    agentResult.error &&
    /OAuth token|authentication_failed|token.*expired/i.test(agentResult.error)
  ) {
    await publishEvent({
      type: "auth:failed",
      message:
        "Claude Code OAuth token has expired. Re-authenticate with 'claude auth login' and retry failed tasks.",
      timestamp: new Date().toISOString(),
    });
  }

  return { finalState: TaskState.FAILED };
}
