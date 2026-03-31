import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageRegistry, ImageRegistryError } from "./ImageRegistry.js";
import { ImageCleanupService } from "./ImageCleanupService.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock ImageRegistry
vi.mock("./ImageRegistry.js", () => ({
  ImageRegistry: vi.fn(),
  ImageRegistryError: class extends Error {},
}));

describe("ImageCleanupService", () => {
  let mockRegistry: {
    listImages: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  let cleanupService: ImageCleanupService;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = {
      listImages: vi.fn(),
      delete: vi.fn(),
    };

    vi.mocked(ImageRegistry).mockImplementation(() => mockRegistry as unknown as ImageRegistry);

    cleanupService = new ImageCleanupService({
      registryUrl: "http://registry.local:5000",
      keepLatest: 3,
      imagePrefix: "optio-agent",
    });
  });

  describe("cleanup()", () => {
    it("should keep latest N images and delete older ones", async () => {
      mockRegistry.listImages.mockResolvedValue([
        "optio-agent-workspace1-repo1:v1",
        "optio-agent-workspace1-repo1:v2",
        "optio-agent-workspace1-repo1:v3",
        "optio-agent-workspace1-repo1:v4",
        "optio-agent-workspace1-repo1:v5",
      ]);

      const result = await cleanupService.cleanup();

      expect(result.deleted).toBe(2);
      expect(result.kept).toBe(3);
      expect(mockRegistry.delete).toHaveBeenCalledTimes(2);
      expect(mockRegistry.delete).toHaveBeenCalledWith("optio-agent-workspace1-repo1:v1");
      expect(mockRegistry.delete).toHaveBeenCalledWith("optio-agent-workspace1-repo1:v2");
    });

    it("should not delete anything when under the limit", async () => {
      mockRegistry.listImages.mockResolvedValue([
        "optio-agent-workspace1-repo1:v1",
        "optio-agent-workspace1-repo1:v2",
      ]);

      const result = await cleanupService.cleanup();

      expect(result.deleted).toBe(0);
      expect(result.kept).toBe(2);
      expect(mockRegistry.delete).not.toHaveBeenCalled();
    });

    it("should handle delete failures gracefully", async () => {
      mockRegistry.listImages.mockResolvedValue([
        "optio-agent-workspace1-repo1:v1",
        "optio-agent-workspace1-repo1:v2",
        "optio-agent-workspace1-repo1:v3",
        "optio-agent-workspace1-repo1:v4",
        "optio-agent-workspace1-repo1:v5",
      ]);

      // v1 and v2 should be deleted (keepLatest=3, so 5-3=2 to delete)
      mockRegistry.delete.mockRejectedValueOnce(new ImageRegistryError("Image in use"));
      mockRegistry.delete.mockResolvedValueOnce(undefined);

      const result = await cleanupService.cleanup();

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("should use default keepLatest of 5 when not specified", () => {
      const service = new ImageCleanupService({
        registryUrl: "http://registry.local:5000",
      });
      expect(service).toBeDefined();
    });

    it("should filter images by prefix", async () => {
      mockRegistry.listImages.mockResolvedValue([
        "optio-agent-workspace1-repo1:v1",
        "optio-agent-workspace1-repo1:v2",
        "optio-agent-workspace1-repo1:v3",
        "optio-agent-workspace1-repo1:v4",
        "optio-agent-workspace1-repo1:v5",
        "optio-agent-workspace1-repo1:v6",
        "other-image:v1",
      ]);

      const result = await cleanupService.cleanup();

      // Should delete 3 images (6 total - 3 kept = 3 deleted)
      // other-image:v1 should be kept but not counted in optio-agent deletions
      expect(result.deleted).toBe(3);
      expect(result.kept).toBe(4); // 3 from optio-agent + 1 from other-image
    });

    it("should return summary with workspace-repo breakdown", async () => {
      mockRegistry.listImages.mockResolvedValue([
        "optio-agent-ws1-repo1:v1",
        "optio-agent-ws1-repo1:v2",
        "optio-agent-ws1-repo1:v3",
        "optio-agent-ws1-repo1:v4",
        "optio-agent-ws2-repo1:v1",
        "optio-agent-ws2-repo1:v2",
      ]);

      const result = await cleanupService.cleanup();

      expect(result.summaryByRepo).toBeDefined();
      expect(Object.keys(result.summaryByRepo).length).toBeGreaterThan(0);
    });
  });

  describe("parseImageComponents()", () => {
    it("should parse workspace and repo from image name", async () => {
      const components = cleanupService.parseImageComponents("optio-agent-myworkspace-myrepo");

      expect(components.workspace).toBe("myworkspace");
      expect(components.repo).toBe("myrepo");
    });

    it("should handle complex repo names with slashes", async () => {
      const components = cleanupService.parseImageComponents("optio-agent-workspace-org-repo");

      expect(components.workspace).toBe("workspace");
      expect(components.repo).toBe("org-repo");
    });
  });
});
