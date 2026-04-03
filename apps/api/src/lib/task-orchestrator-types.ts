import type { Task } from "@optio/shared";
import type { RepoPod } from "../services/repo-pool-service.js";
import type { RepoRecord } from "../services/repo-service.js";

/**
 * Phase identifiers for the task orchestration pipeline.
 * Each phase is a distinct step that can succeed, fail, or be retried.
 */
export type Phase =
  | "claim"
  | "preflight"
  | "prepare"
  | "provisioning"
  | "execution"
  | "result-processing"
  | "post-completion";

/**
 * Holds all mutable state for a single task execution lifecycle.
 * Phases read from and write to this context instead of passing
 * parameters through a 900-line function.
 */
export interface TaskContext {
  taskId: string;
  log: {
    info: (msg: string, ...args: unknown[]) => void;
    warn: (msg: string, ...args: unknown[]) => void;
    error: (msg: string, ...args: unknown[]) => void;
    debug: (msg: string, ...args: unknown[]) => void;
    child: (bindings: Record<string, unknown>) => TaskContext["log"];
  };
  task: Task;
  repo: RepoRecord;
  pod: RepoPod | null;
  agentImage: string;
  secrets: Record<string, string>;
  sessionId: string | null;
  prUrl: string | null;
  agentExitCode: number | null;
  agentError: Error | null;
  agentResult: string | null;
}

/**
 * Error thrown when a pipeline phase fails.
 * The `retryable` flag tells the orchestrator whether the task
 * should be re-queued or transitioned to FAILED.
 */
export class PhaseError extends Error {
  constructor(
    public readonly phase: Phase,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "PhaseError";
  }
}
