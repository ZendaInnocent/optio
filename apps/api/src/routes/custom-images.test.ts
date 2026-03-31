import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

// ─── Mocks ───

const mockGetBuildStatus = vi.fn();
const mockGetBuildLogs = vi.fn();
const mockCancelBuild = vi.fn();
const mockSubmitBuild = vi.fn();
const mockGetRepo = vi.fn();
const mockUpdateRepo = vi.fn();

vi.mock("../services/build-job-manager.js", () => ({
  buildJobManager: {
    getBuildStatus: (...args: unknown[]) => mockGetBuildStatus(...args),
    getBuildLogs: (...args: unknown[]) => mockGetBuildLogs(...args),
    cancelBuild: (...args: unknown[]) => mockCancelBuild(...args),
    submitBuild: (...args: unknown[]) => mockSubmitBuild(...args),
  },
}));

vi.mock("../services/repo-service.js", () => ({
  getRepo: (...args: unknown[]) => mockGetRepo(...args),
  updateRepo: (...args: unknown[]) => mockUpdateRepo(...args),
}));

const mockDb = {
  select: vi.fn().mockReturnThis(),
  from: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
};

vi.mock("../db/client.js", () => ({
  get db() {
    return mockDb;
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col: unknown, val: unknown) => ({ column: col, value: val })),
  and: vi.fn((...args: unknown[]) => ({ conditions: args })),
}));

import { customImagesRoutes } from "./custom-images.js";

// ─── Helpers ───

const mockRepo = {
  id: "repo-1",
  workspaceId: "ws-1",
  repoUrl: "https://github.com/test/repo",
  fullName: "test/repo",
  imagePreset: "node",
  agentTypes: ["opencode"],
  customDockerfile: null,
};

const mockBuild = {
  id: "build-1",
  status: "success" as const,
  logs: "Build completed successfully",
  startedAt: new Date("2026-01-01"),
  finishedAt: new Date("2026-01-01"),
};

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorateRequest("user", undefined as any);
  app.addHook("preHandler", (req, _reply, done) => {
    (req as any).user = { workspaceId: "ws-1", workspaceRole: "admin", id: "user-1" };
    done();
  });
  app.setErrorHandler((error: Error, _req, reply) => {
    if (error.name === "ZodError") {
      return reply.status(400).send({ error: "Validation error", details: error.message });
    }
    reply.status(500).send({ error: "Internal server error" });
  });
  await customImagesRoutes(app);
  await app.ready();
  return app;
}

// ─── Tests ───

describe("GET /api/v1/agents", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("returns agent catalog", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/agents" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.agents).toHaveLength(3);
    expect(body.agents[0].id).toBe("claude-code");
    expect(body.agents[0].label).toBe("Claude Code");
    expect(body.agents[0].installCommand).toBeDefined();
  });
});

describe("GET /api/v1/languages", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("returns language presets", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/languages" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.languages.length).toBeGreaterThan(0);
    expect(body.languages[0].id).toBe("base");
    expect(body.languages[0].languages).toBeDefined();
  });
});

describe("GET /api/v1/repos/:repoId/image-config", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("returns repo image config with workspace defaults", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/repos/repo-1/image-config",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.config.agentTypes).toEqual(["opencode"]);
    expect(body.config.languagePreset).toBe("node");
    expect(body.config.customDockerfile).toBeNull();
  });

  it("returns 404 for non-existent repo", async () => {
    mockGetRepo.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/repos/nonexistent/image-config",
    });

    expect(res.statusCode).toBe(404);
  });

  it("returns 403 for repo in different workspace", async () => {
    mockGetRepo.mockResolvedValue({ ...mockRepo, workspaceId: "ws-other" });

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/repos/repo-1/image-config",
    });

    expect(res.statusCode).toBe(403);
  });
});

