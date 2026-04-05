import { TaskContext } from "./task-orchestrator-types.js";
import { TaskState } from "@optio/shared";
import { getAdapter } from "@optio/agent-adapters";
import { execTaskInRepoPod, updateWorktreeState } from "../services/repo-pool-service.js";
import {
  getTask,
  updateTaskSession,
  appendTaskLog,
  updateTaskPr,
  updateTaskResult,
  touchTaskHeartbeat,
} from "../services/task-service.js";

export interface ExecutionResult {
  success: boolean;
  error?: string;
  stateChanged?: boolean;
}

export async function runExecution(ctx: TaskContext): Promise<ExecutionResult> {
  const { task, repo, pod, log, taskId } = ctx;

  if (!pod) {
    return { success: false, error: "No pod available for execution" };
  }

  // Build agent command
  const adapter = getAdapter(task.agentType);
  const isReview = task.workflowType === "review";
  const maxTurns = isReview ? (repo.maxTurnsReview ?? 10) : (repo.maxTurnsCoding ?? 250);

  const env: Record<string, string> = {
    ...ctx.secrets,
    OPTIO_TASK_ID: task.id,
    OPTIO_REPO_URL: task.repoUrl,
    OPTIO_REPO_BRANCH: task.repoBranch,
    OPTIO_PROMPT: task.prompt,
    OPTIO_AGENT_TYPE: task.agentType,
    OPTIO_BRANCH_NAME: `optio-${task.id}`,
    OPTIO_AUTH_MODE: "api-key",
  };

  const agentCommand = adapter.buildAgentCommand(env, {
    isReview,
    maxTurnsCoding: !isReview ? maxTurns : undefined,
    maxTurnsReview: isReview ? maxTurns : undefined,
    resumeSessionId: ctx.sessionId ?? undefined,
    resumePrompt: ctx.resumePrompt,
  });

  // Execute in repo pod
  const isRetry = (task.retryCount ?? 0) > 0;
  const shouldResetWorktree = isRetry && pod.id === (task as any).lastPodId;
  const execSession = await execTaskInRepoPod(pod, task.id, agentCommand, ctx.secrets, {
    resetWorktree: shouldResetWorktree,
  });

  // Stream stdout
  let allLogs = "";
  let lastHeartbeat = Date.now();
  const HEARTBEAT_INTERVAL_MS = 60_000;

  for await (const chunk of execSession.stdout as AsyncIterable<Buffer>) {
    const text = chunk.toString();
    allLogs += text;

    // Heartbeat
    const now = Date.now();
    if (now - lastHeartbeat > HEARTBEAT_INTERVAL_MS) {
      await touchTaskHeartbeat(taskId);
      lastHeartbeat = now;
    }

    // Parse lines
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;

      const parsed = adapter.parseEvent(line, taskId);
      if (parsed.sessionId && !ctx.sessionId) {
        ctx.sessionId = parsed.sessionId;
        await updateTaskSession(taskId, parsed.sessionId);
        log.info("Session ID captured", { sessionId: parsed.sessionId });
      }
      for (const entry of parsed.entries) {
        await appendTaskLog(taskId, entry.content, "stdout", entry.type, entry.metadata);

        // Detect PR URL matching task's repo
        if (!ctx.prUrl) {
          const prUrlPattern = /https:\/\/github\.com\/[^\s"]+\/pull\/\d+/g;
          const prMatches = entry.content.match(prUrlPattern);
          if (prMatches) {
            const expectedRepo = task.repoUrl
              .replace(/.*github\.com[/:]/, "")
              .replace(/\.git$/, "")
              .toLowerCase();
            const repoMatches = prMatches.filter((url) => {
              const urlRepo = url
                .replace(/.*github\.com\//, "")
                .replace(/\/pull\/.*/, "")
                .toLowerCase();
              return urlRepo === expectedRepo;
            });
            if (repoMatches.length > 0) {
              const url = repoMatches[repoMatches.length - 1];
              ctx.prUrl = url;
              await updateTaskPr(taskId, url);
              log.info("PR URL detected in logs", { prUrl: url });
            }
          }
        }
      }
    }
  }

  // Check if task state changed during execution
  const taskAfterExec = await getTask(taskId);
  if (!taskAfterExec || taskAfterExec.state !== TaskState.RUNNING) {
    log.info(
      { currentState: taskAfterExec?.state },
      "Task state changed during execution — skipping final transition",
    );
    return { success: true, stateChanged: true };
  }

  // No output = failure
  if (!allLogs.trim()) {
    return { success: false, error: "Agent produced no output" };
  }

  // Parse result
  const inferredExitCode = adapter.inferExitCode(allLogs);
  const result = adapter.parseResult(inferredExitCode, allLogs);
  await updateTaskResult(taskId, result.summary, result.error);

  ctx.agentExitCode = inferredExitCode;
  ctx.agentError = result.error ? new Error(result.error) : null;
  ctx.agentResult = result.summary;

  log.info("Agent execution complete", { exitCode: inferredExitCode, summary: result.summary });
  return { success: true };
}
