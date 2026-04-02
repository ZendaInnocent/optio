import type { ThreadEvent } from "../repository.js";
import { threadRepository } from "../repository.js";

export interface HandlerContext {
  threadId: string;
  event: ThreadEvent;
}

export interface HandlerResult {
  success: boolean;
  nextEvent?: string;
  state?: Record<string, unknown>;
  error?: string;
}

const PHASE_TRANSITIONS: Record<string, string | null> = {
  explore: "implement",
  implement: "verify",
  verify: "commit",
  commit: null,
};

export async function handleThreadStarted(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId, event } = ctx;
  const payload = event.payload as { phase?: string };

  await threadRepository.updateThreadStatus(threadId, "running", payload.phase ?? "explore");

  return {
    success: true,
    nextEvent: "PhaseStarted",
    state: {
      phase: payload.phase ?? "explore",
      tasks: [],
      currentTaskIndex: 0,
      context: {},
      checkpoints: [],
    },
  };
}

export async function handlePhaseStarted(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId, event } = ctx;
  const payload = event.payload as {
    phase: string;
    tasks: Array<{ id: string; description: string }>;
  };

  await threadRepository.updateThreadStatus(threadId, "running", payload.phase);

  const state = {
    phase: payload.phase,
    tasks: payload.tasks,
    currentTaskIndex: 0,
    context: {},
    checkpoints: [],
  };

  await threadRepository.createSnapshot(threadId, payload.phase, state);

  return {
    success: true,
    state,
  };
}

export async function handleTaskStarted(ctx: HandlerContext): Promise<HandlerResult> {
  const { event } = ctx;
  const payload = event.payload as { taskId: string };

  return {
    success: true,
    state: {
      currentTask: payload.taskId,
    },
  };
}

export async function handleTestPassed(ctx: HandlerContext): Promise<HandlerResult> {
  return {
    success: true,
  };
}

export async function handleCheckFailed(ctx: HandlerContext): Promise<HandlerResult> {
  const { event } = ctx;
  const payload = event.payload as { checkType: string; attempt?: number };

  const attempt = payload.attempt ?? 1;
  const maxAttempts = 3;

  if (attempt < maxAttempts) {
    return {
      success: false,
      nextEvent: "CheckRetrying",
      error: `Check ${payload.checkType} failed on attempt ${attempt}, will retry`,
    };
  }

  return {
    success: false,
    error: `Check ${payload.checkType} failed after ${maxAttempts} attempts`,
  };
}

export async function handleCheckRetrying(ctx: HandlerContext): Promise<HandlerResult> {
  return {
    success: true,
  };
}

export async function handleTaskCompleted(ctx: HandlerContext): Promise<HandlerResult> {
  const { event } = ctx;
  const payload = event.payload as { taskId: string };

  return {
    success: true,
    state: {
      completedTask: payload.taskId,
    },
  };
}

export async function handlePhaseCompleted(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId, event } = ctx;
  const payload = event.payload as { phase: string };

  const currentPhase = payload.phase;
  const nextPhase = PHASE_TRANSITIONS[currentPhase] ?? null;

  if (nextPhase) {
    await threadRepository.updateThreadStatus(threadId, "running", nextPhase);
    return {
      success: true,
      nextEvent: "PhaseStarted",
      state: { phase: nextPhase },
    };
  }

  await threadRepository.updateThreadStatus(threadId, "completed");

  return {
    success: true,
    state: { phase: null },
  };
}

export async function handleCommitCreated(ctx: HandlerContext): Promise<HandlerResult> {
  return {
    success: true,
    state: {
      lastCommit: (ctx.event.payload as { sha: string }).sha,
    },
  };
}

export async function handleThreadPaused(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId, event } = ctx;
  const payload = event.payload as { reason: string; checkpointIndex?: number };

  await threadRepository.updateThreadStatus(threadId, "paused");

  const currentPhase = await threadRepository.getThread(threadId);
  const state = await threadRepository.restoreSnapshot(threadId);

  if (state) {
    await threadRepository.createSnapshot(threadId, currentPhase?.currentPhase ?? "unknown", state);
  }

  return {
    success: true,
    state: { pauseReason: payload.reason },
  };
}

export async function handleThreadResumed(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId } = ctx;

  await threadRepository.updateThreadStatus(threadId, "running");

  return {
    success: true,
  };
}

export async function handleThreadForked(ctx: HandlerContext): Promise<HandlerResult> {
  const { event } = ctx;
  const payload = event.payload as { newThreadId: string };

  return {
    success: true,
    state: { forkedTo: payload.newThreadId },
  };
}

export async function handleThreadCompleted(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId } = ctx;

  await threadRepository.updateThreadStatus(threadId, "completed");

  return {
    success: true,
  };
}

export async function handleThreadFailed(ctx: HandlerContext): Promise<HandlerResult> {
  const { threadId, event } = ctx;
  const payload = event.payload as { lastPhase: string; error: string };

  await threadRepository.updateThreadStatus(threadId, "failed", payload.lastPhase);

  return {
    success: false,
    error: payload.error,
  };
}

export async function handlePlanDetected(ctx: HandlerContext): Promise<HandlerResult> {
  return {
    success: true,
    nextEvent: "PhaseStarted",
    state: { phase: "plan" },
  };
}

export async function handleReviewDetected(ctx: HandlerContext): Promise<HandlerResult> {
  return {
    success: true,
    nextEvent: "PhaseStarted",
    state: { phase: "review" },
  };
}

export const handlers: Record<string, (ctx: HandlerContext) => Promise<HandlerResult>> = {
  ThreadStarted: handleThreadStarted,
  PhaseStarted: handlePhaseStarted,
  TaskStarted: handleTaskStarted,
  TestPassed: handleTestPassed,
  CheckFailed: handleCheckFailed,
  CheckRetrying: handleCheckRetrying,
  TaskCompleted: handleTaskCompleted,
  PhaseCompleted: handlePhaseCompleted,
  CommitCreated: handleCommitCreated,
  ThreadPaused: handleThreadPaused,
  ThreadResumed: handleThreadResumed,
  ThreadForked: handleThreadForked,
  ThreadCompleted: handleThreadCompleted,
  ThreadFailed: handleThreadFailed,
  PlanDetected: handlePlanDetected,
  ReviewDetected: handleReviewDetected,
};
