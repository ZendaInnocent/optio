import { TaskContext, PhaseError } from "./task-orchestrator-types.js";
import { TaskState } from "@optio/shared";
import { db } from "../db/client.js";
import { tasks } from "../db/schema.js";
import { eq, sql } from "drizzle-orm";
import { getDependencies, areDependenciesMet } from "../services/dependency-service.js";
import { checkExistingPr } from "../services/pr-detection-service.js";
import { validateRequiredSecrets } from "../services/secret-service.js";
import { getAdapter } from "@optio/agent-adapters";

export interface PreflightResult {
  shouldProceed: boolean;
  requeue: boolean;
  requeueReason: string | null;
  failTask: boolean;
  failReason: string | null;
  existingPr: string | null;
  missingSecrets: string[];
}

export async function runPreflight(ctx: TaskContext): Promise<PreflightResult> {
  const { task, repo, log } = ctx;
  const taskId = ctx.taskId;

  // ── Dependency check ──────────────────────────────────────────────
  const deps = await getDependencies(taskId);
  if (deps.length > 0) {
    const anyFailed = deps.some(
      (d) => d.state === TaskState.FAILED || d.state === TaskState.CANCELLED,
    );
    if (anyFailed) {
      return {
        shouldProceed: false,
        requeue: false,
        requeueReason: null,
        failTask: true,
        failReason: "dependency_failed",
        existingPr: null,
        missingSecrets: [],
      };
    }
    const met = await areDependenciesMet(taskId);
    if (!met) {
      return {
        shouldProceed: false,
        requeue: true,
        requeueReason: "dependencies_not_met",
        failTask: false,
        failReason: null,
        existingPr: null,
        missingSecrets: [],
      };
    }
  }

  // ── Global concurrency check ──────────────────────────────────────
  const maxConcurrent = parseInt(process.env.OPTIO_MAX_CONCURRENT ?? "5", 10);
  if (maxConcurrent > 0) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(tasks)
      .where(sql`${tasks.state} IN (${TaskState.PROVISIONING}, ${TaskState.RUNNING})`);
    if (count >= maxConcurrent) {
      log.info("Global concurrency limit reached", { count, maxConcurrent });
      return {
        shouldProceed: false,
        requeue: true,
        requeueReason: "concurrency_limit",
        failTask: false,
        failReason: null,
        existingPr: null,
        missingSecrets: [],
      };
    }
  }

  // ── Off-peak check ────────────────────────────────────────────────
  if (repo.offPeakOnly && !task.ignoreOffPeak) {
    const now = new Date();
    const hour = now.getUTCHours();
    const isOffPeak = hour >= 18 || hour < 6;
    if (!isOffPeak) {
      log.info("Off-peak only repo, skipping during peak hours", { hour });
      return {
        shouldProceed: false,
        requeue: true,
        requeueReason: "offpeak_hold",
        failTask: false,
        failReason: null,
        existingPr: null,
        missingSecrets: [],
      };
    }
  }

  // ── Existing PR check ─────────────────────────────────────────────
  const existingPr = await checkExistingPr(task);
  if (existingPr) {
    log.info("Existing PR detected", { prUrl: existingPr.url });
    return {
      shouldProceed: false,
      requeue: false,
      requeueReason: null,
      failTask: false,
      failReason: null,
      existingPr: existingPr.url,
      missingSecrets: [],
    };
  }

  // ── Secret validation ─────────────────────────────────────────────
  // Use the adapter's validateSecrets to check which secrets are required
  const adapter = getAdapter(task.agentType);
  const availableSecrets: string[] = [];
  const validation = adapter.validateSecrets(availableSecrets);
  if (validation.missing.length > 0) {
    const missingSecrets = await validateRequiredSecrets(
      validation.missing,
      task.repoUrl,
      task.workspaceId,
    );
    if (missingSecrets.length > 0) {
      log.error("Required secrets missing", missingSecrets);
      return {
        shouldProceed: false,
        requeue: false,
        requeueReason: null,
        failTask: false,
        failReason: null,
        existingPr: null,
        missingSecrets,
      };
    }
  }

  return {
    shouldProceed: true,
    requeue: false,
    requeueReason: null,
    failTask: false,
    failReason: null,
    existingPr: null,
    missingSecrets: [],
  };
}
