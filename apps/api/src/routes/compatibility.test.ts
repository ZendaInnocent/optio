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

describe("Compatibility Routes (Deprecated)", () => {
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
    it("GET /api/tasks/:id returns 410 Gone", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/tasks/123",
      });
      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("deprecated");
    });

    it("GET /api/tasks returns 410 Gone", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/tasks",
      });
      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("deprecated");
    });
  });

  describe("GET /api/sessions", () => {
    it("GET /api/sessions/:id returns 410 Gone", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/sessions/456",
      });
      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("deprecated");
    });

    it("GET /api/sessions returns 410 Gone", async () => {
      app = await buildApp();
      const response = await app.inject({
        method: "GET",
        url: "/api/sessions",
      });
      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("deprecated");
    });
  });

  describe("POST /api/tasks", () => {
    it("returns 410 Gone (deprecated)", async () => {
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
      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("deprecated");
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
  });

  describe("POST /api/sessions", () => {
    it("returns 410 Gone (deprecated)", async () => {
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
      expect(response.statusCode).toBe(410);
      const body = JSON.parse(response.body);
      expect(body.error).toContain("deprecated");
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
