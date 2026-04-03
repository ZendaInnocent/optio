import { describe, it, expect, vi, beforeEach } from "vitest";
import { runPrepare, PrepareResult } from "./prepare-phase.js";
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

vi.mock("../services/prompt-template-service.js", () => ({
  getPromptTemplate: vi.fn(),
}));

vi.mock("../services/secret-service.js", () => ({
  resolveSecretsForTask: vi.fn(),
}));

vi.mock("../services/mcp-server-service.js", () => ({
  getMcpServersForTask: vi.fn(),
  buildMcpJsonContent: vi.fn(),
}));

vi.mock("../services/skill-service.js", () => ({
  getSkillsForTask: vi.fn(),
  buildSkillSetupFiles: vi.fn(),
}));

vi.mock("../lib/agent/prompt-loader.js", () => ({
  promptLoader: {
    buildPromptFile: vi.fn(),
  },
}));

import * as promptTemplateService from "../services/prompt-template-service.js";
import * as secretService from "../services/secret-service.js";
import * as mcpServerService from "../services/mcp-server-service.js";
import * as skillService from "../services/skill-service.js";
import { promptLoader } from "../lib/agent/prompt-loader.js";

describe("prepare phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(promptTemplateService.getPromptTemplate).mockResolvedValue({
      id: "default",
      template: "You are helpful. Task: {{TASK_FILE}}",
      autoMerge: true,
    });
    vi.mocked(secretService.resolveSecretsForTask).mockResolvedValue({
      ANTHROPIC_API_KEY: "sk-test",
    });
    vi.mocked(mcpServerService.getMcpServersForTask).mockResolvedValue([]);
    vi.mocked(mcpServerService.buildMcpJsonContent).mockResolvedValue("{}");
    vi.mocked(skillService.getSkillsForTask).mockResolvedValue([]);
    vi.mocked(skillService.buildSkillSetupFiles).mockResolvedValue([]);
    vi.mocked(promptLoader.buildPromptFile).mockResolvedValue("prompt content");
  });

  it("resolves secrets, prompt, MCP config, and skills", async () => {
    const ctx = makeCtx();
    const result = await runPrepare(ctx);

    expect(result.success).toBe(true);
    expect(ctx.secrets).toEqual({ ANTHROPIC_API_KEY: "sk-test" });
  });

  it("fails when prompt template is not found", async () => {
    vi.mocked(promptTemplateService.getPromptTemplate).mockResolvedValue(null);

    const ctx = makeCtx();
    const result = await runPrepare(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("prompt template");
  });
});
