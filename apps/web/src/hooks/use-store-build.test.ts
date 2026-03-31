import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useStore } from "./use-store";

describe("use-store build state", () => {
  beforeEach(() => {
    useStore.setState({
      builds: [],
    });
  });

  afterEach(() => {
    useStore.setState({
      builds: [],
    });
  });

  it("initializes with empty builds array", () => {
    expect(useStore.getState().builds).toEqual([]);
  });

  it("sets builds via setBuilds", () => {
    const builds = [
      {
        id: "build-1",
        repoUrl: "https://github.com/test/repo",
        imageTag: "optio/ws/custom-1:latest",
        agentTypes: ["claude-code"],
        languagePreset: "node",
        buildStatus: "success" as const,
        builtAt: "2024-01-01T00:00:00Z",
        createdAt: "2024-01-01T00:00:00Z",
      },
    ];
    useStore.getState().setBuilds(builds);
    expect(useStore.getState().builds).toEqual(builds);
  });

  it("adds a build via addBuild", () => {
    const build = {
      id: "build-1",
      repoUrl: "https://github.com/test/repo",
      imageTag: "optio/ws/custom-1:latest",
      agentTypes: ["claude-code"],
      languagePreset: "node",
      buildStatus: "pending" as const,
      builtAt: null,
      createdAt: "2024-01-01T00:00:00Z",
    };
    useStore.getState().addBuild(build);
    expect(useStore.getState().builds).toHaveLength(1);
    expect(useStore.getState().builds[0].id).toBe("build-1");
  });

  it("updates a build via updateBuild", () => {
    const build = {
      id: "build-1",
      repoUrl: "https://github.com/test/repo",
      imageTag: "optio/ws/custom-1:latest",
      agentTypes: ["claude-code"],
      languagePreset: "node",
      buildStatus: "pending" as const,
      builtAt: null,
      createdAt: "2024-01-01T00:00:00Z",
    };
    useStore.getState().addBuild(build);
    useStore.getState().updateBuild("build-1", { buildStatus: "building" });
    expect(useStore.getState().builds[0].buildStatus).toBe("building");
  });

  it("adds new builds to the front of the array", () => {
    const build1 = {
      id: "build-1",
      repoUrl: "https://github.com/test/repo1",
      imageTag: "optio/ws/custom-1:latest",
      agentTypes: ["claude-code"],
      languagePreset: "node",
      buildStatus: "success" as const,
      builtAt: "2024-01-01T00:00:00Z",
      createdAt: "2024-01-01T00:00:00Z",
    };
    const build2 = {
      id: "build-2",
      repoUrl: "https://github.com/test/repo2",
      imageTag: "optio/ws/custom-2:latest",
      agentTypes: ["opencode"],
      languagePreset: "python",
      buildStatus: "building" as const,
      builtAt: null,
      createdAt: "2024-01-02T00:00:00Z",
    };
    useStore.getState().addBuild(build1);
    useStore.getState().addBuild(build2);
    expect(useStore.getState().builds[0].id).toBe("build-2");
    expect(useStore.getState().builds[1].id).toBe("build-1");
  });
});
