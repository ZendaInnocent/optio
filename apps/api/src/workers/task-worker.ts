import { Worker, Queue } from "bullmq";
import { TaskState, msUntilOffPeak } from "@optio/shared";
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import * as taskService from "../services/task-service.js";
import * as repoPool from "../services/repo-pool-service.js";
import { publishEvent } from "../services/event-bus.js";
import { getRepoByUrl } from "../services/repo-service.js";
import { logger } from "../logger.js";
import { createClaimLock } from "../lib/claim-lock.js";
import { runPreflight } from "../lib/preflight-phase.js";
import { runPrepare } from "../lib/prepare-phase.js";
import { runProvisioning } from "../lib/provisioning-phase.js";
import { runExecution } from "../lib/execution-phase.js";
import { runResultProcessing } from "../lib/result-processing-phase.js";
import { runPostCompletion } from "../lib/post-completion-phase.js";
import type { TaskContext } from "../lib/task-orchestrator-types.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const connectionOpts = { url: redisUrl, maxRetriesPerRequest: null };

export const taskQueue = new Queue("tasks", { connection: connectionOpts });

const claimLock = createClaimLock();

export class TaskOrchestrator {
  async execute(job: {
    id: string;
    data: {
      taskId: string;
      resumeSessionId?: string;
      resumePrompt?: string;
      restartFromBranch?: boolean;
      reviewOverride?: {
        renderedPrompt: string;
        taskFileContent: string;
        taskFilePath: string;
        claudeModel?: string;
      };
    };
  }): Promise<void> {
    const { taskId, resumeSessionId, resumePrompt, restartFromBranch, reviewOverride } = job.data;
    const log = logger.child({ taskId, jobId: job.id });

    await claimLock.acquire(taskId, async () => {
      // Verify task is in queued state
      const currentTask = await taskService.getTask(taskId);
      if (!currentTask || currentTask.state !== TaskState.QUEUED) {
        log.info({ state: currentTask?.state }, "Skipping — task is not in queued state");
        return;
      }

      const taskWorkspaceId = currentTask.workspaceId ?? null;

      // Get repo config for off-peak check
      const repoConfig = await getRepoByUrl(currentTask.repoUrl, taskWorkspaceId);

      // Off-peak hold check
      if (repoConfig?.offPeakOnly && !currentTask.ignoreOffPeak) {
        const delayMs = msUntilOffPeak();
        if (delayMs > 0) {
          log.info({ delayMs }, "Off-peak only — holding task until off-peak window");
          await db.update(tasks).set({ updatedAt: new Date() }).where(eq(tasks.id, taskId));
          await taskQueue.add("process-task", job.data, {
            jobId: `${taskId}-offpeak-${Date.now()}`,
            priority: currentTask.priority ?? 100,
            delay: delayMs,
          });
          publishEvent({
            type: "task:pending_reason",
            taskId,
            data: { pendingReason: "waiting_for_off_peak" },
          });
          return;
        }
      }

      // Concurrency check + claim
      const maxAgentsPerPod = repoConfig?.maxAgentsPerPod ?? 2;
      const maxPodInstances = repoConfig?.maxPodInstances ?? 1;
      const effectiveRepoConcurrency = maxAgentsPerPod * maxPodInstances;

      const claimed = await this.checkAndClaim(
        taskId,
        currentTask,
        effectiveRepoConcurrency,
        repoConfig,
        log,
      );

      if (!claimed) {
        const jitter = Math.floor(Math.random() * 5000);
        await taskQueue.add("process-task", job.data, {
          jobId: `${taskId}-delayed-${Date.now()}`,
          priority: currentTask.priority ?? 100,
          delay: 10000 + jitter,
        });
        return;
      }

      log.info("Provisioning");

      // Build task context
      const task = await taskService.getTask(taskId);
      if (!task) throw new Error(`Task not found: ${taskId}`);

      const repo = repoConfig ?? (await getRepoByUrl(task.repoUrl, taskWorkspaceId));
      if (!repo) throw new Error(`Repo not found: ${task.repoUrl}`);

      const ctx: TaskContext = {
        taskId,
        log,
        task,
        repo,
        pod: null,
        agentImage: "optio/agent:latest",
        secrets: {},
        sessionId: null,
        prUrl: null,
        agentExitCode: null,
        agentError: null,
        agentResult: null,
      };

      // Pre-flight checks
      const preflight = await runPreflight(ctx);
      if (!preflight.shouldProceed) {
        if (preflight.failTask) {
          await taskService.transitionTask(
            taskId,
            TaskState.FAILED,
            preflight.failReason ?? "preflight_failed",
            "Pre-flight check failed",
          );
          return;
        }
        if (preflight.existingPr) {
          await taskService.updateTaskPr(taskId, preflight.existingPr);
          await taskService.transitionTask(
            taskId,
            TaskState.PR_OPENED,
            "existing_pr_detected",
            preflight.existingPr,
          );
          return;
        }
        if (preflight.missingSecrets.length > 0) {
          await taskService.transitionTask(
            taskId,
            TaskState.NEEDS_ATTENTION,
            "missing_secrets",
            `Missing required secrets: ${preflight.missingSecrets.join(", ")}. Please add them in Settings → Secrets.`,
          );
          return;
        }
        if (preflight.requeue) {
          const jitter = Math.floor(Math.random() * 5000);
          await taskQueue.add("process-task", job.data, {
            jobId: `${taskId}-${preflight.requeueReason}-${Date.now()}`,
            priority: task.priority ?? 100,
            delay: 15000 + jitter,
          });
          return;
        }
        return;
      }

      // Prepare phase
      const prepare = await runPrepare(ctx);
      if (!prepare.success) {
        log.error({ error: prepare.error }, "Preparation failed");
        await taskService.transitionTask(
          taskId,
          TaskState.FAILED,
          "prepare_failed",
          prepare.error ?? "Unknown preparation error",
        );
        return;
      }

      // Provisioning phase
      const provisioning = await runProvisioning(ctx);
      if (!provisioning.success) {
        log.warn({ error: provisioning.error }, "Pod provisioning failed, re-queuing task");
        await taskService.updateTaskResult(taskId, undefined, provisioning.error);
        await taskService.transitionTask(
          taskId,
          TaskState.QUEUED,
          "provisioning_retry",
          provisioning.error ?? "Unknown provisioning error",
        );
        const jitter = Math.floor(Math.random() * 5000);
        await taskQueue.add("process-task", job.data, {
          jobId: `${taskId}-provisioning_retry-${Date.now()}`,
          priority: task.priority ?? 100,
          delay: 10000 + jitter,
        });
        return;
      }

      // Execution phase
      const execution = await runExecution(ctx);
      if (execution.stateChanged) {
        return;
      }
      if (!execution.success) {
        // No session ID = agent never started
        await repoPool.updateWorktreeState(taskId, "dirty");
        await taskService.transitionTask(
          taskId,
          TaskState.FAILED,
          "agent_no_output",
          execution.error ?? "Agent produced no output",
        );
        log.warn("Agent exited without output");
        await runPostCompletion(ctx);
        return;
      }

      // Result processing phase
      const agentResult = {
        success: !ctx.agentError,
        summary: ctx.agentResult ?? undefined,
        error: ctx.agentError?.message,
        prUrl: ctx.prUrl ?? undefined,
      };
      const resultProcessing = await runResultProcessing(ctx, agentResult);

      // Post-completion phase
      await runPostCompletion(ctx);

      log.info({ finalState: resultProcessing.finalState }, "Task orchestration complete");
    });
  }

