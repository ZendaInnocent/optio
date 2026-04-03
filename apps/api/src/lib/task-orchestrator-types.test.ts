import { describe, it, expect } from "vitest";
import { TaskContext, PhaseError } from "./task-orchestrator-types.js";
import { TaskState } from "@optio/shared";

describe("TaskContext type", () => {
  it("holds all data needed for a single task execution", () => {
    const ctx: TaskContext = {
      taskId: "task-1",
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {},
        child: () => ctx.log,
      },
      task: {
        id: "task-1",
        title: "Test",
        prompt: "Do something",
        repoUrl: "https://github.com/test/repo",
        repoBranch: "main",
        state: TaskState.QUEUED,
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
        repoUrl: "https://github.com/test/repo",
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
      },
      pod: {
        id: "pod-1",
        repoUrl: "https://github.com/test/repo",
        repoBranch: "main",
        instanceIndex: 1,
        podName: "optio-repo-pod-1",
        podId: "pod-uuid",
        state: "ready",
        activeTaskCount: 0,
      },
      agentImage: "optio/agent:latest",
      secrets: { ANTHROPIC_API_KEY: "sk-test" },
      sessionId: null,
      prUrl: null,
      agentExitCode: null,
      agentError: null,
      agentResult: null,
    };

    expect(ctx.taskId).toBe("task-1");
    expect(ctx.task.state).toBe(TaskState.QUEUED);
    expect(ctx.sessionId).toBeNull();
    expect(ctx.prUrl).toBeNull();
  });
});

describe("PhaseError class", () => {
  it("extends Error with phase and retryable properties", () => {
    const err = new PhaseError("preflight", "Missing secrets", false);

    expect(err.name).toBe("PhaseError");
    expect(err.phase).toBe("preflight");
    expect(err.message).toBe("Missing secrets");
    expect(err.retryable).toBe(false);
    expect(err).toBeInstanceOf(Error);
  });

  it("marks provisioning errors as retryable", () => {
    const err = new PhaseError("provisioning", "Pod timeout", true);
    expect(err.retryable).toBe(true);
  });
});
