import { describe, it, expect } from "vitest";
import type { BuildStatusChangedEvent, BuildLogEvent, WsEvent } from "./events.js";

describe("BuildStatusChangedEvent", () => {
  it("has correct type discriminator", () => {
    const event: BuildStatusChangedEvent = {
      type: "build:status_changed",
      buildId: "build-123",
      fromStatus: "pending",
      toStatus: "building",
      repoUrl: "https://github.com/test/repo",
      imageTag: "optio/ws/custom-abc:latest",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(event.type).toBe("build:status_changed");
  });

  it("supports null repoUrl for workspace-wide builds", () => {
    const event: BuildStatusChangedEvent = {
      type: "build:status_changed",
      buildId: "build-456",
      fromStatus: "pending",
      toStatus: "building",
      repoUrl: null,
      imageTag: "optio/ws/workspace:latest",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(event.repoUrl).toBeNull();
  });

  it("supports all valid status transitions", () => {
    const statuses: Array<"pending" | "building" | "success" | "failed" | "cancelled"> = [
      "pending",
      "building",
      "success",
      "failed",
      "cancelled",
    ];
    for (const from of statuses) {
      for (const to of statuses) {
        const event: BuildStatusChangedEvent = {
          type: "build:status_changed",
          buildId: "build-1",
          fromStatus: from,
          toStatus: to,
          repoUrl: "https://github.com/test/repo",
          imageTag: "optio/ws/custom:latest",
          timestamp: "2024-01-01T00:00:00Z",
        };
        expect(event.fromStatus).toBe(from);
        expect(event.toStatus).toBe(to);
      }
    }
  });
});

describe("BuildLogEvent", () => {
  it("has correct type discriminator", () => {
    const event: BuildLogEvent = {
      type: "build:log",
      buildId: "build-123",
      content: "Step 1/5 : FROM ubuntu:24.04",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(event.type).toBe("build:log");
    expect(event.content).toBe("Step 1/5 : FROM ubuntu:24.04");
  });

  it("handles multi-line log content", () => {
    const event: BuildLogEvent = {
      type: "build:log",
      buildId: "build-123",
      content: "Step 1/5 : FROM ubuntu:24.04\n ---> abc123\nStep 2/5 : RUN apt-get update",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(event.content).toContain("\n");
  });
});

describe("WsEvent union includes build events", () => {
  it("accepts build:status_changed as WsEvent", () => {
    const event: WsEvent = {
      type: "build:status_changed",
      buildId: "build-1",
      fromStatus: "pending",
      toStatus: "building",
      repoUrl: "https://github.com/test/repo",
      imageTag: "optio/ws/custom:latest",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(event.type).toBe("build:status_changed");
  });

  it("accepts build:log as WsEvent", () => {
    const event: WsEvent = {
      type: "build:log",
      buildId: "build-1",
      content: "Building image...",
      timestamp: "2024-01-01T00:00:00Z",
    };
    expect(event.type).toBe("build:log");
  });
});
