import { Worker, Job } from "bullmq";
import { sql } from "drizzle-orm";
import { logger } from "../logger.js";
import { getAgentRun, transitionState } from "../services/agent-run-service.js";
import { getOrCreateRepoPod } from "../services/repo-pool-service.js";
import { getRepo } from "../services/repo-service.js";
import { getAdapter } from "@optio/agent-adapters";
import { getRuntime } from "../services/container-service.js";
import { connection, agentRunQueue } from "../lib/queue.js";
import { createClaimLock } from "../lib/claim-lock.js";
import { classifyError } from "@optio/shared";
import type { ContainerHandle } from "@optio/shared";
import { db } from "../db/client.js";
import { agentRuns } from "../db/schema/agent-runs.js";
import { repos } from "../db/schema.js";

const claimLock = createClaimLock();

interface AgentRunJobData {
  agentRunId: string;
}

interface AgentRunAdapterResult {
  sessionId?: string;
  prUrl?: string;
}

interface AgentRunAdapter {
  runOnce(env: Record<string, string>): Promise<AgentRunAdapterResult>;
  runWithMonitoring(
    env: Record<string, string>,
    callbacks: {
      onNeedsAttention: () => Promise<void>;
      onResume: (resumePrompt?: string) => Promise<void>;
    },
  ): Promise<AgentRunAdapterResult>;
}

export class AgentRunWorker {
  private logger = logger.child({ component: "agent-run-worker" });
  private worker: Worker<AgentRunJobData>;

  constructor() {
    this.worker = new Worker<AgentRunJobData>(
      agentRunQueue.name,
      async (job) => this.execute(job),
      {
        connection,
        concurrency: Number(process.env.OPTIO_AGENT_RUN_CONCURRENCY) || 5,
        lockDuration: 60000,
        stalledInterval: 30000,
        maxStalledCount: 3,
      },
    );

    this.worker.on("completed", (job) => {
      if (job) {
        this.logger.info({ jobId: job.id, agentRunId: job.data?.agentRunId }, "Job completed");
      }
    });

    this.worker.on("failed", (job, err) => {
      if (job) {
        this.logger.error({ jobId: job.id, agentRunId: job.data?.agentRunId, err }, "Job failed");
      } else {
        this.logger.error({ err }, "Job failed (no job data)");
      }
    });
  }

  async execute(job: Job<AgentRunJobData>): Promise<{ sessionId?: string; prUrl?: string }> {
    const { agentRunId } = job.data;
    this.logger.info({ agentRunId }, "Processing agent run");

    let result: { sessionId?: string; prUrl?: string } = {};

    await claimLock.acquire(agentRunId, async () => {
      result = await this.processJob(job);
    });

    return result;
  }

