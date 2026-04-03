import { describe, it, expect, vi, beforeEach } from "vitest";
import { runResultProcessing, ResultProcessingResult } from "./result-processing-phase.js";
import { TaskContext } from "./task-orchestrator-types.js";
import { TaskState } from "@optio/shared";

function makeCtx(overrides: Partial<TaskContext> = {}): TaskContext {
  return {
    taskId: "task-1",
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: () => makeCtx().log,
    },
    task: {
      id: "task-1",
      title: "Test",
      prompt: "Do it",
      repoUrl: "https://github.com/o/r",
      repoBranch: "main",
      state: TaskState.RUNNING,
      agentType: "claude-code",
      workflowType: "do-work",
      retryCount: 0,
      maxRetries: 3,
      priority: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
      workspaceId: null,
      prUrl: null,
      ticketExternalId: null,
      ticketSource: null,
      metadata: null,
      ignoreOffPeak: false,
      parentTaskId: null,
      workflowRunId: null,
      taskType: null,
    },
    repo: {
      id: "repo-1",
      repoUrl: "https://github.com/o/r",
      offPeakOnly: false,
      maxConcurrentTasks: 2,
      maxPodInstances: 1,
      maxAgentsPerPod: 2,
      claudeModel: null,
      claudeContextWindow: null,
      claudeThinking: false,
      claudeEffort: null,
      opencodeModel: null,
      opencodeTemperature: null,
      opencodeTopP: null,
      maxTurnsCoding: null,
      maxTurnsReview: null,
      extraPackages: null,
      setupCommands: null,
      networkPolicy: "unrestricted",
      cpuRequest: null,
      cpuLimit: null,
      memoryRequest: null,
      memoryLimit: null,
      dockerInDocker: false,
      secretProxy: false,
      promptTemplateOverride: null,
      autoMerge: true,
      reviewEnabled: false,
      reviewTrigger: null,
      reviewPromptTemplate: null,
      testCommand: null,
      reviewModel: null,
      maxAutoResumes: null,
      slackWebhookUrl: null,
      slackChannel: null,
      slackNotifyOn: null,
      slackEnabled: false,
      workspaceId: null,
      fullName: "o/r",
      defaultBranch: "main",
      isPrivate: false,
      imagePreset: null,
      customDockerfile: null,
      autoResume: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    pod: {
      id: "pod-1",
      repoUrl: "https://github.com/o/r",
      repoBranch: "main",
      instanceIndex: 1,
      podName: "optio-repo-pod-1",
      podId: "pod-uuid",
      state: "ready",
      activeTaskCount: 0,
    },
    agentImage: "optio/agent:latest",
    secrets: {},
    sessionId: null,
    prUrl: null,
    agentExitCode: null,
    agentError: null,
    agentResult: null,
    ...overrides,
  };
}

vi.mock("../services/repo-pool-service.js", () => ({
  updateWorktreeState: vi.fn(),
}));

vi.mock("../services/task-service.js", () => ({
  getTask: vi.fn(),
  transitionTask: vi.fn(),
  updateTaskPr: vi.fn(),
}));

vi.mock("../services/event-bus.js", () => ({
  publishEvent: vi.fn(),
}));

import * as repoPool from "../services/repo-pool-service.js";
import * as taskService from "../services/task-service.js";
import { publishEvent } from "../services/event-bus.js";

describe("result processing phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repoPool.updateWorktreeState).mockResolvedValue(undefined);
    vi.mocked(taskService.transitionTask).mockResolvedValue(undefined);
    vi.mocked(taskService.updateTaskPr).mockResolvedValue(undefined);
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.RUNNING,
      prUrl: null,
      parentTaskId: null,
    } as any);
  });

  it("transitions to pr_opened when PR URL is detected", async () => {
    const ctx = makeCtx({ sessionId: "sess-123", prUrl: "https://github.com/o/r/pull/42" });
    const result = await runResultProcessing(ctx, {
      success: true,
      summary: "Done",
      prUrl: "https://github.com/o/r/pull/42",
    });

    expect(result.finalState).toBe(TaskState.PR_OPENED);
    expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-1", "preserved");
    expect(taskService.transitionTask).toHaveBeenCalledWith(
      "task-1",
      TaskState.PR_OPENED,
      "pr_detected",
      expect.any(String),
    );
  });

  it("transitions to completed when agent succeeds without PR", async () => {
    const ctx = makeCtx({ sessionId: "sess-123" });
    const result = await runResultProcessing(ctx, { success: true, summary: "All done" });

    expect(result.finalState).toBe(TaskState.COMPLETED);
    expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-1", "removed");
    expect(taskService.transitionTask).toHaveBeenCalledWith(
      "task-1",
      TaskState.COMPLETED,
      "agent_success",
      "All done",
    );
  });

  it("transitions to failed when no session ID", async () => {
    const ctx = makeCtx({ sessionId: null });
    const result = await runResultProcessing(ctx, { success: false, error: "No output" });

    expect(result.finalState).toBe(TaskState.FAILED);
    expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-1", "dirty");
    expect(taskService.transitionTask).toHaveBeenCalledWith(
      "task-1",
      TaskState.FAILED,
      "agent_no_output",
      expect.any(String),
    );
  });

  it("transitions to failed when agent fails", async () => {
    const ctx = makeCtx({ sessionId: "sess-123" });
    const result = await runResultProcessing(ctx, { success: false, error: "Something broke" });

    expect(result.finalState).toBe(TaskState.FAILED);
    expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-1", "dirty");
    expect(taskService.transitionTask).toHaveBeenCalledWith(
      "task-1",
      TaskState.FAILED,
      "agent_failure",
      "Something broke",
    );
  });

  it("publishes auth event on OAuth failure", async () => {
    const ctx = makeCtx({ sessionId: "sess-123" });
    await runResultProcessing(ctx, { success: false, error: "OAuth token has expired" });

    expect(publishEvent).toHaveBeenCalledWith(expect.objectContaining({ type: "auth:failed" }));
  });
});
