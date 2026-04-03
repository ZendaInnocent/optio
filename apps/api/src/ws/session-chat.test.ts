import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock dependencies before importing module under test
vi.mock("./ws-auth.js", () => ({
  authenticateWs: vi.fn(),
  extractSessionToken: vi.fn(() => "fake-token"),
}));
vi.mock("../services/interactive-session-service.js", () => ({
  getSession: vi.fn(),
  getSessionMessages: vi.fn(),
  updateSessionAgentType: vi.fn(),
}));
vi.mock("../services/optio-settings-service.js", () => ({
  getSettings: vi.fn(() =>
    Promise.resolve({
      model: "sonnet",
      maxTurns: 10,
      confirmWrites: false,
      enabledTools: [],
      systemPrompt: null,
      defaultAgent: "opencode",
    }),
  ),
}));
vi.mock("../services/container-service.js", () => ({
  getRuntime: vi.fn(() => ({
    exec: vi.fn().mockRejectedValue(new Error("exec not mocked")),
  })),
}));
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve([{ podId: "pod-1", podName: "test-pod" }])),
      })),
    })),
  },
}));
vi.mock("../services/agent-event-parser.js", () => ({
  parseClaudeEvent: vi.fn(() => ({ entries: [] })),
}));
vi.mock("../services/event-bus.js", () => ({
  publishSessionEvent: vi.fn(),
}));
vi.mock("@optio/agent-adapters", () => ({
  getAdapter: vi.fn(() => ({
    getExecCommand: vi.fn(() => ({ command: "claude", args: ["-p", "test"] })),
  })),
}));
vi.mock("../logger.js", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { sessionChatWs } from "./session-chat.js";
import { authenticateWs } from "./ws-auth.js";
import { getSession, getSessionMessages } from "../services/interactive-session-service.js";

describe("sessionChatWs", () => {
  let mockSocket: any;
  let mockReq: any;
  let mockApp: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      readyState: 1,
    };
    mockReq = {
      params: { sessionId: "test-session" },
      headers: { cookie: "optio_session=test" },
      query: {},
    };
    mockApp = { get: vi.fn() };
  });

  it("calls authenticateWs to authenticate the connection", async () => {
    (authenticateWs as any).mockResolvedValue({ id: "user-1" });
    (getSession as any).mockResolvedValue({
      id: "test-session",
      userId: "user-1",
      state: "ended",
      podId: "pod-1",
      podName: "pod",
      repoUrl: "https://github.com/test/repo",
    });

    let handler: any;
    mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
      handler = cb;
    });
    sessionChatWs(mockApp);

    // Simulate authenticated user attached to request by middleware
    mockReq.user = { id: "user-1", workspaceId: null };

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
    let handler: any;
    mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
      handler = cb;
    });
    sessionChatWs(mockApp);
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
      repoUrl: "https://github.com/test/repo",
    });
    let handler: any;
    mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
      handler = cb;
    });
    sessionChatWs(mockApp);
    // Simulate authenticated user attached to request
    mockReq.user = { id: "user-1", workspaceId: null };
    await handler(mockSocket, mockReq);

    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "error", message: "Unauthorized: you do not own this session" }),
    );
    expect(mockSocket.close).toHaveBeenCalled();
  });

  describe("resume_session", () => {
    function setupHandler() {
      let handler: any;
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      sessionChatWs(mockApp);
      return handler;
    }

    async function connectWithSession() {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getSession as any).mockResolvedValue({
        id: "test-session",
        userId: "user-1",
        state: "active",
        podId: "pod-1",
        podName: "pod",
        repoUrl: "https://github.com/test/repo",
        costUsd: "1.2345",
        agentType: null,
      });
      mockReq.user = { id: "user-1", workspaceId: null };
      const handler = setupHandler();
      await handler(mockSocket, mockReq);

      const onCall = mockSocket.on.mock.calls.find((c: any) => c[0] === "message");
      return onCall ? onCall[1] : null;
    }

    it("sends session_restored with messages and costUsd when resume_session is received", async () => {
      const mockMessages = [
        {
          id: "msg-1",
          sessionId: "test-session",
          role: "user",
          content: "Hello",
          timestamp: "2024-01-01T00:00:00Z",
        },
        {
          id: "msg-2",
          sessionId: "test-session",
          role: "assistant",
          content: "Hi there!",
          timestamp: "2024-01-01T00:00:01Z",
        },
      ];
      (getSessionMessages as any).mockResolvedValue(mockMessages);

      const handleMessage = await connectWithSession();
      expect(handleMessage).not.toBeNull();

      handleMessage(JSON.stringify({ type: "resume_session" }));

      await vi.waitFor(() => {
        expect(getSessionMessages).toHaveBeenCalledWith("test-session", 100);
        expect(mockSocket.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: "session_restored",
            messages: mockMessages,
            costUsd: 1.2345,
          }),
        );
      });
    });

    it("sends session_restored with empty messages when no history exists", async () => {
      (getSessionMessages as any).mockResolvedValue([]);

      const handleMessage = await connectWithSession();
      expect(handleMessage).not.toBeNull();

      handleMessage(JSON.stringify({ type: "resume_session" }));

      await vi.waitFor(() => {
        expect(getSessionMessages).toHaveBeenCalledWith("test-session", 100);
        expect(mockSocket.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: "session_restored",
            messages: [],
            costUsd: 1.2345,
          }),
        );
      });
    });

    it("sends session_restored with costUsd=0 when session has no cost", async () => {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getSession as any).mockResolvedValue({
        id: "test-session",
        userId: "user-1",
        state: "active",
        podId: "pod-1",
        podName: "pod",
        repoUrl: "https://github.com/test/repo",
        costUsd: null,
        agentType: null,
      });
      mockReq.user = { id: "user-1", workspaceId: null };
      const handler = setupHandler();
      await handler(mockSocket, mockReq);

      const onCall = mockSocket.on.mock.calls.find((c: any) => c[0] === "message");
      const handleMessage = onCall ? onCall[1] : null;
      (getSessionMessages as any).mockResolvedValue([]);

      handleMessage(JSON.stringify({ type: "resume_session" }));

      await vi.waitFor(() => {
        expect(mockSocket.send).toHaveBeenCalledWith(
          JSON.stringify({
            type: "session_restored",
            messages: [],
            costUsd: 0,
          }),
        );
      });
    });

    it("ignores resume_session when session is not active", async () => {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getSession as any).mockResolvedValue({
        id: "test-session",
        userId: "user-1",
        state: "ended",
        podId: "pod-1",
        podName: "pod",
        repoUrl: "https://github.com/test/repo",
        costUsd: "5.0000",
        agentType: null,
      });
      mockReq.user = { id: "user-1", workspaceId: null };
      const handler = setupHandler();
      await handler(mockSocket, mockReq);

      expect(mockSocket.close).toHaveBeenCalled();
    });
  });
});
