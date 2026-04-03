import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { TaskState } from "@optio/shared";
import { transitionTask, updateTaskPr } from "../services/task-service.js";
import { checkExistingPr } from "../services/pr-detection-service.js";
import { logger } from "../logger.js";
import { Queue } from "bullmq";

const taskQueue = new Queue("process-task", {
  connection: { url: process.env.REDIS_URL ?? "redis://localhost:6379" },
});

export async function reconcileOrphanedTasks() {
  // Drain all BullMQ jobs from the previous worker instance
  try {
    await taskQueue.obliterate({ force: true });
    logger.info("Obliterated stale task queue from previous worker");
  } catch (err) {
    logger.warn({ err }, "Failed to obliterate stale task queue");
  }

  const orphanedQueued = await db
    .select()
    .from(tasks)
    .where(eq(tasks.state, "queued" as any));
  const orphanedProvisioning = await db
    .select()
    .from(tasks)
    .where(eq(tasks.state, "provisioning" as any));
  const orphanedRunning = await db
    .select()
    .from(tasks)
    .where(eq(tasks.state, "running" as any));

  // Provisioning/running tasks lost their exec session
  for (const task of [...orphanedProvisioning, ...orphanedRunning]) {
    const taskWsId = (task as any).workspaceId ?? null;
    const isReview = (task as any).taskType === "review";
    let existingPr = null;
    if (!isReview) {
      try {
        existingPr = await checkExistingPr(task.repoUrl, task.id, taskWsId);
      } catch {
        // Non-fatal — fall through to fail + re-queue
      }
    }

    if (existingPr && task.state === "running") {
      logger.info(
        { taskId: task.id, prUrl: existingPr.url },
        "Existing PR found during reconciliation",
      );
      await updateTaskPr(task.id, existingPr.url);
      await transitionTask(task.id, TaskState.PR_OPENED, "startup_reconcile", existingPr.url);
    } else if (existingPr && task.state === "provisioning") {
      await transitionTask(
        task.id,
        TaskState.FAILED,
        "startup_reconcile",
        "Task was provisioning but PR already exists",
      );
    } else {
      await transitionTask(
        task.id,
        TaskState.FAILED,
        "startup_reconcile",
        "Task was orphaned during execution",
      );
    }
  }

  // Re-queue orphaned queued tasks
  for (const task of orphanedQueued) {
    await taskQueue.add(
      "process-task",
      { taskId: task.id },
      { jobId: `${task.id}-orphan-${Date.now()}` },
    );
    logger.info({ taskId: task.id }, "Re-queued orphaned task");
  }
}
