import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPreflight, PreflightResult } from "./preflight-phase.js";
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
    secrets: {},
    sessionId: null,
    prUrl: null,
    agentExitCode: null,
    agentError: null,
    agentResult: null,
    ...overrides,
  };
}

vi.mock("../services/dependency-service.js", () => ({
  getDependencies: vi.fn(),
  areDependenciesMet: vi.fn(),
}));

vi.mock("../services/pr-detection-service.js", () => ({
  checkExistingPr: vi.fn(),
}));

vi.mock("../services/secret-service.js", () => ({
  validateRequiredSecrets: vi.fn(),
}));

vi.mock("@optio/agent-adapters", () => ({
  getAgentConfig: vi.fn(() => ({ requiredSecrets: [] })),
}));

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: 0 }]),
    innerJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../db/schema.js", () => ({
  tasks: { id: "id", state: "state" },
  repos: { id: "id" },
}));

import * as depService from "../services/dependency-service.js";
import * as prDetection from "../services/pr-detection-service.js";
import * as secretService from "../services/secret-service.js";
import { db } from "../db/client.js";

describe("preflight phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(depService.getDependencies).mockResolvedValue([]);
    vi.mocked(depService.areDependenciesMet).mockResolvedValue(true);
    vi.mocked(prDetection.checkExistingPr).mockResolvedValue(null);
    vi.mocked(secretService.validateRequiredSecrets).mockResolvedValue([]);
    process.env.OPTIO_MAX_CONCURRENT = "5";
  });

  it("passes when all checks succeed", async () => {
    const ctx = makeCtx();
    const result = await runPreflight(ctx);

    expect(result.shouldProceed).toBe(true);
    expect(result.existingPr).toBeNull();
  });

  it("re-queues when dependencies are not met", async () => {
    vi.mocked(depService.getDependencies).mockResolvedValue([
      { id: "d1", title: "Dep", state: TaskState.RUNNING, dependencyId: "d1" },
    ] as any);
    vi.mocked(depService.areDependenciesMet).mockResolvedValue(false);

    const ctx = makeCtx();
    const result = await runPreflight(ctx);

    expect(result.shouldProceed).toBe(false);
    expect(result.requeue).toBe(true);
    expect(result.requeueReason).toBe("dependencies_not_met");
  });

  it("fails task when a dependency has failed", async () => {
    vi.mocked(depService.getDependencies).mockResolvedValue([
      { id: "d1", title: "Dep", state: TaskState.FAILED, dependencyId: "d1" },
    ] as any);

    const ctx = makeCtx();
    const result = await runPreflight(ctx);

    expect(result.shouldProceed).toBe(false);
    expect(result.failTask).toBe(true);
    expect(result.failReason).toBe("dependency_failed");
  });

  it("returns existing PR when one is detected", async () => {
    vi.mocked(prDetection.checkExistingPr).mockResolvedValue({
      url: "https://github.com/o/r/pull/42",
      number: 42,
      state: "open",
    });

    const ctx = makeCtx();
    const result = await runPreflight(ctx);

    expect(result.shouldProceed).toBe(false);
    expect(result.existingPr).toBe("https://github.com/o/r/pull/42");
  });

  it("re-queues when global concurrency is saturated", async () => {
    process.env.OPTIO_MAX_CONCURRENT = "1";
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockResolvedValue([{ count: 1 }]),
    } as any);

    const ctx = makeCtx();
    const result = await runPreflight(ctx);

    expect(result.shouldProceed).toBe(false);
    expect(result.requeue).toBe(true);
    expect(result.requeueReason).toBe("concurrency_limit");
  });
});
