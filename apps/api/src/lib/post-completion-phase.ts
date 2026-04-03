import { TaskContext } from "./task-orchestrator-types.js";
import { getTask } from "../services/task-service.js";
import { releaseRepoPodTask } from "../services/repo-pool-service.js";

export interface PostCompletionResult {
  completed: boolean;
}

export async function runPostCompletion(ctx: TaskContext): Promise<PostCompletionResult> {
  const { taskId, pod, log } = ctx;

  // Get final task state
  const completedTask = await getTask(taskId);

  // If this is a subtask, check if parent should advance
  if (completedTask?.parentTaskId) {
    const { onSubtaskComplete } = await import("../services/subtask-service.js");
    await onSubtaskComplete(taskId).catch((err) =>
      log.warn("Failed to check parent subtask status", err),
    );
  }

  // Handle task dependencies: auto-start dependents or cascade failure
  if (completedTask) {
    const depSvc = await import("../services/dependency-service.js");
    const { COMPLETED, PR_OPENED, FAILED } = await import("@optio/shared").then((m) => ({
      COMPLETED: m.TaskState.COMPLETED,
      PR_OPENED: m.TaskState.PR_OPENED,
      FAILED: m.TaskState.FAILED,
    }));

    if (completedTask.state === COMPLETED || completedTask.state === PR_OPENED) {
      await depSvc
        .onDependencyComplete(taskId)
        .catch((err) => log.warn({ err }, "Failed to process dependency completions"));
    } else if (completedTask.state === FAILED) {
      await depSvc
        .cascadeFailure(taskId)
        .catch((err) => log.warn({ err }, "Failed to cascade failure to dependents"));
    }

    // Update workflow run status if part of a workflow
    if (completedTask.workflowRunId) {
      const { checkWorkflowRunCompletion } = await import("../services/workflow-service.js");
      await checkWorkflowRunCompletion(completedTask.workflowRunId).catch((err) =>
        log.warn({ err }, "Failed to update workflow run status"),
      );
    }
  }

  // Release pod task slot
  if (pod) {
    await releaseRepoPodTask(pod.id).catch((err) =>
      log.warn({ err }, "Failed to release pod task slot"),
    );
  }

  return { completed: true };
}
