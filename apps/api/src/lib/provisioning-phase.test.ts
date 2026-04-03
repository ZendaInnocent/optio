import { describe, it, expect, vi, beforeEach } from "vitest";
import { runProvisioning, ProvisioningResult } from "./provisioning-phase.js";
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
      state: TaskState.PROVISIONING,
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
    pod: null,
    agentImage: "optio/agent:latest",
    secrets: { ANTHROPIC_API_KEY: "sk-test" },
    sessionId: null,
    prUrl: null,
    agentExitCode: null,
    agentError: null,
    agentResult: null,
    ...overrides,
  };
}

vi.mock("../services/repo-pool-service.js", () => ({
  resolveAgentImage: vi.fn(),
  getOrCreateRepoPod: vi.fn(),
  updateWorktreeState: vi.fn(),
}));

vi.mock("../services/task-service.js", () => ({
  updateTaskContainer: vi.fn(),
  transitionTask: vi.fn(),
}));

import * as repoPool from "../services/repo-pool-service.js";
import * as taskService from "../services/task-service.js";

describe("provisioning phase", () => {
  const mockPod = {
    id: "pod-1",
    repoUrl: "https://github.com/o/r",
    repoBranch: "main",
    instanceIndex: 1,
    podName: "optio-repo-pod-1",
    podId: "pod-uuid",
    state: "ready",
    activeTaskCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repoPool.resolveAgentImage).mockResolvedValue("optio/agent:latest");
    vi.mocked(repoPool.getOrCreateRepoPod).mockResolvedValue(mockPod as any);
    vi.mocked(taskService.updateTaskContainer).mockResolvedValue(undefined);
    vi.mocked(taskService.transitionTask).mockResolvedValue(undefined);
  });

  it("resolves image, gets pod, and transitions to running", async () => {
    const ctx = makeCtx();
    const result = await runProvisioning(ctx);

    expect(result.success).toBe(true);
    expect(ctx.pod).toBe(mockPod);
    expect(repoPool.resolveAgentImage).toHaveBeenCalledWith("https://github.com/o/r", null);
    expect(repoPool.getOrCreateRepoPod).toHaveBeenCalled();
    expect(taskService.updateTaskContainer).toHaveBeenCalledWith("task-1", "optio-repo-pod-1");
    expect(taskService.transitionTask).toHaveBeenCalledWith(
      "task-1",
      TaskState.RUNNING,
      "worktree_created",
    );
  });

  it("throws PhaseError when pod creation fails", async () => {
    vi.mocked(repoPool.getOrCreateRepoPod).mockRejectedValue(new Error("Pod timeout"));

    const ctx = makeCtx();
    const result = await runProvisioning(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("Pod timeout");
  });
});
