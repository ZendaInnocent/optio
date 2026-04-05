import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock database client
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
  },
}));

// Mock agentRunService
vi.mock("../services/agent-run-service.js", () => ({
  transitionState: vi.fn(),
}));

import { db } from "../db/client.js";
import { transitionState as mockTransitionState } from "../services/agent-run-service.js";

// Import pure functions and the worker module namespace
import { determineCheckStatus } from "./pr-watcher-worker.js";
import * as prWatcherWorker from "./pr-watcher-worker.js";

describe("determineCheckStatus", () => {
  it("returns none for empty check runs", () => {
    expect(determineCheckStatus([])).toBe("none");
  });

  it("returns pending when some checks are still running", () => {
    expect(
      determineCheckStatus([
        { status: "completed", conclusion: "success" },
        { status: "in_progress", conclusion: null },
      ]),
    ).toBe("pending");
  });

  it("returns passing when all checks succeed", () => {
    expect(
      determineCheckStatus([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "success" },
      ]),
    ).toBe("passing");
  });

  it("treats skipped as passing", () => {
    expect(
      determineCheckStatus([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "skipped" },
      ]),
    ).toBe("passing");
  });

  it("returns failing when any check fails", () => {
    expect(
      determineCheckStatus([
        { status: "completed", conclusion: "success" },
        { status: "completed", conclusion: "failure" },
      ]),
    ).toBe("failing");
  });
});

// New test for Task 11: Agent Run PR Integration
describe("Agent Run PR Watcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("transitions agent run to completed when PR merged", async () => {
    const agentRunId = "agent-run-123";
    const prUrl = "https://github.com/owner/repo/pull/42";

    await prWatcherWorker.processAgentRunPr(agentRunId, prUrl, {
      merged: true,
      state: "closed",
    });

    expect(mockTransitionState).toHaveBeenCalledWith(
      agentRunId,
      "completed",
      expect.objectContaining({}),
    );
  });

  it("transitions agent run to failed when PR closed without merge", async () => {
    const agentRunId = "agent-run-456";
    const prUrl = "https://github.com/owner/repo/pull/42";

    await prWatcherWorker.processAgentRunPr(agentRunId, prUrl, {
      merged: false,
      state: "closed",
    });

    expect(mockTransitionState).toHaveBeenCalledWith(
      agentRunId,
      "failed",
      expect.objectContaining({}),
    );
  });

  it("does nothing when PR is open", async () => {
    const agentRunId = "agent-run-789";
    const prUrl = "https://github.com/owner/repo/pull/42";

    await prWatcherWorker.processAgentRunPr(agentRunId, prUrl, {
      merged: false,
      state: "open",
    });

    expect(mockTransitionState).not.toHaveBeenCalled();
  });
});
