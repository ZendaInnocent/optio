import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock db client
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

// Mock schema with required columns
vi.mock("../db/schema.js", () => ({
  tasks: {
    id: "id",
    title: "title",
    prompt: "prompt",
    repoUrl: "repo_url",
    repoBranch: "repo_branch",
    state: "state",
    agentType: "agent_type",
    modelUsed: "model_used",
    sessionId: "session_id",
    prUrl: "pr_url",
    costUsd: "cost_usd",
    metadata: "metadata",
    workspaceId: "workspace_id",
    createdAt: "created_at",
    updatedAt: "updated_at",
    completedAt: "completed_at",
    workflowType: "workflow_type",
    worktreePath: "worktree_path",
  },
  interactiveSessions: {
    id: "id",
    repoUrl: "repo_url",
    userId: "user_id",
    worktreePath: "worktree_path",
    branch: "branch",
    state: "state",
    agentType: "agent_type",
    model: "model",
    costUsd: "cost_usd",
    sessionId: "session_id",
    title: "title",
    createdAt: "created_at",
    updatedAt: "updated_at",
    endedAt: "ended_at",
  },
  taskLogs: {
    id: "id",
    taskId: "task_id",
    stream: "stream",
    content: "content",
    logType: "log_type",
    timestamp: "timestamp",
    turn: "turn",
  },
  sessionMessages: {
    id: "id",
    sessionId: "session_id",
    role: "role",
    content: "content",
    timestamp: "timestamp",
  },
  sessionPrs: {
    id: "id",
    sessionId: "session_id",
    prUrl: "pr_url",
    prNumber: "pr_number",
    prState: "pr_state",
    createdAt: "created_at",
  },
  taskDependencies: {
    id: "id",
    taskId: "task_id",
    dependsOnTaskId: "depends_on_task_id",
    createdAt: "created_at",
  },
  repos: { id: "id", repoUrl: "repo_url", workspaceId: "workspace_id" },
  workspaces: { id: "id" },
}));

vi.mock("../db/schema/agent-runs.js", () => ({
  agentRuns: {
    id: "id",
    workspaceId: "workspace_id",
    repoId: "repo_id",
    title: "title",
    initialPrompt: "initial_prompt",
    mode: "mode",
    state: "state",
    agentType: "agent_type",
    model: "model",
    branchName: "branch_name",
    worktreePath: "worktree_path",
    sessionId: "session_id",
    prUrl: "pr_url",
    costUsd: "cost_usd",
    maxTurns: "max_turns",
    metadata: "metadata",
    createdAt: "created_at",
    updatedAt: "updated_at",
    endedAt: "ended_at",
  },
}));
vi.mock("../db/schema/agent-run-events.js", () => ({
  agentRunEvents: {
    agentRunId: "agent_run_id",
    timestamp: "timestamp",
    type: "type",
    content: "content",
    turn: "turn",
  },
}));
vi.mock("../db/schema/agent-run-prs.js", () => ({
  agentRunPrs: {
    id: "id",
    agentRunId: "agent_run_id",
    prUrl: "pr_url",
    prNumber: "pr_number",
    title: "title",
    state: "state",
    createdAt: "created_at",
  },
}));

import { db } from "../db/client.js";
import { MigrationService } from "./migration-service.js";

