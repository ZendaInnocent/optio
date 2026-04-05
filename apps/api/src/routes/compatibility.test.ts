import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// Import compat route registrars
import { registerCompatTaskRoutes } from "./tasks.compat.js";
import { registerCompatSessionRoutes } from "./sessions.compat.js";

// Mock services
import * as agentRunService from "../services/agent-run-service.js";
import * as repoService from "../services/repo-service.js";

vi.mock("../services/agent-run-service");
vi.mock("../services/repo-service");

describe("Compatibility Routes", () => {
  let app: FastifyInstance;

  // Helper to build app with authenticated user
  async function buildApp(): Promise<FastifyInstance> {
    const fastify = Fastify({ logger: false });
    fastify.decorateRequest("user", undefined as any);
    // Set user in preValidation so authRequired sees it
    fastify.addHook("preValidation", (req: any, _reply: any, done: any) => {
      req.user = { id: "user-1", workspaceId: "ws-1", workspaceRole: "admin" };
      done();
    });
    await fastify.register(registerCompatTaskRoutes);
    await fastify.register(registerCompatSessionRoutes);
    await fastify.ready();
    return fastify;
  }

  // Build app without any auth hook (for 401 tests)
  async function buildAppNoAuth(): Promise<FastifyInstance> {
    const fastify = Fastify({ logger: false });
    await fastify.register(registerCompatTaskRoutes);
    await fastify.register(registerCompatSessionRoutes);
    await fastify.ready();
    return fastify;
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/tasks", () => {
    it("GET /api/tasks/:id redirects to /api/agent-runs/:id", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/tasks/123",
      });
      expect(response.statusCode).toBe(301);
      expect(response.headers.location).toBe("/api/agent-runs/123");
    });

    it("GET /api/tasks redirects list to agent-runs with mode=autonomous", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/tasks",
      });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("/api/agent-runs?mode=autonomous");
    });
  });

  describe("GET /api/sessions", () => {
    it("GET /api/sessions/:id redirects to /api/agent-runs/:id", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/sessions/456",
      });
      expect(response.statusCode).toBe(301);
      expect(response.headers.location).toBe("/api/agent-runs/456");
    });

    it("GET /api/sessions redirects list to agent-runs with mode=interactive", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/sessions",
      });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe("/api/agent-runs?mode=interactive");
    });
  });

  describe("POST /api/tasks", () => {
    it("creates agent run with mode=autonomous", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "run-1",
        title: "Task",
        mode: "autonomous",
        workspaceId: "ws-1",
        repoId: "repo-1",
        agentType: "claude-code",
        state: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(agentRunService.createAgentRun).mockImplementation(mockCreate);
      vi.mocked(repoService.getRepoByUrl).mockResolvedValue({
        id: "repo-1",
        repoUrl: "https://github.com/org/repo",
        workspaceId: "ws-1",
      } as any);

      app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          title: "Task",
          prompt: "Do",
          repoUrl: "https://github.com/org/repo",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
        },
      });
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.mode).toBe("autonomous");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Task",
          initialPrompt: "Do",
          repoId: "repo-1",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
          mode: "autonomous",
        }),
      );
    });

    it("returns 401 when not authenticated", async () => {
      const fastify = await buildAppNoAuth();
      const response = await fastify.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          title: "Task",
          prompt: "Do",
          repoUrl: "https://github.com/org/repo",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
        },
      });
      expect(response.statusCode).toBe(401);
    });

    it("returns 404 when repository not found", async () => {
      vi.mocked(repoService.getRepoByUrl).mockResolvedValue(null);
      app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/tasks",
        payload: {
          title: "Task",
          prompt: "Do",
          repoUrl: "https://github.com/org/repo",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
        },
      });
      expect(response.statusCode).toBe(404);
      expect(JSON.parse(response.body)).toEqual({ error: "Repository not found" });
    });
  });

  describe("POST /api/sessions", () => {
    it("creates agent run with mode=interactive", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        id: "run-2",
        title: "Interactive session",
        mode: "interactive",
        initialPrompt: "",
        maxTurns: 100,
        workspaceId: "ws-1",
        repoId: "repo-1",
        agentType: "claude-code",
        state: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(agentRunService.createAgentRun).mockImplementation(mockCreate);
      vi.mocked(repoService.getRepoByUrl).mockResolvedValue({
        id: "repo-1",
        repoUrl: "https://github.com/org/repo",
        workspaceId: "ws-1",
      } as any);

      app = await buildApp();
      const response = await app.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {
          repoUrl: "https://github.com/org/repo",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
        },
      });
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.mode).toBe("interactive");
      expect(body.initialPrompt).toBe("");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Interactive session",
          initialPrompt: "",
          repoId: "repo-1",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
          mode: "interactive",
          maxTurns: 100,
        }),
      );
    });

    it("returns 401 when not authenticated", async () => {
      const fastify = await buildAppNoAuth();
      const response = await fastify.inject({
        method: "POST",
        url: "/api/sessions",
        payload: {
          repoUrl: "https://github.com/org/repo",
          workspaceId: "11111111-1111-1111-1111-111111111111",
          agentType: "claude-code",
        },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
