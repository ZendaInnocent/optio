import { describe, it, expect, vi, beforeEach } from "vitest";
import { BuildJobManager } from "./build-job-manager.js";

// Mock db client
vi.mock("../db/client.js", () => ({
  db: {
    insert: vi.fn().mockReturnThis(),
    into: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
  },
}));

// Mock schema
vi.mock("../db/schema.js", () => ({
  customImages: {
    id: "id",
    workspaceId: "workspace_id",
    repoUrl: "repo_url",
    imageTag: "image_tag",
    agentTypes: "agent_types",
    languagePreset: "language_preset",
    customDockerfile: "custom_dockerfile",
    buildStatus: "build_status",
    buildLogs: "build_logs",
    builtAt: "built_at",
    builtBy: "built_by",
  },
}));

// Mock build queue (imported from worker file)
vi.mock("../workers/image-build-worker.js", () => ({
  buildQueue: {
    add: vi.fn().mockResolvedValue({ id: "job-123" }),
  },
  startImageBuildWorker: vi.fn(),
}));

vi.mock("../logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

import { db } from "../db/client.js";
import { buildQueue } from "../workers/image-build-worker.js";

describe("BuildJobManager", () => {
  let manager: BuildJobManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new BuildJobManager();
  });

  describe("submitBuild", () => {
    it("creates a custom image record and queues a build job", async () => {
      const config = { agentTypes: ["claude-code"], languagePreset: "node" };
      const workspaceId = "workspace-123";
      const repoUrl = "https://github.com/org/repo";
      const userId = "user-456";

      const mockRecord = {
        id: "custom-image-123",
        workspaceId,
        repoUrl,
        imageTag: `optio/${workspaceId}/custom-custom-image-123:latest`,
        agentTypes: config.agentTypes,
        languagePreset: config.languagePreset,
        buildStatus: "pending",
        buildLogs: null,
        builtAt: null,
        builtBy: userId,
      };

      vi.mocked(
        db.insert(undefined as any).values(undefined as any).returning,
      ).mockResolvedValueOnce([mockRecord] as any);

      const result = await manager.submitBuild(config as any, workspaceId, repoUrl, userId);

      expect(result).toEqual({
        id: mockRecord.id,
        status: "pending",
        logs: undefined,
        startedAt: undefined,
        finishedAt: undefined,
      });

      expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({}));
      expect((db as any).values).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          repoUrl,
          agentTypes: config.agentTypes,
          languagePreset: config.languagePreset,
          buildStatus: "pending",
          builtBy: userId,
        }),
      );
      expect(buildQueue.add).toHaveBeenCalledWith(
        "build",
        { customImageId: expect.any(String) },
        expect.objectContaining({
          attempts: 3,
          backoff: { type: "exponential", delay: 30000 },
        }),
      );
    });

    it("handles workspace-wide images when repoUrl is null", async () => {
      const config = { agentTypes: ["codex"], languagePreset: "full" };
      const workspaceId = "workspace-999";
      const repoUrl: string | null = null;
      const userId = "user-888";

      const mockRecord = {
        id: "custom-ws-123",
        workspaceId,
        repoUrl: null,
        imageTag: `optio/${workspaceId}/custom-custom-ws-123:latest`,
        buildStatus: "pending",
      };

      vi.mocked(
        db.insert(undefined as any).values(undefined as any).returning,
      ).mockResolvedValueOnce([mockRecord] as any);

      const result = await manager.submitBuild(config as any, workspaceId, repoUrl, userId);

      expect(result.id).toBe(mockRecord.id);
      expect((db as any).values).toHaveBeenCalledWith(
        expect.objectContaining({
          repoUrl: null,
        }),
      );
    });
  });

  describe("getBuildStatus", () => {
    it("retrieves build status by custom image id", async () => {
      const customImageId = "img-123";
      const mockRecord = {
        id: customImageId,
        buildStatus: "building",
        builtAt: new Date(),
      };

      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([
        mockRecord,
      ]);

      const result = await manager.getBuildStatus(customImageId);

      expect(result).toEqual({
        id: customImageId,
        status: "building",
        logs: undefined,
        startedAt: mockRecord.builtAt,
        finishedAt: undefined,
      });
    });

    it("returns null if custom image not found", async () => {
      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([]);

      const result = await manager.getBuildStatus("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getBuildLogs", () => {
    it("retrieves build logs by custom image id", async () => {
      const customImageId = "img-456";
      const logs = "Build log line 1\nBuild log line 2";

      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([
        { buildLogs: logs },
      ]);

      const result = await manager.getBuildLogs(customImageId);
      expect(result).toBe(logs);
    });

    it("returns null if no logs exist", async () => {
      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([
        { buildLogs: null },
      ]);

      const result = await manager.getBuildLogs("img-789");
      expect(result).toBeNull();
    });
  });

  describe("cancelBuild", () => {
    it("cancels a pending build", async () => {
      const customImageId = "img-cancel";
      const mockRecord = { buildStatus: "pending" };

      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([
        mockRecord,
      ]);
      vi.mocked(
        db.update(undefined as any).set(undefined as any).where as any,
      ).mockResolvedValueOnce([]);

      const result = await manager.cancelBuild(customImageId);

      expect(result).toBe(true);
      expect(db.update).toHaveBeenCalledWith(expect.objectContaining({}));
      expect((db as any).set).toHaveBeenCalledWith({ buildStatus: "cancelled" });
    });

    it("does not cancel a completed build", async () => {
      const customImageId = "img-completed";
      const mockRecord = { buildStatus: "success" };

      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([
        mockRecord,
      ]);

      const result = await manager.cancelBuild(customImageId);
      expect(result).toBe(false);
    });

    it("returns false if custom image not found", async () => {
      vi.mocked(db.select().from(undefined as any).where as any).mockResolvedValueOnce([]);

      const result = await manager.cancelBuild("nonexistent");
      expect(result).toBe(false);
    });
  });
});