describe("MigrationService", () => {
  let service: MigrationService;
  let insertCalls: Array<{ table: any; values: any }>;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MigrationService();
    insertCalls = [];
  });

  it("migrates a single task and interactive session correctly", async () => {
    // Mock data
    const repos = [{ id: "repo-1", repoUrl: "https://github.com/foo/bar", workspaceId: "ws-1" }];
    const tasks = [
      {
        id: "task-1",
        title: "Fix bug",
        prompt: "Fix login",
        repoUrl: "https://github.com/foo/bar",
        repoBranch: "main",
        state: "completed",
        agentType: "claude-code",
        modelUsed: "claude-sonnet",
        sessionId: "sess-1",
        prUrl: "https://github.com/foo/bar/pull/5",
        costUsd: "2.5",
        metadata: {},
        workspaceId: "ws-1",
        createdAt: new Date("2025-01-01T10:00:00Z"),
        updatedAt: new Date("2025-01-01T12:00:00Z"),
        completedAt: new Date("2025-01-01T12:00:00Z"),
        workflowType: "do-work",
        worktreePath: "/wt/task-1",
      },
    ];
    const deps: any[] = [];
    const sessions = [
      {
        id: "sess-2",
        repoUrl: "https://github.com/foo/bar",
        userId: "u1",
        worktreePath: "/wt/sess-2",
        branch: "feat",
        state: "active",
        agentType: "opencode",
        model: "gpt-4",
        costUsd: "1.75",
        sessionId: "agent-sess-2",
        title: "Session",
        createdAt: new Date("2025-01-02T10:00:00Z"),
        updatedAt: new Date("2025-01-02T11:00:00Z"),
        endedAt: null,
      },
    ];
    const taskLogs: any[] = [];
    const sessionMsgs: any[] = [];
    const sessionPrs: any[] = [];

    // Setup shared from mock to return data sequentially
    const fromMock = vi
      .fn()
      .mockResolvedValueOnce(repos) // repos
      .mockResolvedValueOnce(deps) // taskDependencies
      .mockResolvedValueOnce(tasks) // tasks
      .mockResolvedValueOnce(sessions) // interactiveSessions
      .mockResolvedValueOnce(taskLogs) // taskLogs
      .mockResolvedValueOnce(sessionMsgs) // sessionMessages
      .mockResolvedValueOnce(sessionPrs); // sessionPrs

    (db.select as any).mockReturnValue({ from: fromMock });

    // Capture inserts
    (db.insert as any).mockImplementation((table: any) => ({
      values: vi.fn().mockImplementation((values: any) => {
        insertCalls.push({ table, values });
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    }));

    await service.migrateAll();

    // Filter agentRun inserts (those with mode property)
    const agentRunInserts = insertCalls.filter(
      (call) => call.values && call.values.hasOwnProperty("mode"),
    );
    expect(agentRunInserts.length).toBe(2);

    // First is task
    const taskInsert = agentRunInserts[0].values;
    expect(taskInsert.id).toBe("task-1");
    expect(taskInsert.title).toBe("Fix bug");
    expect(taskInsert.initialPrompt).toBe("Fix login");
    expect(taskInsert.mode).toBe("autonomous");
    expect(taskInsert.state).toBe("completed");
    expect(taskInsert.agentType).toBe("claude-code");
    expect(taskInsert.model).toBe("claude-sonnet");
    expect(taskInsert.branchName).toBe("main");
    expect(taskInsert.sessionId).toBe("sess-1");
    expect(taskInsert.prUrl).toBe("https://github.com/foo/bar/pull/5");
    expect(taskInsert.costUsd).toBe(2.5);
    expect(taskInsert.maxTurns).toBe(50);
    expect(taskInsert.metadata.dependsOn).toEqual([]);
    expect(taskInsert.workspaceId).toBe("ws-1");
    expect(taskInsert.repoId).toBe("repo-1");
    expect(taskInsert.worktreePath).toBe("/wt/task-1");

    // Second is session
    const sessInsert = agentRunInserts[1].values;
    expect(sessInsert.id).toBe("sess-2");
    expect(sessInsert.mode).toBe("interactive");
    expect(sessInsert.state).toBe("running");
    expect(sessInsert.agentType).toBe("opencode");
    expect(sessInsert.model).toBe("gpt-4");
    expect(sessInsert.branchName).toBe("feat");
    expect(sessInsert.worktreePath).toBe("/wt/sess-2");
    expect(sessInsert.sessionId).toBe("agent-sess-2");
    expect(sessInsert.title).toContain("Session");
    expect(sessInsert.initialPrompt).toBe("");
    expect(sessInsert.maxTurns).toBe(100);
    expect(sessInsert.costUsd).toBeCloseTo(1.75);
  });

  it("migrates task logs and session messages to events", async () => {
    const repos = [{ id: "repo-1", repoUrl: "url", workspaceId: "ws" }];
    const tasks = [
      {
        id: "t1",
        title: "T",
        prompt: "P",
        repoUrl: "url",
        repoBranch: "main",
        state: "completed",
        agentType: "c",
        modelUsed: "m",
        sessionId: null,
        prUrl: null,
        costUsd: "0",
        metadata: {},
        workspaceId: "ws",
        createdAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
        workflowType: "do-work",
        worktreePath: null,
      },
    ];
    const deps: any[] = [];
    const sessions: any[] = [];
    const taskLogs = [
      {
        taskId: "t1",
        stream: "stdout",
        content: "Log",
        logType: "text",
        timestamp: new Date(),
        turn: 1,
      },
    ];
    const sessionMsgs = [
      {
        sessionId: "s1",
        role: "user",
        content: "Hi",
        timestamp: new Date(),
      },
    ];
    const sessionPrs: any[] = [];

    const fromMock = vi
      .fn()
      .mockResolvedValueOnce(repos)
      .mockResolvedValueOnce(deps)
      .mockResolvedValueOnce(tasks)
      .mockResolvedValueOnce(sessions)
      .mockResolvedValueOnce(taskLogs)
      .mockResolvedValueOnce(sessionMsgs)
      .mockResolvedValueOnce(sessionPrs);
    (db.select as any).mockReturnValue({ from: fromMock });
    (db.insert as any).mockImplementation((table: any) => ({
      values: vi.fn().mockImplementation((values: any) => ({
        insertCall: { table, values },
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      })),
    }));

    // Need to capture calls differently because previous mock didn't push to array.
    // We'll reuse insertCalls array
    (db.insert as any).mockImplementation((table: any) => ({
      values: vi.fn().mockImplementation((values: any) => {
        insertCalls.push({ table, values });
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    }));

    await service.migrateAll();

    const eventInserts = insertCalls.filter(
      (call) => call.values && call.values.hasOwnProperty("type"),
    );
    expect(eventInserts.length).toBe(2);

    const logEvent = eventInserts.find((e) => e.values.type === "log");
    expect(logEvent).toBeDefined();
    expect(logEvent!.values.agentRunId).toBe("t1");
    expect(logEvent!.values.content).toEqual({ text: "Log", stream: "stdout", logType: "text" });

    const msgEvent = eventInserts.find((e) => e.values.type === "message");
    expect(msgEvent).toBeDefined();
    expect(msgEvent!.values.agentRunId).toBe("s1");
    expect(msgEvent!.values.content).toEqual({ role: "user", content: "Hi" });
  });

  it("migrates session PRs", async () => {
    const repos = [{ id: "repo-1", repoUrl: "url", workspaceId: "ws" }];
    const tasks: any[] = [];
    const deps: any[] = [];
    const sessions: any[] = [];
    const taskLogs: any[] = [];
    const sessionMsgs: any[] = [];
    const sessionPrs = [
      {
        sessionId: "sess-1",
        prUrl: "https://github.com/foo/pull/1",
        prNumber: 1,
        prState: "open",
        createdAt: new Date(),
      },
    ];

    const fromMock = vi
      .fn()
      .mockResolvedValueOnce(repos)
      .mockResolvedValueOnce(deps)
      .mockResolvedValueOnce(tasks)
      .mockResolvedValueOnce(sessions)
      .mockResolvedValueOnce(taskLogs)
      .mockResolvedValueOnce(sessionMsgs)
      .mockResolvedValueOnce(sessionPrs);
    (db.select as any).mockReturnValue({ from: fromMock });
    (db.insert as any).mockImplementation((table: any) => ({
      values: vi.fn().mockImplementation((values: any) => {
        insertCalls.push({ table, values });
        return { onConflictDoNothing: vi.fn().mockResolvedValue(undefined) };
      }),
    }));

    await service.migrateAll();

    const prInserts = insertCalls.filter(
      (call) => call.values && call.values.hasOwnProperty("prUrl"),
    );
    expect(prInserts.length).toBe(1);
    expect(prInserts[0].values.agentRunId).toBe("sess-1");
    expect(prInserts[0].values.prNumber).toBe(1);
    expect(prInserts[0].values.state).toBe("open");
  });
});
