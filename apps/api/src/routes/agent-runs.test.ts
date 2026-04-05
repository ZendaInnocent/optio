import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// ─── Mocks ───

const mockCreateAgentRun = vi.fn();
const mockGetAgentRun = vi.fn();
const mockSwitchMode = vi.fn();
const mockTransitionState = vi.fn();
const mockRegisterPr = vi.fn();

vi.mock("../services/agent-run-service.js", () => ({
  createAgentRun: (...args: unknown[]) => mockCreateAgentRun(...args),
  getAgentRun: (...args: unknown[]) => mockGetAgentRun(...args),
  switchMode: (...args: unknown[]) => mockSwitchMode(...args),
  transitionState: (...args: unknown[]) => mockTransitionState(...args),
  registerPr: (...args: unknown[]) => mockRegisterPr(...args),
}));

import { agentRunRoutes } from "./agent-runs.js";

// ─── Helpers ───

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("user", undefined as any);
  app.addHook("preHandler", (req: any, _reply: any, done: any) => {
    req.user = { workspaceId: "ws-1" };
    done();
  });
  await agentRunRoutes(app);
  app.setErrorHandler((_error: any, _req: any, reply: any) => {
    reply.status(500).send({ error: "Internal server error" });
  });
  await app.ready();
  return app;
}

describe("Agent Run Routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("POST /api/agent-runs", () => {
    it("creates a new agent run", async () => {
      const mockRun = {
        id: "run-123",
        title: "New agent run",
        state: "pending",
        mode: "autonomous",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreateAgentRun.mockResolvedValue(mockRun);

      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs",
        payload: {
          title: "New agent run",
          initialPrompt: "Fix the bug",
          repoId: "123e4567-e89b-12d3-a456-426614174000",
          workspaceId: "123e4567-e89b-12d3-a456-426614174001",
          agentType: "claude-code",
          mode: "autonomous",
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.id).toBe("run-123");
      expect(body.state).toBe("pending");
    });

    it("returns 400 for invalid schema", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs",
        payload: {
          title: "Test",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /api/agent-runs/:id", () => {
    it("gets an agent run by id", async () => {
      const mockRun = {
        id: "run-123",
        title: "My run",
        state: "running",
      };
      mockGetAgentRun.mockResolvedValue(mockRun);

      const res = await app.inject({
        method: "GET",
        url: "/api/agent-runs/run-123",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(mockRun);
      expect(mockGetAgentRun).toHaveBeenCalledWith("run-123");
    });

    it("returns 404 when run not found", async () => {
      mockGetAgentRun.mockResolvedValue(null);

      const res = await app.inject({
        method: "GET",
        url: "/api/agent-runs/nonexistent",
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /api/agent-runs/:id/mode", () => {
    it("switches the mode of an agent run", async () => {
      const mockRun = {
        id: "run-123",
        mode: "supervised",
        state: "running",
      };
      mockSwitchMode.mockResolvedValue(mockRun);

      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/mode",
        payload: {
          mode: "supervised",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(mockRun);
      expect(mockSwitchMode).toHaveBeenCalledWith("run-123", "supervised");
    });

    it("returns 400 for invalid mode", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/mode",
        payload: {
          mode: "invalid",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /api/agent-runs/:id/interrupt", () => {
    it("interrupts an agent run (needs_attention)", async () => {
      const mockRun = {
        id: "run-123",
        state: "needs_attention",
      };
      mockTransitionState.mockResolvedValue(mockRun);

      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/interrupt",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(mockRun);
      expect(mockTransitionState).toHaveBeenCalledWith("run-123", "needs_attention");
    });
  });

  describe("POST /api/agent-runs/:id/resume", () => {
    it("resumes an agent run (running)", async () => {
      const mockRun = {
        id: "run-123",
        state: "running",
      };
      mockTransitionState.mockResolvedValue(mockRun);

      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/resume",
        payload: {
          prompt: "Continue from where you left off",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(mockRun);
      expect(mockTransitionState).toHaveBeenCalledWith("run-123", "running");
    });
  });

  describe("POST /api/agent-runs/:id/end", () => {
    it("ends an agent run", async () => {
      const mockRun = {
        id: "run-123",
        state: "completed",
      };
      mockTransitionState.mockResolvedValue(mockRun);

      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/end",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(mockRun);
      expect(mockTransitionState).toHaveBeenCalledWith("run-123", "completed");
    });
  });

  describe("GET /api/agent-runs/:id/events", () => {
    it("returns empty list (stub)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agent-runs/run-123/events",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe("GET /api/agent-runs/:id/prs", () => {
    it("returns empty list (stub)", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/agent-runs/run-123/prs",
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual([]);
    });
  });

  describe("POST /api/agent-runs/:id/prs", () => {
    it("registers a PR", async () => {
      mockRegisterPr.mockResolvedValue(undefined);

      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/prs",
        payload: {
          prUrl: "https://github.com/org/repo/pull/42",
          prNumber: 42,
          title: "Fix bug",
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual({ ok: true });
      expect(mockRegisterPr).toHaveBeenCalledWith(
        "run-123",
        "https://github.com/org/repo/pull/42",
        42,
        "Fix bug",
      );
    });

    it("returns 400 for invalid URL", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/agent-runs/run-123/prs",
        payload: {
          prUrl: "not-a-url",
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });
});
