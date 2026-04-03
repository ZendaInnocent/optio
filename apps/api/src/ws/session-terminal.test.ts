import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock dependencies before importing module under test
vi.mock("./ws-auth.js", () => ({
  authenticateWs: vi.fn(),
}));
vi.mock("../services/interactive-session-service.js", () => ({
  getSession: vi.fn(),
}));
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
  },
}));
vi.mock("../services/container-service.js", () => ({
  getRuntime: vi.fn(),
}));

import { sessionTerminalWs } from "./session-terminal.js";
import { authenticateWs } from "./ws-auth.js";
import { getSession } from "../services/interactive-session-service.js";
import { db } from "../db/client.js";
import { getRuntime } from "../services/container-service.js";

describe("sessionTerminalWs", () => {
  let mockSocket: any;
  let mockReq: any;
  let mockApp: any;
  let handler: any;

  let mockPod: any;
  let mockRuntime: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Default pod record
    mockPod = { id: "pod-1", podName: "test-pod", podId: "pod-1" };

    // Default runtime mock
    const mockStdout = { on: vi.fn() };
    const mockStderr = { on: vi.fn() };
    const mockStdin = { write: vi.fn() };
    const mockExecSession = {
      stdin: mockStdin,
      stdout: mockStdout,
      stderr: mockStderr,
      resize: vi.fn(),
      close: vi.fn(),
    } as any;

    mockRuntime = {
      status: vi.fn().mockResolvedValue({ state: "running" as const }),
      exec: vi.fn().mockResolvedValue(mockExecSession),
    };

    // Mock authenticateWs
    (authenticateWs as any).mockResolvedValue({ id: "user-1" });

    // Mock getSession
    (getSession as any).mockResolvedValue({
      id: "test-session",
      userId: "user-1",
      state: "active",
      podId: "pod-1",
      worktreePath: "/workspace/sessions/test",
      branch: "session/user/test",
      repoUrl: "https://github.com/test/repo",
    });

    // Mock db.select().from(repoPods).where() -> returns [pod]
    (db.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([mockPod]),
      })),
    }));

    // Mock getRuntime
    (getRuntime as any).mockReturnValue(mockRuntime);

    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      readyState: 1,
    };
    mockReq = {
      params: { sessionId: "test-session" },
      headers: {},
      query: {},
    };
    mockApp = { get: vi.fn() };

    // Capture handler
    mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
      handler = cb;
    });
    sessionTerminalWs(mockApp);
  });

  it("calls authenticateWs to authenticate the connection", async () => {
    // Session that will cause early exit before DB (state not active)
    (getSession as any).mockResolvedValue({
      id: "test-session",
      userId: "user-1",
      state: "ended",
      podId: "pod-1",
      podName: "pod",
    });

    try {
      await handler(mockSocket, mockReq);
    } catch (e) {
      // ignore errors
    }

    expect(authenticateWs).toHaveBeenCalledWith(mockSocket, mockReq);
    expect(getSession).toHaveBeenCalledWith("test-session");
  });

  it("does not call getSession if authenticateWs returns null", async () => {
    (authenticateWs as any).mockResolvedValue(null);
    await handler(mockSocket, mockReq);
    expect(getSession).not.toHaveBeenCalled();
  });

  it("rejects unauthorized user when session userId does not match", async () => {
    (authenticateWs as any).mockResolvedValue({ id: "user-1" });
    (getSession as any).mockResolvedValue({
      id: "test-session",
      userId: "user-2",
      state: "active",
      podId: "pod-1",
      podName: "pod",
    });
    await handler(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Unauthorized: you do not own this session" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("rejects if session state is not active", async () => {
    (getSession as any).mockResolvedValue({
      id: "test-session",
      state: "ended",
      podId: "pod-1",
      podName: "pod",
    });
    await handler(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Session is not active" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("rejects if session has no podId", async () => {
    (getSession as any).mockResolvedValue({
      id: "test-session",
      state: "active",
      podId: null,
    });
    await handler(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Session has no pod assigned" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("rejects if pod not found in database", async () => {
    // Modify db mock to return empty array
    (db.select as any).mockImplementation(() => ({
      from: vi.fn(() => ({
        where: vi.fn().mockResolvedValue([]),
      })),
    }));

    await handler(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Pod not found or not ready" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("rejects if pod status is not running", async () => {
    // Mock status to return pending
    (mockRuntime.status as any).mockResolvedValue({ state: "pending" });

    await handler(mockSocket, mockReq);

    expect(mockRuntime.status).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pod-1", name: "test-pod" }),
    );
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Pod is not running (state: pending)" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
    expect(mockRuntime.exec).not.toHaveBeenCalled();
  });

  it("rejects if status check throws", async () => {
    (mockRuntime.status as any).mockRejectedValue(new Error("K8s connection failed"));

    await handler(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Failed to check pod status" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
    expect(mockRuntime.exec).not.toHaveBeenCalled();
  });

  it("proceeds to exec when pod is running", async () => {
    await handler(mockSocket, mockReq);

    expect(mockRuntime.status).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pod-1", name: "test-pod" }),
    );
    expect(mockRuntime.exec).toHaveBeenCalledWith(
      expect.objectContaining({ id: "pod-1", name: "test-pod" }),
      expect.arrayContaining(["bash", "-c"]),
      { tty: true },
    );
    // Should not send error or close immediately
    expect(mockSocket.send).not.toHaveBeenCalled();
    expect(mockSocket.close).not.toHaveBeenCalled();
  });

  it("handles exec failure after status check", async () => {
    (mockRuntime.exec as any).mockRejectedValue(new Error("Exec failed"));

    await handler(mockSocket, mockReq);

    expect(mockRuntime.exec).toHaveBeenCalled();
    // Should send error and close
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ error: "Failed to start terminal" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  it("includes mkdir -p for worktree parent directory in setup script", async () => {
    await handler(mockSocket, mockReq);

    expect(mockRuntime.exec).toHaveBeenCalled();
    const execCall = (mockRuntime.exec as any).mock.calls[0];
    const setupScript = execCall[1][2];

    // The setup script must create the parent directory before git worktree add
    expect(setupScript).toContain("mkdir -p");
    expect(setupScript).toContain("/workspace/sessions");
  });

  it("uses non-login shell to prevent environment variable dump on reconnect", async () => {
    await handler(mockSocket, mockReq);

    expect(mockRuntime.exec).toHaveBeenCalled();
    const execCall = (mockRuntime.exec as any).mock.calls[0];
    const setupScript = execCall[1][2];

    // Should not use 'bash -l' which sources .bashrc and dumps environment variables
    expect(setupScript).not.toContain("exec bash -l");
    // Should use plain 'bash' instead
    expect(setupScript).toMatch(/exec bash(?! -l)/);
  });
});