  private async checkAndClaim(
    taskId: string,
    task: { repoUrl: string; priority?: number | null; workspaceId?: string | null },
    effectiveRepoConcurrency: number,
    repoConfig: { maxConcurrentTasks?: number } | null,
    log: ReturnType<typeof logger.child>,
  ): Promise<boolean> {
    const globalMax = parseInt(process.env.OPTIO_MAX_CONCURRENT ?? "5", 10);

    const [{ count: activeCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(sql`${tasks.state} IN ('provisioning', 'running')`);

    if (Number(activeCount) >= globalMax) {
      log.info({ activeCount, globalMax }, "Global concurrency saturated, re-scheduling");
      return false;
    }

    const repoMax = repoConfig?.maxConcurrentTasks
      ? Math.min(repoConfig.maxConcurrentTasks, effectiveRepoConcurrency)
      : effectiveRepoConcurrency;

    const [{ count: repoCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(
        sql`${tasks.repoUrl} = ${task.repoUrl} AND ${tasks.state} IN ('provisioning', 'running')`,
      );

    if (Number(repoCount) >= repoMax) {
      log.info(
        { repoActiveCount: repoCount, max: repoMax },
        "Repo concurrency saturated, re-scheduling",
      );
      return false;
    }

    return taskService.tryTransitionTask(taskId, TaskState.PROVISIONING, "worker_pickup");
  }
}

export function startTaskWorker() {
  const orchestrator = new TaskOrchestrator();

  const worker = new Worker("tasks", async (job) => orchestrator.execute(job as any), {
    connection: connectionOpts,
    concurrency: parseInt(process.env.OPTIO_MAX_CONCURRENT ?? "5", 10),
    lockDuration: 600_000,
    stalledInterval: 300_000,
    maxStalledCount: 3,
  });

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Job failed");
  });

  worker.on("completed", (job) => {
    logger.info({ jobId: job.id }, "Job completed");
  });

  return worker;
}

export { reconcileOrphanedTasks } from "../lib/startup-reconciler.js";
