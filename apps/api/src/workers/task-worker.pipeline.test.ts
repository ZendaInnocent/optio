import { TaskState } from "@optio/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted variables for mock sharing ─────────────────────────────────────

const { capturedProcessor, mockQueue } = vi.hoisted(() => {
  const capturedProcessor = { current: null as ((job: any) => Promise<void>) | null };
  const mockQueue = {
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
    obliterate: vi.fn().mockResolvedValue(undefined),
    getJobs: vi.fn().mockResolvedValue([]),
  };
  return { capturedProcessor, mockQueue };
});

// ── Mock all dependencies before importing the worker ──────────────────────

function createDbChain() {
  const chain = {
    select: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    update: vi.fn(),
    set: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn(),
  };
  Object.values(chain).forEach((fn) => fn.mockReturnThis());
  chain.where.mockResolvedValue([{ count: 0 }]);
  return chain;
}

const mockDbChain = createDbChain();

vi.mock("../db/client.js", () => ({ db: createDbChain() }));

function resetDbChain() {
  Object.values(mockDbChain).forEach((fn) => {
    fn.mockReset();
    fn.mockReturnThis();
  });
  mockDbChain.where.mockResolvedValue([{ count: 0 }]);
}

vi.mock("../db/schema.js", () => ({
  tasks: {
    id: "id",
    state: "state",
    repoUrl: "repoUrl",
    updatedAt: "updatedAt",
    costUsd: "costUsd",
    inputTokens: "inputTokens",
    outputTokens: "outputTokens",
    modelUsed: "modelUsed",
  },
  taskDependencies: { id: "id", taskId: "taskId", dependsOnTaskId: "dependsOnTaskId" },
  repos: { id: "id", repoUrl: "repoUrl" },
  repoPods: { id: "id" },
  secrets: { id: "id" },
  mcpServers: { id: "id" },
  customSkills: { id: "id" },
  promptTemplates: { id: "id" },
  users: { id: "id" },
  taskEvents: { id: "id" },
  taskLogs: { id: "id" },
  taskReflections: { id: "id" },
  customImages: { id: "id" },
  optioSettings: { id: "id" },
  workflowRuns: { id: "id" },
  workflowTemplates: { id: "id" },
  workspaces: { id: "id" },
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  },
}));

vi.mock("../services/event-bus.js", () => ({ publishEvent: vi.fn() }));

vi.mock("bullmq", () => {
  const MockWorker = vi
    .fn()
    .mockImplementation((_q: string, proc: (job: any) => Promise<void>, _o: any) => {
      capturedProcessor.current = proc;
      return { on: vi.fn().mockReturnThis(), close: vi.fn().mockResolvedValue(undefined) };
    });
  return { Queue: vi.fn(() => mockQueue), Worker: MockWorker };
});

vi.mock("../services/task-service.js", () => ({
  getTask: vi.fn(),
  transitionTask: vi.fn().mockResolvedValue(undefined),
  tryTransitionTask: vi.fn(),
  updateTaskContainer: vi.fn().mockResolvedValue(undefined),
  updateTaskPr: vi.fn().mockResolvedValue(undefined),
  updateTaskSession: vi.fn().mockResolvedValue(undefined),
  updateTaskResult: vi.fn().mockResolvedValue(undefined),
  appendTaskLog: vi.fn().mockResolvedValue(undefined),
  touchTaskHeartbeat: vi.fn().mockResolvedValue(undefined),
  StateRaceError: class StateRaceError extends Error {},
}));

vi.mock("../services/repo-pool-service.js", () => ({
  getOrCreateRepoPod: vi.fn(),
  resolveAgentImage: vi.fn(),
  updateWorktreeState: vi.fn().mockResolvedValue(undefined),
  execTaskInRepoPod: vi.fn(),
  releaseRepoPodTask: vi.fn().mockResolvedValue(undefined),
  reconcileActiveTaskCounts: vi.fn().mockResolvedValue(0),
}));

vi.mock("../services/secret-service.js", () => ({
  resolveSecretsForTask: vi.fn().mockResolvedValue({}),
  retrieveSecretWithFallback: vi.fn(),
  validateRequiredSecrets: vi.fn().mockResolvedValue([]),
}));

vi.mock("../services/prompt-template-service.js", () => ({ getPromptTemplate: vi.fn() }));
vi.mock("../services/pr-detection-service.js", () => ({
  checkExistingPr: vi.fn().mockResolvedValue(null),
}));

