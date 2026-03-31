import { describe, it, expect, vi, beforeEach } from "vitest";
import { ImageRegistry, ImageRegistryError } from "./ImageRegistry.js";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("ImageRegistry", () => {
  let registry: ImageRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ImageRegistry({
      registryUrl: "http://registry.local:5000",
    });
  });

  describe("constructor", () => {
    it("should use REGISTRY_URL env var when no config provided", () => {
      const original = process.env.REGISTRY_URL;
      process.env.REGISTRY_URL = "http://my-registry:5000";
      const reg = new ImageRegistry();
      expect(reg).toBeDefined();
      process.env.REGISTRY_URL = original;
    });

    it("should throw error when no registry URL is configured", () => {
      const original = process.env.REGISTRY_URL;
      delete process.env.REGISTRY_URL;
      expect(() => new ImageRegistry()).toThrow(ImageRegistryError);
      expect(() => new ImageRegistry()).toThrow("REGISTRY_URL");
      process.env.REGISTRY_URL = original;
    });

    it("should accept authentication credentials", () => {
      const reg = new ImageRegistry({
        registryUrl: "http://registry.local:5000",
        username: "user",
        password: "pass",
      });
      expect(reg).toBeDefined();
    });
  });

  describe("push()", () => {
    it("should push an image tag to the registry", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 202,
      });

      await registry.push("optio-agent-workspace1-repo1:v1.0.0");

      expect(mockFetch).toHaveBeenCalledWith(
        "http://registry.local:5000/v2/optio-agent-workspace1-repo1/manifests/v1.0.0",
        expect.objectContaining({
          method: "PUT",
        }),
      );
    });

    it("should throw error when push fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(registry.push("optio-agent-workspace1-repo1:v1.0.0")).rejects.toThrow(
        ImageRegistryError,
      );
    });

    it("should include auth header when credentials are configured", async () => {
      const reg = new ImageRegistry({
        registryUrl: "http://registry.local:5000",
        username: "user",
        password: "pass",
      });
      mockFetch.mockResolvedValueOnce({ ok: true, status: 202 });

      await reg.push("test-image:v1");

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[1].headers).toHaveProperty("Authorization");
    });
  });

  describe("listImages()", () => {
    it("should list images matching a pattern", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              repositories: [
                "optio-agent-workspace1-repo1",
                "optio-agent-workspace1-repo2",
                "other-image",
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({ name: "optio-agent-workspace1-repo1", tags: ["v1", "v2", "latest"] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ name: "optio-agent-workspace1-repo2", tags: ["v1", "v3"] }),
        });

      const images = await registry.listImages("optio-agent-workspace1");

      expect(images).toContain("optio-agent-workspace1-repo1:v1");
      expect(images).toContain("optio-agent-workspace1-repo1:v2");
      expect(images).toContain("optio-agent-workspace1-repo2:v1");
      expect(images).not.toContain("other-image");
    });

    it("should return empty array when no images match", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ repositories: [] }),
      });

      const images = await registry.listImages("nonexistent");
      expect(images).toEqual([]);
    });

    it("should throw error when catalog fetch fails", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(registry.listImages("pattern")).rejects.toThrow(ImageRegistryError);
    });
  });

  describe("delete()", () => {
    it("should delete an image by tag", async () => {
      // First fetch gets the digest
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (name: string) => (name === "Docker-Content-Digest" ? "sha256:abc123" : null),
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 202,
        });

      await registry.delete("optio-agent-workspace1-repo1:v1");

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // Second call should be DELETE with digest
      const deleteCall = mockFetch.mock.calls[1];
      expect(deleteCall[1].method).toBe("DELETE");
      expect(deleteCall[0]).toContain("sha256:abc123");
    });

    it("should throw error when delete fails", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: () => "sha256:abc123",
          },
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        });

      await expect(registry.delete("optio-agent-workspace1-repo1:v1")).rejects.toThrow(
        ImageRegistryError,
      );
    });
  });

  describe("getImageDigest()", () => {
    it("should return the digest for a given image tag", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => (name === "Docker-Content-Digest" ? "sha256:def456" : null),
        },
      });

      const digest = await registry.getImageDigest("my-image:v1");
      expect(digest).toBe("sha256:def456");
    });
  });
});
