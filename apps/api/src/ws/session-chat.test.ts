import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock dependencies before importing module under test
vi.mock("./ws-auth.js", () => ({
  authenticateWs: vi.fn(),
  extractSessionToken: vi.fn(() => "fake-token"),
}));
vi.mock("../services/interactive-session-service.js", () => ({
  getSession: vi.fn(),
}));

import { sessionChatWs } from "./session-chat.js";
import { authenticateWs } from "./ws-auth.js";
import { getSession } from "../services/interactive-session-service.js";

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
});
