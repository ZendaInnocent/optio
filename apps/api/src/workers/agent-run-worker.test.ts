import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock BullMQ
vi.mock("bullmq", () => ({
  Worker: vi.fn(() => ({
    on: vi.fn(),
  })),
  Queue: vi.fn(() => ({
    add: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock db client to avoid real DB calls
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([{ count: 0 }]) as any,
  },
}));

// Mock services
vi.mock("../services/agent-run-service.js", () => ({
  getAgentRun: vi.fn(),
  transitionState: vi.fn(),
}));

vi.mock("../services/repo-pool-service.js", () => ({
  getOrCreateRepoPod: vi.fn(),
}));

vi.mock("../services/repo-service.js", () => ({
  getRepo: vi.fn(),
}));

vi.mock("@optio/agent-adapters", () => ({
  getAdapter: vi.fn(),
}));

vi.mock("../services/container-service.js", () => ({
  getRuntime: vi.fn(),
}));

import { AgentRunWorker } from "./agent-run-worker.js";
import * as agentRunService from "../services/agent-run-service.js";
import * as repoPool from "../services/repo-pool-service.js";
import * as repoService from "../services/repo-service.js";
import * as agentAdapters from "@optio/agent-adapters";
import { getRuntime } from "../services/container-service.js";

describe("AgentRunWorker", () => {
  let mockGetAgentRun: any;
  let mockTransitionState: any;
  let mockGetOrCreateRepoPod: any;
  let mockGetRepo: any;
  let mockGetAdapter: any;
  let mockExec: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgentRun = vi.mocked(agentRunService.getAgentRun);
    mockTransitionState = vi.mocked(agentRunService.transitionState);
    mockGetOrCreateRepoPod = vi.mocked(repoPool.getOrCreateRepoPod);
    mockGetRepo = vi.mocked(repoService.getRepo);
    mockGetAdapter = vi.mocked(agentAdapters.getAdapter);
    const getRuntimeFn = vi.mocked(getRuntime);
    const runtimeInstance = { exec: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }) } as any;
    getRuntimeFn.mockReturnValue(runtimeInstance);
    mockExec = runtimeInstance.exec as any;
    mockTransitionState.mockResolvedValue(undefined);
  });

  it("processes autonomous agent run to completion", async () => {
    const job = { data: { agentRunId: "test-id" }, name: "process-agent-run" } as any;

    mockGetAgentRun.mockResolvedValue({
      id: "test-id",
      state: "queued",
      mode: "autonomous",
      agentType: "claude-code",
      model: "claude-3",
      initialPrompt: "Fix bug",
      repoId: "repo-123",
      workspaceId: "ws-123",
      sessionId: null,
    });

    mockGetRepo.mockResolvedValue({
      id: "repo-123",
      repoUrl: "https://github.com/example/repo",
      defaultBranch: "main",
      maxAgentsPerPod: 2,
      maxPodInstances: 1,
      maxConcurrentTasks: 2,
    });

    mockGetOrCreateRepoPod.mockResolvedValue({ id: "pod-1", podName: "pod-1", podId: "pod-1" });

    const mockAdapter = {
      runOnce: vi.fn().mockResolvedValue({
        sessionId: "sess-1",
        prUrl: "https://github.com/example/repo/pull/1",
      }),
    };
    mockGetAdapter.mockReturnValue(mockAdapter);

    const worker = new AgentRunWorker();
    const result = await worker.execute(job);

    expect(mockTransitionState).toHaveBeenCalledWith("test-id", "provisioning");
    expect(mockGetOrCreateRepoPod).toHaveBeenCalledWith(
      "https://github.com/example/repo",
      "main",
      {},
      expect.objectContaining({ customImage: "claude-code" }),
    );
    expect(mockExec).toHaveBeenCalled();
    expect(mockTransitionState).toHaveBeenCalledWith("test-id", "running");
    expect(mockAdapter.runOnce).toHaveBeenCalledWith(
      expect.objectContaining({
        OPTIO_PROMPT: "Fix bug",
        OPTIO_AGENT_TYPE: "claude-code",
        OPTIO_MODEL: "claude-3",
        OPTIO_WORKTREE: "/worktrees/test-id",
        OPTIO_REPO_URL: "https://github.com/example/repo",
        OPTIO_REPO_BRANCH: "main",
        OPTIO_BRANCH_NAME: "optio/agent-run/test-id",
      }),
    );
    expect(mockTransitionState).toHaveBeenCalledWith("test-id", "completed");
    expect(result).toEqual({
      sessionId: "sess-1",
      prUrl: "https://github.com/example/repo/pull/1",
    });
  });

  it("processes supervised agent run and triggers needs_attention", async () => {
    const job = { data: { agentRunId: "supervised-id" }, name: "process-agent-run" } as any;

    mockGetAgentRun.mockResolvedValue({
      id: "supervised-id",
      state: "queued",
      mode: "supervised",
      agentType: "claude-code",
      model: "claude-3",
      initialPrompt: "Review code",
      repoId: "repo-123",
      workspaceId: "ws-123",
      sessionId: "sess-existing",
    });

    mockGetRepo.mockResolvedValue({
      id: "repo-123",
      repoUrl: "https://github.com/example/repo",
      defaultBranch: "main",
      maxAgentsPerPod: 2,
      maxPodInstances: 1,
      maxConcurrentTasks: 2,
    });

    mockGetOrCreateRepoPod.mockResolvedValue({ id: "pod-2", podName: "pod-2", podId: "pod-2" });

    const mockAdapter = {
      runWithMonitoring: vi.fn().mockImplementation(async (env, callbacks) => {
        await callbacks.onNeedsAttention();
        return { sessionId: "sess-new", prUrl: "https://github.com/example/repo/pull/2" };
      }),
    };
    mockGetAdapter.mockReturnValue(mockAdapter);

    const worker = new AgentRunWorker();
    const result = await worker.execute(job);

    expect(mockTransitionState).toHaveBeenCalledWith("supervised-id", "provisioning");
    expect(mockTransitionState).toHaveBeenCalledWith("supervised-id", "running");
    expect(mockTransitionState).toHaveBeenCalledWith("supervised-id", "needs_attention");
    expect(mockTransitionState).toHaveBeenCalledWith("supervised-id", "completed");
    expect(result).toEqual({
      sessionId: "sess-new",
      prUrl: "https://github.com/example/repo/pull/2",
    });
  });

  it("handles adapter error and transitions to failed", async () => {
    const job = { data: { agentRunId: "error-id" }, name: "process-agent-run" } as any;

    mockGetAgentRun.mockResolvedValue({
      id: "error-id",
      state: "queued",
      mode: "autonomous",
      agentType: "claude-code",
      model: "claude-3",
      initialPrompt: "Fix bug",
      repoId: "repo-123",
      workspaceId: "ws-123",
      sessionId: null,
    });

    mockGetRepo.mockResolvedValue({
      id: "repo-123",
      repoUrl: "https://github.com/example/repo",
      defaultBranch: "main",
      maxAgentsPerPod: 2,
      maxPodInstances: 1,
      maxConcurrentTasks: 2,
    });

    mockGetOrCreateRepoPod.mockResolvedValue({ id: "pod-3", podName: "pod-3", podId: "pod-3" });

    const mockAdapter = {
      runOnce: vi.fn().mockRejectedValue(new Error("Adapter failed")),
    };
    mockGetAdapter.mockReturnValue(mockAdapter);

    const worker = new AgentRunWorker();

    await expect(worker.execute(job)).rejects.toThrow("Adapter failed");

    expect(mockTransitionState).toHaveBeenCalledWith("error-id", "provisioning");
    expect(mockTransitionState).toHaveBeenCalledWith("error-id", "running");
    expect(mockTransitionState).toHaveBeenCalledWith("error-id", "failed");
  });

  it("serializes execution for same agent run ID via claim lock", async () => {
    const job = { data: { agentRunId: "same-run-id" }, name: "process-agent-run" } as any;

    let resolveFirst: () => void;
    const firstPause = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    let podCallCount = 0;

    mockGetAgentRun.mockResolvedValue({
      id: "same-run-id",
      state: "queued",
      mode: "autonomous",
      agentType: "claude-code",
      model: "claude-3",
      initialPrompt: "Fix",
      repoId: "repo-123",
      workspaceId: "ws-123",
      sessionId: null,
    });

    mockGetRepo.mockResolvedValue({
      id: "repo-123",
      repoUrl: "https://github.com/example/repo",
      defaultBranch: "main",
      maxAgentsPerPod: 2,
      maxPodInstances: 1,
      maxConcurrentTasks: 2,
    });

    mockGetOrCreateRepoPod.mockImplementation(async () => {
      podCallCount++;
      await firstPause;
      return { id: "pod", podName: "pod", podId: "pod" };
    });

    const mockAdapter = {
      runOnce: vi.fn().mockResolvedValue({}),
    };
    mockGetAdapter.mockReturnValue(mockAdapter);

    const worker = new AgentRunWorker();

    // Start first execution
    const firstPromise = worker.execute(job);

    // Wait until getOrCreateRepoPod has been called (poll)
    await new Promise<void>((resolve) => {
      const check = () => {
        if (podCallCount > 0) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });

    expect(mockGetOrCreateRepoPod).toHaveBeenCalledTimes(1);

    // Start second execution while first is still paused
    const secondPromise = worker.execute(job);

    // Second should not have called getOrCreateRepoPod yet
    await Promise.resolve();
    expect(mockGetOrCreateRepoPod).toHaveBeenCalledTimes(1);

    // Release first
    resolveFirst!();
    await firstPromise;

    // After first completes, second should proceed
    await new Promise<void>((resolve) => {
      const check = () => {
        if (podCallCount >= 2) {
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };
      check();
    });

    expect(mockGetOrCreateRepoPod).toHaveBeenCalledTimes(2);
    await secondPromise;

    // Check that both completed
    const completedCalls = mockTransitionState.mock.calls.filter(
      (c: any[]) => c[0] === "same-run-id" && c[1] === "completed",
    );
    expect(completedCalls).toHaveLength(2);
  });
});