describe("PUT /api/v1/repos/:repoId/image-config", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("updates repo image config when user has can_build permission", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);
    mockDb.where.mockResolvedValue([{ canBuild: true }]);
    mockUpdateRepo.mockResolvedValue({ ...mockRepo, agentTypes: ["claude-code", "opencode"] });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/repos/repo-1/image-config",
      payload: {
        agentTypes: ["claude-code", "opencode"],
        languagePreset: "full",
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.config.agentTypes).toEqual(["claude-code", "opencode"]);
    expect(body.config.languagePreset).toBe("full");
    expect(mockUpdateRepo).toHaveBeenCalledWith("repo-1", {
      agentTypes: ["claude-code", "opencode"],
      languagePreset: "full",
    });
  });

  it("returns 403 when user lacks can_build permission", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);
    mockDb.where.mockResolvedValue([{ canBuild: false }]);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/repos/repo-1/image-config",
      payload: { agentTypes: ["opencode"] },
    });

    expect(res.statusCode).toBe(403);
  });

  it("rejects invalid agent type", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/repos/repo-1/image-config",
      payload: { agentTypes: ["invalid-agent"] },
    });

    expect(res.statusCode).toBe(400);
  });

  it("rejects invalid language preset", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/repos/repo-1/image-config",
      payload: { languagePreset: "invalid-preset" },
    });

    expect(res.statusCode).toBe(400);
  });

  it("accepts optional customDockerfile", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);
    mockDb.where.mockResolvedValue([{ canBuild: true }]);
    mockUpdateRepo.mockResolvedValue({ ...mockRepo, customDockerfile: "FROM node:18" });

    const res = await app.inject({
      method: "PUT",
      url: "/api/v1/repos/repo-1/image-config",
      payload: {
        agentTypes: ["opencode"],
        customDockerfile: "FROM node:18",
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().config.customDockerfile).toBe("FROM node:18");
  });
});

describe("POST /api/v1/repos/:repoId/build-image", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("triggers build and returns 202 with buildId", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);
    mockDb.where.mockResolvedValue([{ canBuild: true }]);
    mockSubmitBuild.mockResolvedValue({ id: "build-1", status: "pending" });

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/repos/repo-1/build-image",
      payload: {
        agentTypes: ["opencode"],
        languagePreset: "node",
      },
    });

    expect(res.statusCode).toBe(202);
    const body = res.json();
    expect(body.buildId).toBe("build-1");
    expect(mockSubmitBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        agentTypes: ["opencode"],
        languagePreset: "node",
      }),
      "ws-1",
      "https://github.com/test/repo",
      "user-1",
    );
  });

  it("returns 403 when user lacks can_build permission", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);
    mockDb.where.mockResolvedValue([{ canBuild: false }]);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/repos/repo-1/build-image",
      payload: { agentTypes: ["opencode"], languagePreset: "node" },
    });

    expect(res.statusCode).toBe(403);
  });

  it("returns 404 for non-existent repo", async () => {
    mockGetRepo.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/repos/nonexistent/build-image",
      payload: { agentTypes: ["opencode"], languagePreset: "node" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("rejects invalid build config", async () => {
    mockGetRepo.mockResolvedValue(mockRepo);

    const res = await app.inject({
      method: "POST",
      url: "/api/v1/repos/repo-1/build-image",
      payload: { agentTypes: [], languagePreset: "invalid" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("GET /api/v1/builds", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("returns list of builds for workspace", async () => {
    mockDb.where.mockResolvedValue([
      {
        id: "build-1",
        workspaceId: "ws-1",
        repoUrl: "https://github.com/test/repo",
        imageTag: "optio/ws-1/custom-1:latest",
        agentTypes: ["opencode"],
        languagePreset: "node",
        buildStatus: "success",
        buildLogs: "Build completed",
        builtAt: new Date("2026-01-01"),
        createdAt: new Date("2026-01-01"),
      },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/v1/builds" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.builds).toHaveLength(1);
    expect(body.builds[0].id).toBe("build-1");
  });

  it("supports filtering by status", async () => {
    mockDb.where.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/builds?status=success",
    });

    expect(res.statusCode).toBe(200);
  });

  it("supports filtering by repo", async () => {
    mockDb.where.mockResolvedValue([]);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/builds?repo=repo-1",
    });

    expect(res.statusCode).toBe(200);
  });
});

describe("GET /api/v1/builds/:buildId", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("returns build details including logs", async () => {
    mockGetBuildStatus.mockResolvedValue(mockBuild);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/builds/build-1",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.build.id).toBe("build-1");
    expect(body.build.status).toBe("success");
    expect(body.build.logs).toBe("Build completed successfully");
  });

  it("returns 404 for non-existent build", async () => {
    mockGetBuildStatus.mockResolvedValue(null);

    const res = await app.inject({
      method: "GET",
      url: "/api/v1/builds/nonexistent",
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("DELETE /api/v1/builds/:buildId", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("cancels a pending or running build", async () => {
    mockCancelBuild.mockResolvedValue(true);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/builds/build-1",
    });

    expect(res.statusCode).toBe(200);
    expect(mockCancelBuild).toHaveBeenCalledWith("build-1");
  });

  it("returns 404 when build cannot be cancelled", async () => {
    mockCancelBuild.mockResolvedValue(false);

    const res = await app.inject({
      method: "DELETE",
      url: "/api/v1/builds/build-1",
    });

    expect(res.statusCode).toBe(404);
  });
});
