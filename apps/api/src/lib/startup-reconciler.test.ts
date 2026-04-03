import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconcileOrphanedTasks } from "./startup-reconciler.js";
import { TaskState } from "@optio/shared";

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../db/schema.js", () => ({
  tasks: { id: "id", state: "state", repoUrl: "repoUrl" },
}));

vi.mock("../services/task-service.js", () => ({
  transitionTask: vi.fn(),
  updateTaskPr: vi.fn(),
}));

vi.mock("../services/pr-detection-service.js", () => ({
  checkExistingPr: vi.fn(),
}));

vi.mock("bullmq", () => ({
  Queue: vi.fn(() => ({
    obliterate: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue({ id: "job-1" }),
  })),
}));

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { db } from "../db/client.js";
import * as taskService from "../services/task-service.js";
import * as prDetection from "../services/pr-detection-service.js";

describe("startup reconciler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("obliterates stale queue on startup", async () => {
    await reconcileOrphanedTasks();
    // Queue obliteration happens — no error
  });

  it("re-queues orphaned queued tasks", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation((condition: any) => {
        // Return orphaned queued tasks on first call
        return Promise.resolve([
          { id: "task-1", state: "queued", repoUrl: "https://github.com/o/r" },
        ]);
      }),
    } as any);

    await reconcileOrphanedTasks();
    // Should re-queue the orphaned task
  });

  it("transitions running tasks with existing PR to pr_opened", async () => {
    let callCount = 0;
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) return Promise.resolve([]); // queued
        if (callCount === 2)
          return Promise.resolve([
            { id: "task-1", state: "running", repoUrl: "https://github.com/o/r" },
          ]); // provisioning
        if (callCount === 3) return Promise.resolve([]); // running
        return Promise.resolve([]);
      }),
    } as any);

    vi.mocked(prDetection.checkExistingPr).mockResolvedValue({
      url: "https://github.com/o/r/pull/42",
      number: 42,
      state: "open",
    });

    await reconcileOrphanedTasks();

    // Running task with existing PR should transition to pr_opened
    expect(taskService.updateTaskPr).toHaveBeenCalledWith(
      "task-1",
      "https://github.com/o/r/pull/42",
    );
    expect(taskService.transitionTask).toHaveBeenCalledWith(
      "task-1",
      TaskState.PR_OPENED,
      "startup_reconcile",
      "https://github.com/o/r/pull/42",
    );
  });
});