  private async processJob(
    job: Job<AgentRunJobData>,
  ): Promise<{ sessionId?: string; prUrl?: string }> {
    const { agentRunId } = job.data;
    let run: any = null;
    let repo: any = null;
    let phase: "preparing" | "provisioning" | "running" = "preparing";

    try {
      run = await getAgentRun(agentRunId);
      if (!run) {
        throw new Error(`Agent run not found: ${agentRunId}`);
      }

      if (run.state !== "queued" && run.state !== "pending") {
        this.logger.info({ agentRunId, state: run.state }, "Skipping — not in queued/pending");
        return { sessionId: run.sessionId, prUrl: run.prUrl };
      }

      repo = await getRepo(run.repoId);
      if (!repo) {
        throw new Error(`Repo not found: ${run.repoId}`);
      }

      const globalMax = Number(process.env.OPTIO_MAX_CONCURRENT ?? "5");
      const [{ count: globalActive }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentRuns)
        .where(sql`${agentRuns.state} IN ('provisioning', 'running')`);
      if (Number(globalActive) >= globalMax) {
        this.logger.info({ globalActive, globalMax }, "Global concurrency saturated");
        await this.requeueJob(job, 10000 + Math.floor(Math.random() * 5000));
        return { sessionId: run.sessionId, prUrl: run.prUrl };
      }

      const maxAgentsPerPod = repo.maxAgentsPerPod ?? 2;
      const maxPodInstances = repo.maxPodInstances ?? 1;
      const effectiveRepoConcurrency = maxAgentsPerPod * maxPodInstances;
      const repoMax = repo.maxConcurrentTasks
        ? Math.min(repo.maxConcurrentTasks, effectiveRepoConcurrency)
        : effectiveRepoConcurrency;

      const [{ count: repoActive }] = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentRuns)
        .where(
          sql`${agentRuns.repoId} = ${run.repoId} AND ${agentRuns.state} IN ('provisioning', 'running')`,
        );

      if (Number(repoActive) >= repoMax) {
        this.logger.info({ repoActive, repoMax, repoId: run.repoId }, "Repo concurrency saturated");
        await this.requeueJob(job, 10000 + Math.floor(Math.random() * 5000));
        return { sessionId: run.sessionId, prUrl: run.prUrl };
      }

      await transitionState(agentRunId, "provisioning");
      phase = "provisioning";

      const pod = await getOrCreateRepoPod(
        repo.repoUrl,
        repo.defaultBranch,
        {},
        { customImage: run.agentType },
      );

      const branchName = `optio/agent-run/${run.id}`;
      const worktreePath = `/worktrees/${run.id}`;
      await this.execInPod(
        pod,
        `git worktree add ${worktreePath} ${branchName} 2>/dev/null || true`,
      );

      await transitionState(agentRunId, "running");
      phase = "running";

      const adapter = getAdapter(run.agentType) as unknown as AgentRunAdapter;
      const result = await this.executeMode(run, repo, pod, worktreePath, adapter);

      await transitionState(agentRunId, "completed");
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const classification = classifyError(errMsg);
      this.logger.error({ error, agentRunId }, "Agent run error");

      if (classification.retryable && phase !== "running") {
        this.logger.info({ agentRunId }, "Retryable error during provisioning, re-queuing");
        try {
          await transitionState(agentRunId, "failed");
        } catch (e) {}
        try {
          await transitionState(agentRunId, "queued");
        } catch (e) {}
        await this.requeueJob(job, 15000 + Math.floor(Math.random() * 5000));
        return { sessionId: run?.sessionId, prUrl: run?.prUrl };
      } else {
        await transitionState(agentRunId, "failed");
        throw error;
      }
    }
  }

  private async execInPod(pod: any, command: string): Promise<void> {
    const rt = getRuntime();
    const handle: ContainerHandle = {
      id: pod.podId ?? pod.podName,
      name: pod.podName,
    };
    await rt.exec(handle, ["bash", "-c", command], {});
  }

  private async executeMode(
    run: any,
    repo: any,
    pod: any,
    worktreePath: string,
    adapter: AgentRunAdapter,
  ): Promise<{ sessionId?: string; prUrl?: string }> {
    const env: Record<string, string> = {
      OPTIO_PROMPT: run.initialPrompt,
      OPTIO_AGENT_TYPE: run.agentType,
      OPTIO_MODEL: run.model ?? "",
      OPTIO_SESSION_ID: run.sessionId ?? "",
      OPTIO_WORKTREE: worktreePath,
      OPTIO_REPO_URL: repo.repoUrl,
      OPTIO_REPO_BRANCH: repo.defaultBranch,
      OPTIO_BRANCH_NAME: `optio/agent-run/${run.id}`,
    };

    switch (run.mode) {
      case "autonomous":
        return this.executeAutonomous(env, adapter);
      case "supervised":
        return this.executeSupervised(run, env, adapter);
      case "interactive":
        throw new Error("Interactive mode not processed by worker");
      default:
        throw new Error(`Unknown mode: ${run.mode}`);
    }
  }

  private async executeAutonomous(
    env: Record<string, string>,
    adapter: AgentRunAdapter,
  ): Promise<{ sessionId?: string; prUrl?: string }> {
    const result = await adapter.runOnce(env);
    return result;
  }

  private async executeSupervised(
    run: any,
    env: Record<string, string>,
    adapter: AgentRunAdapter,
  ): Promise<{ sessionId?: string; prUrl?: string }> {
    const result = await adapter.runWithMonitoring(env, {
      onNeedsAttention: async () => {
        await transitionState(run.id, "needs_attention");
      },
      onResume: async (resumePrompt?: string) => {
        await transitionState(run.id, "running");
      },
    });
    return result;
  }

  private async requeueJob(job: Job<AgentRunJobData>, delayMs: number): Promise<void> {
    const jitter = Math.floor(Math.random() * 5000);
    await agentRunQueue.add(job.name || "process-agent-run", job.data, {
      jobId: `${job.data.agentRunId}-retry-${Date.now()}`,
      priority: job.priority ?? 100,
      delay: delayMs + jitter,
    });
  }
}

export const agentRunWorker = new AgentRunWorker();