vi.mock("../services/dependency-service.js", () => ({
  getDependencies: vi.fn().mockResolvedValue([]),
  areDependenciesMet: vi.fn().mockResolvedValue(true),
  onDependencyComplete: vi.fn().mockResolvedValue(undefined),
  cascadeFailure: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../services/repo-service.js", () => ({ getRepoByUrl: vi.fn() }));
vi.mock("../services/mcp-server-service.js", () => ({
  getMcpServersForTask: vi.fn().mockResolvedValue([]),
  buildMcpJsonContent: vi.fn().mockResolvedValue("{}"),
}));
vi.mock("../services/skill-service.js", () => ({
  getSkillsForTask: vi.fn().mockResolvedValue([]),
  buildSkillSetupFiles: vi.fn().mockResolvedValue([]),
}));
vi.mock("../services/auth-service.js", () => ({ getClaudeAuthToken: vi.fn() }));
vi.mock("../services/subtask-service.js", () => ({
  onSubtaskComplete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../services/workflow-service.js", () => ({
  checkWorkflowRunCompletion: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@optio/shared", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    renderPromptTemplate: vi.fn(() => "rendered prompt"),
    renderTaskFile: vi.fn(() => "task file content"),
    TASK_FILE_PATH: ".optio/task.md",
    TASK_BRANCH_PREFIX: "optio/task-",
  };
});

vi.mock("../lib/agent/prompt-loader.js", () => ({
  promptLoader: {
    buildPromptFile: vi.fn().mockResolvedValue({ path: "prompt.md", content: "prompt" }),
  },
}));

vi.mock("@optio/shared", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    renderPromptTemplate: vi.fn(() => "rendered prompt"),
    renderTaskFile: vi.fn(() => "task file content"),
    TASK_FILE_PATH: ".optio/task.md",
    TASK_BRANCH_PREFIX: "optio/task-",
  };
});

vi.mock("../lib/agent/prompt-loader.js", () => ({
  promptLoader: {
    buildPromptFile: vi.fn().mockResolvedValue({ path: "prompt.md", content: "prompt" }),
  },
}));

vi.mock("@optio/agent-adapters", () => ({
  getAgentConfig: vi.fn(() => ({ requiredSecrets: [] })),
  getAdapter: vi.fn(() => ({
    buildContainerConfig: vi.fn(() => ({ image: "optio/agent:latest", setupFiles: [], env: {} })),
    buildAgentCommand: vi.fn(() => ["echo", "test"]),
    parseEvent: vi.fn((line: string) => {
      if (line.includes('"session_id"')) {
        const m = line.match(/"session_id":"([^"]+)"/);
        return { sessionId: m?.[1], entries: [] };
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

vi.mock("@optio/agent-adapters", () => ({
  getAgentConfig: vi.fn(() => ({ requiredSecrets: [] })),
  getAdapter: vi.fn(() => ({
    buildContainerConfig: vi.fn(() => ({ image: "optio/agent:latest", setupFiles: [], env: {} })),
    buildAgentCommand: vi.fn(() => ["echo", "test"]),
    parseEvent: vi.fn((line: string) => {
      if (line.includes('"session_id"')) {
        const m = line.match(/"session_id":"([^"]+)"/);
        return { sessionId: m?.[1], entries: [] };
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

// ── Import mocked modules ──────────────────────────────────────────────────

import * as dependencyService from "../services/dependency-service.js";
import * as prDetection from "../services/pr-detection-service.js";
import * as promptTemplateService from "../services/prompt-template-service.js";
import * as repoPool from "../services/repo-pool-service.js";
import * as repoService from "../services/repo-service.js";
import * as secretService from "../services/secret-service.js";
import * as subtaskService from "../services/subtask-service.js";
import * as taskService from "../services/task-service.js";
import { startTaskWorker } from "./task-worker.js";

// ── Test helpers ───────────────────────────────────────────────────────────

const mockTask = {
  id: "task-123",
  title: "Test task",
  prompt: "Fix the bug",
  repoUrl: "https://github.com/test-org/test-repo",
  repoBranch: "main",
  state: TaskState.QUEUED,
  agentType: "claude-code",
  workflowType: "do-work" as const,
  retryCount: 0,
  maxRetries: 3,
  priority: 100,
  createdAt: new Date(),
  updatedAt: new Date(),
  workspaceId: null as string | null,
  prUrl: null as string | null,
  ticketExternalId: null as string | null,
  ticketSource: null as string | null,
  metadata: null as Record<string, unknown> | null,
  ignoreOffPeak: false,
  parentTaskId: null as string | null,
  workflowRunId: null as string | null,
  taskType: null as string | null,
};

const mockRepoConfig = {
  id: "repo-1",
  repoUrl: "https://github.com/test-org/test-repo",
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
};

const mockPod = {
  id: "pod-1",
  repoUrl: "https://github.com/test-org/test-repo",
  repoBranch: "main",
  instanceIndex: 1,
  podName: "optio-repo-pod-1",
  podId: "pod-uuid",
  state: "ready",
  activeTaskCount: 0,
};

function createExecSession(lines: string[]) {
  return {
    stdout: (async function* () {
      for (const line of lines) yield Buffer.from(line);
    })(),
  };
}

const happyPathLines = [
  '{"type":"system","subtype":"init","session_id":"sess-123","model":"claude-sonnet-4","tools":[]}\n',
  '{"type":"assistant","message":{"content":[{"type":"text","text":"Working..."}]}}\n',
  '{"type":"result","session_id":"sess-123","is_error":false,"duration_ms":5000}\n',
  "https://github.com/test-org/test-repo/pull/42\n",
];

let getTaskCallCount = 0;

function setupCommonMocks() {
  resetDbChain();
  getTaskCallCount = 0;
  vi.mocked(taskService.getTask).mockImplementation(async () => {
    getTaskCallCount++;
    if (getTaskCallCount <= 2) return { ...mockTask, state: TaskState.QUEUED } as any;
    if (getTaskCallCount === 3) return { ...mockTask, state: TaskState.RUNNING } as any;
    return { ...mockTask, state: TaskState.PR_OPENED } as any;
  });
  vi.mocked(taskService.tryTransitionTask).mockResolvedValue(true as any);
  vi.mocked(taskService.transitionTask).mockResolvedValue(undefined);
  vi.mocked(repoPool.resolveAgentImage).mockResolvedValue("optio/agent:latest");
  vi.mocked(repoPool.getOrCreateRepoPod).mockResolvedValue(mockPod as any);
  vi.mocked(repoPool.execTaskInRepoPod).mockResolvedValue(createExecSession(happyPathLines) as any);
  vi.mocked(secretService.retrieveSecretWithFallback).mockResolvedValue("api-key");
  vi.mocked(promptTemplateService.getPromptTemplate).mockResolvedValue({
    id: "default",
    template: "You are a helpful assistant. Task: {{TASK_FILE}}",
    autoMerge: true,
  });
  vi.mocked(repoService.getRepoByUrl).mockResolvedValue(mockRepoConfig as any);
  vi.mocked(prDetection.checkExistingPr).mockResolvedValue(null);
  vi.mocked(dependencyService.getDependencies).mockResolvedValue([]);
  vi.mocked(dependencyService.areDependenciesMet).mockResolvedValue(true);
}

describe("task worker pipeline — integration safety net", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDbChain();
    capturedProcessor.current = null;
    process.env.OPTIO_MAX_CONCURRENT = "5";
    process.env.REDIS_URL = "redis://localhost:6379";
    process.env.OPTIO_ENCRYPTION_KEY = "test-key-32-chars-long!!";
    setupCommonMocks();
  });

  afterEach(() => {
    capturedProcessor.current = null;
  });

  async function runJob(data: object) {
    if (!capturedProcessor.current) startTaskWorker();
    expect(capturedProcessor.current).toBeDefined();
    await capturedProcessor.current!({ id: "job-1", data });
  }

  describe("happy path", () => {
    it("claims task, provisions pod, runs agent, detects PR", async () => {
      await runJob({ taskId: "task-123" });
      expect(taskService.tryTransitionTask).toHaveBeenCalledWith(
        "task-123",
        TaskState.PROVISIONING,
        "worker_pickup",
      );
      const states = vi.mocked(taskService.transitionTask).mock.calls.map((c) => c[1]);
      expect(states).toContain(TaskState.RUNNING);
      expect(states).toContain(TaskState.PR_OPENED);
      expect(repoPool.getOrCreateRepoPod).toHaveBeenCalled();
      expect(repoPool.execTaskInRepoPod).toHaveBeenCalled();
      expect(taskService.updateTaskPr).toHaveBeenCalledWith(
        "task-123",
        "https://github.com/test-org/test-repo/pull/42",
      );
      expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-123", "preserved");
      expect(repoPool.releaseRepoPodTask).toHaveBeenCalledWith("pod-1");
    });

    it("captures session ID from agent output", async () => {
      await runJob({ taskId: "task-123" });
      expect(taskService.updateTaskSession).toHaveBeenCalledWith("task-123", "sess-123");
    });
  });

  describe("pre-flight checks", () => {
    it("re-queues when dependencies not met", async () => {
      vi.mocked(dependencyService.getDependencies).mockResolvedValue([
        { id: "dep-1", title: "Dep", state: TaskState.RUNNING, dependencyId: "d1" },
      ] as any);
      vi.mocked(dependencyService.areDependenciesMet).mockResolvedValue(false);
      await runJob({ taskId: "task-123" });
      expect(mockQueue.add).toHaveBeenCalledWith(
        "process-task",
        expect.any(Object),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
      expect(repoPool.getOrCreateRepoPod).not.toHaveBeenCalled();
    });

    it("fails task when dependency has failed", async () => {
      vi.mocked(dependencyService.getDependencies).mockResolvedValue([
        { id: "dep-1", title: "Dep", state: TaskState.FAILED, dependencyId: "d1" },
      ] as any);
      await runJob({ taskId: "task-123" });
      expect(taskService.transitionTask).toHaveBeenCalledWith(
        "task-123",
        TaskState.FAILED,
        "dependency_failed",
        expect.any(String),
      );
      expect(repoPool.getOrCreateRepoPod).not.toHaveBeenCalled();
    });

    it("skips agent when PR already exists", async () => {
      vi.mocked(prDetection.checkExistingPr).mockResolvedValue({
        url: "https://github.com/test-org/test-repo/pull/99",
        number: 99,
        state: "open",
      });
      await runJob({ taskId: "task-123" });
      expect(taskService.updateTaskPr).toHaveBeenCalledWith(
        "task-123",
        "https://github.com/test-org/test-repo/pull/99",
      );
      expect(taskService.transitionTask).toHaveBeenCalledWith(
        "task-123",
        TaskState.PR_OPENED,
        "existing_pr_detected",
        "https://github.com/test-org/test-repo/pull/99",
      );
      expect(repoPool.execTaskInRepoPod).not.toHaveBeenCalled();
    });
  });

  describe("execution results", () => {
    it("fails when agent produces no session ID", async () => {
      vi.mocked(repoPool.execTaskInRepoPod).mockResolvedValue(
        createExecSession(["error output\n"]) as any,
      );
      await runJob({ taskId: "task-123" });
      expect(taskService.transitionTask).toHaveBeenCalledWith(
        "task-123",
        TaskState.FAILED,
        "agent_no_output",
        expect.any(String),
      );
      expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-123", "dirty");
    });

    it("completes when agent succeeds without PR", async () => {
      vi.mocked(repoPool.execTaskInRepoPod).mockResolvedValue(
        createExecSession([
          '{"type":"system","subtype":"init","session_id":"sess-456","model":"claude","tools":[]}\n',
          '{"type":"result","is_error":false}\n',
        ]) as any,
      );
      await runJob({ taskId: "task-123" });
      const states = vi.mocked(taskService.transitionTask).mock.calls.map((c) => c[1]);
      expect(states).toContain(TaskState.COMPLETED);
      expect(repoPool.updateWorktreeState).toHaveBeenCalledWith("task-123", "removed");
    });
  });

  describe("error handling", () => {
    it("re-queues on provisioning failure", async () => {
      getTaskCallCount = 0;
      vi.mocked(taskService.getTask).mockImplementation(async () => {
        getTaskCallCount++;
        if (getTaskCallCount === 1) return { ...mockTask, state: TaskState.QUEUED } as any;
        return { ...mockTask, state: TaskState.PROVISIONING } as any;
      });
      vi.mocked(repoPool.getOrCreateRepoPod).mockRejectedValue(new Error("Pod creation timed out"));
      await runJob({ taskId: "task-123" });
      expect(taskService.transitionTask).toHaveBeenCalledWith(
        "task-123",
        TaskState.QUEUED,
        "provisioning_retry",
        expect.stringContaining("Pod creation timed out"),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        "process-task",
        expect.any(Object),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });
  });

  describe("post-completion", async () => {
    it("calls onSubtaskComplete for subtasks", async () => {
      getTaskCallCount = 0;
      vi.mocked(taskService.getTask).mockImplementation(async () => {
        getTaskCallCount++;
        if (getTaskCallCount <= 2)
          return { ...mockTask, state: TaskState.QUEUED, parentTaskId: "parent-1" } as any;
        return { ...mockTask, state: TaskState.RUNNING, parentTaskId: "parent-1" } as any;
      });
      await runJob({ taskId: "task-123" });
      expect(subtaskService.onSubtaskComplete).toHaveBeenCalledWith("task-123");
    });

    it("calls onDependencyComplete on task completion", async () => {
      await runJob({ taskId: "task-123" });
      expect(dependencyService.onDependencyComplete).toHaveBeenCalledWith("task-123");
    });
  });

  describe("claim lock", () => {
    it("serializes concurrent invocations", async () => {
      await Promise.all([runJob({ taskId: "task-123" }), runJob({ taskId: "task-456" })]);
      expect(vi.mocked(taskService.tryTransitionTask).mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });
});
