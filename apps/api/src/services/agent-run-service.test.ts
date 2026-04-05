import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock db client
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    limit: vi.fn().mockReturnThis(),
  },
}));

// Mock schema
vi.mock("../db/schema.js", () => ({
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
    maxTurns: "max_turns",
    createdAt: "created_at",
    updatedAt: "updated_at",
    endedAt: "ended_at",
  },
  agentRunEvents: {
    agentRunId: "agent_run_id",
    type: "type",
    content: "content",
    turn: "turn",
  },
  agentRunPrs: {
    agentRunId: "agent_run_id",
    prUrl: "pr_url",
    prNumber: "pr_number",
    title: "title",
  },
}));

import { db } from "../db/client.js";
import {
  createAgentRun,
  getAgentRun,
  transitionState,
  switchMode,
  recordEvent,
  registerPr,
} from "./agent-run-service.js";

describe("AgentRunService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createAgentRun", () => {
    it("creates an agent run with correct initial state", async () => {
      const mockRun = {
        id: "run-1",
        title: "Test run",
        initialPrompt: "Do something",
        workspaceId: "workspace-uuid",
        repoId: "repo-uuid",
        mode: "autonomous",
        state: "pending",
        agentType: "claude-code",
        model: "claude-sonnet",
        maxTurns: 50,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (db.insert as any) = vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockRun]),
        }),
      });

      const result = await createAgentRun({
        title: "Test run",
        initialPrompt: "Do something",
        workspaceId: "workspace-uuid",
        repoId: "repo-uuid",
        agentType: "claude-code",
        model: "claude-sonnet",
        mode: "autonomous",
      });

      expect(result).toEqual(mockRun);
      expect(result.state).toBe("pending");
      expect(result.mode).toBe("autonomous");
      expect(result.initialPrompt).toBe("Do something");
    });

    it("sets maxTurns to 100 for interactive mode", async () => {
      const mockRun = {
        id: "run-1",
        mode: "interactive",
        maxTurns: 100,
        state: "pending",
      };

      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRun]),
      });
      (db.insert as any) = vi.fn().mockReturnValue({ values: valuesMock });

      await createAgentRun({
        title: "Interactive",
        initialPrompt: "Interact",
        workspaceId: "ws",
        repoId: "repo",
        agentType: "codex",
        mode: "interactive",
      });

      // Capture the values passed to .values()
      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        maxTurns: 100,
      });
    });

    it("sets maxTurns to 50 for non-interactive mode", async () => {
      const mockRun = {
        id: "run-1",
        mode: "autonomous",
        maxTurns: 50,
        state: "pending",
      };

      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRun]),
      });
      (db.insert as any) = vi.fn().mockReturnValue({ values: valuesMock });

      await createAgentRun({
        title: "Auto",
        initialPrompt: "Auto",
        workspaceId: "ws",
        repoId: "repo",
        agentType: "claude",
        mode: "autonomous",
      });

      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        maxTurns: 50,
      });
    });

    it("uses provided maxTurns if specified", async () => {
      const mockRun = {
        id: "run-1",
        mode: "autonomous",
        maxTurns: 200,
        state: "pending",
      };

      const valuesMock = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([mockRun]),
      });
      (db.insert as any) = vi.fn().mockReturnValue({ values: valuesMock });

      await createAgentRun({
        title: "Custom",
        initialPrompt: "Custom",
        workspaceId: "ws",
        repoId: "repo",
        agentType: "claude",
        mode: "autonomous",
        maxTurns: 200,
      });

      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        maxTurns: 200,
      });
    });
  });

  describe("getAgentRun", () => {
    it("returns agent run by id", async () => {
      const mockRun = { id: "run-1", title: "Test" };

      (db.select as any) = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockRun]),
          }),
        }),
      });

      const result = await getAgentRun("run-1");
      expect(result).toEqual(mockRun);
    });

    it("returns undefined if not found", async () => {
      (db.select as any) = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      const result = await getAgentRun("nonexistent");
      expect(result).toBeUndefined();
    });
  });

  describe("transitionState", () => {
    it("transitions state when valid", async () => {
      const existingRun = { id: "run-1", state: "pending" };
      const updatedRun = { id: "run-1", state: "queued", updatedAt: new Date() };

      (db.select as any) = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingRun]),
          }),
        }),
      });

      (db.update as any) = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRun]),
          }),
        }),
      });

      const result = await transitionState("run-1", "queued");
      expect(result.state).toBe("queued");
    });

    it("throws on invalid transition", async () => {
      const existingRun = { id: "run-1", state: "completed" };

      (db.select as any) = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingRun]),
          }),
        }),
      });

      await expect(transitionState("run-1", "running")).rejects.toThrow("Invalid transition");
    });

    it("throws if agent run not found", async () => {
      (db.select as any) = vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(transitionState("nonexistent", "queued")).rejects.toThrow("not found");
    });
  });

  describe("switchMode", () => {
    it("changes mode and updates timestamp", async () => {
      const updatedRun = { id: "run-1", mode: "interactive", updatedAt: new Date() };

      (db.update as any) = vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedRun]),
          }),
        }),
      });

      const result = await switchMode("run-1", "interactive");
      expect(result.mode).toBe("interactive");
    });
  });

  describe("recordEvent", () => {
    it("inserts event into agent_run_events", async () => {
      const valuesMock = vi.fn().mockReturnValue({});
      (db.insert as any) = vi.fn().mockReturnValue({ values: valuesMock });

      await recordEvent("run-1", "system", { message: "Started" });

      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        agentRunId: "run-1",
        type: "system",
        content: { message: "Started" },
        turn: undefined,
      });
    });

    it("includes turn number when provided", async () => {
      const valuesMock = vi.fn().mockReturnValue({});
      (db.insert as any) = vi.fn().mockReturnValue({ values: valuesMock });

      await recordEvent("run-1", "message", { role: "user", content: "Hi" }, 5);

      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg.turn).toBe(5);
    });
  });

  describe("registerPr", () => {
    it("inserts PR record into agent_run_prs", async () => {
      const valuesMock = vi.fn().mockReturnValue({});
      (db.insert as any) = vi.fn().mockReturnValue({ values: valuesMock });

      await registerPr("run-1", "https://github.com/org/repo/pull/123", 123, "Fix bug");

      const valuesArg = valuesMock.mock.calls[0][0];
      expect(valuesArg).toMatchObject({
        agentRunId: "run-1",
        prUrl: "https://github.com/org/repo/pull/123",
        prNumber: 123,
        title: "Fix bug",
        state: "open",
      });
    });
  });
});
