import { describe, it, expect, vi, beforeEach } from "vitest";
import { runExecution, ExecutionResult } from "./execution-phase.js";
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
    secrets: { ANTHROPIC_API_KEY: "sk-test" },
    sessionId: null,
    prUrl: null,
    agentExitCode: null,
    agentError: null,
    agentResult: null,
    ...overrides,
  };
}

vi.mock("@optio/agent-adapters", () => ({
  getAdapter: vi.fn(() => ({
    buildAgentCommand: vi.fn(() => ["echo", "test"]),
    parseEvent: vi.fn((line: string) => {
      if (line.includes('"session_id"')) {
        return { sessionId: "sess-123", entries: [] };
      }
      return {
        sessionId: undefined,
        entries: [
          { content: line, type: "text", taskId: "task-1", timestamp: new Date().toISOString() },
        ],
      };
    }),
    inferExitCode: vi.fn(() => 0),
    parseResult: vi.fn(() => ({ summary: "Success", error: null })),
  })),
}));

vi.mock("../services/repo-pool-service.js", () => ({
  execTaskInRepoPod: vi.fn(),
  updateWorktreeState: vi.fn(),
}));

vi.mock("../services/task-service.js", () => ({
  getTask: vi.fn(),
  updateTaskSession: vi.fn(),
  appendTaskLog: vi.fn(),
  updateTaskPr: vi.fn(),
  updateTaskResult: vi.fn(),
  touchTaskHeartbeat: vi.fn(),
}));

import { getAdapter } from "@optio/agent-adapters";
import * as repoPool from "../services/repo-pool-service.js";
import * as taskService from "../services/task-service.js";

function createExecSession(lines: string[]) {
  return {
    stdout: (async function* () {
      for (const line of lines) yield Buffer.from(line);
    })(),
  };
}

describe("execution phase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repoPool.execTaskInRepoPod).mockResolvedValue(
      createExecSession([
        '{"type":"system","subtype":"init","session_id":"sess-123","model":"claude","tools":[]}\n',
        '{"type":"result","is_error":false}\n',
        "https://github.com/o/r/pull/42\n",
      ]) as any,
    );
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.RUNNING,
      repoUrl: "https://github.com/o/r",
    } as any);
    vi.mocked(taskService.appendTaskLog).mockResolvedValue(undefined);
    vi.mocked(taskService.updateTaskSession).mockResolvedValue(undefined);
    vi.mocked(taskService.updateTaskPr).mockResolvedValue(undefined);
    vi.mocked(taskService.updateTaskResult).mockResolvedValue(undefined);
    vi.mocked(taskService.touchTaskHeartbeat).mockResolvedValue(undefined);
  });

  it("executes agent, captures session ID, detects PR", async () => {
    const ctx = makeCtx();
    const result = await runExecution(ctx);

    expect(result.success).toBe(true);
    expect(ctx.sessionId).toBe("sess-123");
    expect(ctx.prUrl).toBe("https://github.com/o/r/pull/42");
    expect(repoPool.execTaskInRepoPod).toHaveBeenCalled();
    expect(taskService.updateTaskSession).toHaveBeenCalledWith("task-1", "sess-123");
    expect(taskService.updateTaskPr).toHaveBeenCalledWith(
      "task-1",
      "https://github.com/o/r/pull/42",
    );
  });

  it("fails when agent produces no output", async () => {
    vi.mocked(repoPool.execTaskInRepoPod).mockResolvedValue(createExecSession([]) as any);

    const ctx = makeCtx();
    const result = await runExecution(ctx);

    expect(result.success).toBe(false);
    expect(result.error).toContain("no output");
  });

  it("skips final transition when task state changed during execution", async () => {
    vi.mocked(taskService.getTask).mockResolvedValue({
      id: "task-1",
      state: TaskState.FAILED,
    } as any);

    const ctx = makeCtx();
    const result = await runExecution(ctx);

    // Should not throw, but should indicate state changed
    expect(result.stateChanged).toBe(true);
  });
});
