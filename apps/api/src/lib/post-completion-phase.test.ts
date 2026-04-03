import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPostCompletion, PostCompletionResult } from "./post-completion-phase.js";
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
      state: TaskState.PR_OPENED,
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
    sessionId: "sess-123",
    prUrl: "https://github.com/o/r/pull/42",
    agentExitCode: 0,
    agentError: null,
    agentResult: "Done",
    ...overrides,
  };
}

vi.mock("../services/subtask-service.js", () => ({
  onSubtaskComplete: vi.fn(),
}));

vi.mock("../services/dependency-service.js", () => ({
  onDependencyComplete: vi.fn(),
  cascadeFailure: vi.fn(),
}));

vi.mock("../services/workflow-service.js", () => ({
  checkWorkflowRunCompletion: vi.fn(),
}));

vi.mock("../services/repo-pool-service.js", () => ({
  releaseRepoPodTask: vi.fn(),
}));

vi.mock("../services/task-service.js", () => ({
  getTask: vi.fn(),
}));

import * as subtaskService from "../services/subtask-service.js";
import * as dependencyService from "../services/dependency-service.js";
import * as workflowService from "../services/workflow-service.js";
import * as repoPool from "../services/repo-pool-service.js";
import * as taskService from "../services/task-service.js";

describe("post-completion phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(subtaskService.onSubtaskComplete).mockResolvedValue(undefined);
    vi.mocked(dependencyService.onDependencyComplete).mockResolvedValue(undefined);
    vi.mocked(dependencyService.cascadeFailure).mockResolvedValue(undefined);
    vi.mocked(workflowService.checkWorkflowRunCompletion).mockResolvedValue(undefined);
    vi.mocked(repoPool.releaseRepoPodTask).mockResolvedValue(undefined);
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.PR_OPENED,
      parentTaskId: null,
      workflowRunId: null,
    } as any);
  });

  it("calls onDependencyComplete for completed tasks", async () => {
    const ctx = makeCtx({ sessionId: "sess-123" });
    await runPostCompletion(ctx);

    expect(dependencyService.onDependencyComplete).toHaveBeenCalledWith("task-1");
    expect(repoPool.releaseRepoPodTask).toHaveBeenCalledWith("pod-1");
  });

  it("calls cascadeFailure for failed tasks", async () => {
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.FAILED,
      parentTaskId: null,
      workflowRunId: null,
    } as any);

    const ctx = makeCtx({ sessionId: "sess-123" });
    await runPostCompletion(ctx);

    expect(dependencyService.cascadeFailure).toHaveBeenCalledWith("task-1");
    expect(dependencyService.onDependencyComplete).not.toHaveBeenCalled();
  });

  it("calls onSubtaskComplete when task has parent", async () => {
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.PR_OPENED,
      parentTaskId: "parent-1",
      workflowRunId: null,
    } as any);

    const ctx = makeCtx({ sessionId: "sess-123" });
    await runPostCompletion(ctx);

    expect(subtaskService.onSubtaskComplete).toHaveBeenCalledWith("task-1");
  });

  it("checks workflow run completion when task has workflowRunId", async () => {
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.PR_OPENED,
      parentTaskId: null,
      workflowRunId: "wr-1",
    } as any);

    const ctx = makeCtx({ sessionId: "sess-123" });
    await runPostCompletion(ctx);

    expect(workflowService.checkWorkflowRunCompletion).toHaveBeenCalledWith("wr-1");
  });
});
