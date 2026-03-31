import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { api } from "./api-client";

describe("api-client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    // Stub localStorage
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockResponse(data: unknown, status = 200) {
    fetchMock.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
    });
  }

  describe("listTasks", () => {
    it("fetches tasks without params", async () => {
      mockResponse({ tasks: [] });
      const result = await api.listTasks();
      expect(result).toEqual({ tasks: [] });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks",
        expect.objectContaining({ headers: {} }),
      );
    });

    it("appends query params when provided", async () => {
      mockResponse({ tasks: [] });
      await api.listTasks({ state: "running", limit: 10, offset: 5 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("state=running");
      expect(url).toContain("limit=10");
      expect(url).toContain("offset=5");
    });
  });

  describe("getTask", () => {
    it("fetches a single task by id", async () => {
      const taskData = { task: { id: "abc", title: "Test" } };
      mockResponse(taskData);
      const result = await api.getTask("abc");
      expect(result).toEqual(taskData);
      expect(fetchMock).toHaveBeenCalledWith("/api/tasks/abc", expect.any(Object));
    });
  });

  describe("createTask", () => {
    it("sends POST with JSON body", async () => {
      mockResponse({ task: { id: "new-1" } });
      await api.createTask({
        title: "New Task",
        prompt: "Do something",
        repoUrl: "https://github.com/test/repo",
        agentType: "claude-code",
      });
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/tasks");
      expect(opts.method).toBe("POST");
      expect(opts.headers["Content-Type"]).toBe("application/json");
      const body = JSON.parse(opts.body);
      expect(body.title).toBe("New Task");
    });
  });

  describe("cancelTask", () => {
    it("sends POST to cancel endpoint", async () => {
      mockResponse({ task: { id: "abc", state: "cancelled" } });
      await api.cancelTask("abc");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/abc/cancel",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("error handling", () => {
    it("throws on non-ok response with error message", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Bad request" }),
      });
      await expect(api.getTask("abc")).rejects.toThrow("Bad request");
    });

    it("throws generic error when response has no error field", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
      await expect(api.getTask("abc")).rejects.toThrow("API error: 500");
    });

    it("handles JSON parse failure on error response", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error("parse failed")),
      });
      await expect(api.getTask("abc")).rejects.toThrow("API error: 500");
    });
  });

  describe("204 responses", () => {
    it("returns undefined for 204 status", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve(null),
      });
      const result = await api.deleteSecret("test-secret");
      expect(result).toBeUndefined();
    });
  });

  describe("workspace header", () => {
    it("includes x-workspace-id header when set", async () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("ws-123");
      mockResponse({ tasks: [] });
      await api.listTasks();
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers["x-workspace-id"]).toBe("ws-123");
    });

    it("omits x-workspace-id header when not set", async () => {
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(null);
      mockResponse({ tasks: [] });
      await api.listTasks();
      const headers = fetchMock.mock.calls[0][1].headers;
      expect(headers["x-workspace-id"]).toBeUndefined();
    });
  });

  describe("retryTask", () => {
    it("sends POST to retry endpoint", async () => {
      mockResponse({ task: { id: "abc", state: "queued" } });
      await api.retryTask("abc");
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/abc/retry",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("searchTasks", () => {
    it("builds query string from search params", async () => {
      mockResponse({ tasks: [], nextCursor: null, hasMore: false });
      await api.searchTasks({ q: "test", state: "running", limit: 20 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("q=test");
      expect(url).toContain("state=running");
      expect(url).toContain("limit=20");
    });

    it("omits empty/null params", async () => {
      mockResponse({ tasks: [], nextCursor: null, hasMore: false });
      await api.searchTasks({ q: "", state: undefined });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toBe("/api/tasks/search");
    });
  });

  describe("exportTaskLogs", () => {
    it("returns a URL string (not a fetch call)", () => {
      const url = api.exportTaskLogs("abc", { format: "json" });
      expect(url).toBe("/api/tasks/abc/logs/export?format=json");
    });

    it("returns base URL without params", () => {
      const url = api.exportTaskLogs("abc");
      expect(url).toBe("/api/tasks/abc/logs/export");
    });
  });

  describe("bulk operations", () => {
    it("bulkRetryFailed sends POST", async () => {
      mockResponse({ retried: 3, total: 5 });
      const result = await api.bulkRetryFailed();
      expect(result).toEqual({ retried: 3, total: 5 });
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/tasks/bulk/retry-failed",
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("bulkCancelActive sends POST", async () => {
      mockResponse({ cancelled: 2, total: 4 });
      const result = await api.bulkCancelActive();
      expect(result).toEqual({ cancelled: 2, total: 4 });
    });
  });

  describe("image configuration", () => {
    describe("listAgents", () => {
      it("fetches agent catalog", async () => {
        mockResponse({
          agents: [
            {
              id: "claude-code",
              label: "Claude Code",
              description: "Anthropic's agent",
              installCommand: "",
              requiredSecrets: [],
            },
          ],
        });
        const result = await api.listAgents();
        expect(result.agents).toHaveLength(1);
        expect(result.agents[0].id).toBe("claude-code");
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/agents", expect.any(Object));
      });
    });

    describe("listLanguages", () => {
      it("fetches language presets", async () => {
        mockResponse({
          languages: [
            {
              id: "node",
              label: "Node.js",
              description: "Node.js preset",
              languages: ["javascript", "typescript"],
            },
          ],
        });
        const result = await api.listLanguages();
        expect(result.languages).toHaveLength(1);
        expect(result.languages[0].id).toBe("node");
      });
    });

    describe("getImageConfig", () => {
      it("fetches image config for a repo", async () => {
        mockResponse({
          config: { agentTypes: ["claude-code"], languagePreset: "node", customDockerfile: null },
          repo: { id: "repo-1", fullName: "test/repo", repoUrl: "https://github.com/test/repo" },
        });
        const result = await api.getImageConfig("repo-1");
        expect(result.config.agentTypes).toEqual(["claude-code"]);
        expect(result.config.languagePreset).toBe("node");
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/v1/repos/repo-1/image-config",
          expect.any(Object),
        );
      });
    });

    describe("updateImageConfig", () => {
      it("sends PUT with image config data", async () => {
        mockResponse({
          config: { agentTypes: ["claude-code", "opencode"], languagePreset: "python" },
        });
        const result = await api.updateImageConfig("repo-1", {
          agentTypes: ["claude-code", "opencode"],
          languagePreset: "python",
        });
        expect(result.config.agentTypes).toEqual(["claude-code", "opencode"]);
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/v1/repos/repo-1/image-config");
        expect(opts.method).toBe("PUT");
        const body = JSON.parse(opts.body);
        expect(body.agentTypes).toEqual(["claude-code", "opencode"]);
      });
    });

    describe("buildImage", () => {
      it("sends POST to trigger image build", async () => {
        mockResponse({ buildId: "build-123", status: "pending" });
        const result = await api.buildImage("repo-1", {
          agentTypes: ["claude-code"],
          languagePreset: "node",
        });
        expect(result.buildId).toBe("build-123");
        expect(result.status).toBe("pending");
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/v1/repos/repo-1/build-image");
        expect(opts.method).toBe("POST");
      });
    });

    describe("listBuilds", () => {
      it("fetches builds without params", async () => {
        mockResponse({
          builds: [
            {
              id: "build-1",
              repoUrl: "https://github.com/test/repo",
              imageTag: "optio-node:latest",
              agentTypes: ["claude-code"],
              languagePreset: "node",
              buildStatus: "success",
              builtAt: "2024-01-01T00:00:00Z",
              createdAt: "2024-01-01T00:00:00Z",
            },
          ],
        });
        const result = await api.listBuilds();
        expect(result.builds).toHaveLength(1);
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/builds", expect.any(Object));
      });

      it("appends query params when provided", async () => {
        mockResponse({ builds: [] });
        await api.listBuilds({ status: "success", repo: "https://github.com/test/repo" });
        const url = fetchMock.mock.calls[0][0] as string;
        expect(url).toContain("status=success");
        expect(url).toContain("repo=");
      });
    });

    describe("getBuildStatus", () => {
      it("fetches build status by id", async () => {
        mockResponse({ build: { id: "build-123", status: "building" } });
        const result = await api.getBuildStatus("build-123");
        expect(result.build.id).toBe("build-123");
        expect(fetchMock).toHaveBeenCalledWith("/api/v1/builds/build-123", expect.any(Object));
      });
    });

    describe("cancelBuild", () => {
      it("sends DELETE to cancel build", async () => {
        mockResponse({ message: "Build cancelled" });
        const result = await api.cancelBuild("build-123");
        expect(result.message).toBe("Build cancelled");
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/v1/builds/build-123",
          expect.objectContaining({ method: "DELETE" }),
        );
      });
    });
  });
});
