import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("./ws-auth.js", () => ({
  authenticateWs: vi.fn(),
}));
vi.mock("../services/agent-run-service.js", () => ({
  getAgentRun: vi.fn(),
  transitionState: vi.fn(),
  switchMode: vi.fn(),
  recordEvent: vi.fn(),
}));
vi.mock("@optio/agent-adapters", () => ({
  getAdapter: vi.fn(() => ({
    getExecCommand: vi.fn(() => ({ command: "claude", args: ["-p", "test"] })),
  })),
}));
vi.mock("../services/container-service.js", () => ({
  getRuntime: vi.fn(() => ({
    exec: vi.fn(),
  })),
}));
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
  },
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

import { registerAgentRunWebSocket } from "./agent-runs.js";
import { authenticateWs } from "./ws-auth.js";
import { getAgentRun, transitionState, switchMode } from "../services/agent-run-service.js";

describe("AgentRun WebSocket", () => {
  let mockSocket: any;
  let mockReq: any;
  let mockApp: any;
  let handler: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket = {
      send: vi.fn(),
      close: vi.fn(),
      on: vi.fn(),
      readyState: 1,
    };
    mockReq = {
      params: { runId: "test-run" },
      headers: { cookie: "optio_session=test" },
      query: {},
    };
    mockApp = { get: vi.fn() };
  });

  function captureMessageHandler() {
    const onMessageCalls = mockSocket.on.mock.calls.filter((c: any) => c[0] === "message");
    const lastCall = onMessageCalls[onMessageCalls.length - 1];
    if (lastCall) {
      mockSocket.handleMessage = lastCall[1];
    }
  }

  describe("Authentication", () => {
    it("calls authenticateWs", async () => {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getAgentRun as any).mockResolvedValue({
        id: "test-run",
        mode: "interactive",
        state: "running",
        agentType: "claude-code",
        sessionId: "sess",
        worktreePath: "/ws",
        maxTurns: 100,
      });
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      registerAgentRunWebSocket(mockApp);
      await handler(mockSocket, mockReq);
      expect(authenticateWs).toHaveBeenCalledWith(mockSocket, mockReq);
    });

    it("does not proceed if auth fails", async () => {
      (authenticateWs as any).mockResolvedValue(null);
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      registerAgentRunWebSocket(mockApp);
      await handler(mockSocket, mockReq);
      expect(getAgentRun).not.toHaveBeenCalled();
    });

    it("closes when agent run not found", async () => {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getAgentRun as any).mockResolvedValue(null);
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      registerAgentRunWebSocket(mockApp);
      await handler(mockSocket, mockReq);
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "error", message: "Agent run not found" }),
      );
      expect(mockSocket.close).toHaveBeenCalled();
    });

    it("continues when agent run found", async () => {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getAgentRun as any).mockResolvedValue({
        id: "test-run",
        mode: "interactive",
        state: "running",
        agentType: "claude-code",
        sessionId: "sess",
        worktreePath: "/ws",
        maxTurns: 100,
      });
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      registerAgentRunWebSocket(mockApp);
      await handler(mockSocket, mockReq);
      expect(getAgentRun).toHaveBeenCalledWith("test-run");
      expect(mockSocket.close).not.toHaveBeenCalled();
    });
  });

  describe("Message handling", () => {
    beforeEach(async () => {
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getAgentRun as any).mockResolvedValue({
        id: "test-run",
        mode: "interactive",
        state: "running",
        agentType: "claude-code",
        sessionId: "sess",
        worktreePath: "/ws",
        maxTurns: 100,
      });
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      registerAgentRunWebSocket(mockApp);
      await handler(mockSocket, mockReq);
      captureMessageHandler();
    });

    it("rejects message when not interactive", async () => {
      (getAgentRun as any).mockResolvedValue({
        id: "test-run",
        mode: "autonomous",
        state: "running",
        agentType: "claude-code",
      });
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      await handler(mockSocket, mockReq);
      captureMessageHandler();

      mockSocket.handleMessage(JSON.stringify({ type: "message", content: "test" }));
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "error", message: "Cannot send messages in this mode" }),
      );
    });

    it("handles interrupt", async () => {
      (transitionState as any).mockResolvedValue({});
      mockSocket.handleMessage(JSON.stringify({ type: "interrupt" }));
      await new Promise((r) => setTimeout(r, 10));
      expect(transitionState).toHaveBeenCalledWith("test-run", "needs_attention");
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "state_changed", state: "needs_attention" }),
      );
    });

    it("handles mode_switch", async () => {
      (switchMode as any).mockResolvedValue({});
      mockSocket.handleMessage(JSON.stringify({ type: "mode_switch", mode: "supervised" }));
      await new Promise((r) => setTimeout(r, 10));
      expect(switchMode).toHaveBeenCalledWith("test-run", "supervised");
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "mode_changed", mode: "supervised" }),
      );
    });

    it("rejects invalid mode_switch", async () => {
      mockSocket.handleMessage(JSON.stringify({ type: "mode_switch", mode: "bad" }));
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "error", message: "Invalid mode" }),
      );
    });

    it("handles end", async () => {
      (transitionState as any).mockResolvedValue({});
      mockSocket.handleMessage(JSON.stringify({ type: "end" }));
      await new Promise((r) => setTimeout(r, 10));
      expect(transitionState).toHaveBeenCalledWith("test-run", "completed");
      expect(mockSocket.close).toHaveBeenCalled();
    });

    it("acknowledges terminal_input", async () => {
      mockSocket.handleMessage(JSON.stringify({ type: "terminal_input" }));
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "ack", message: "Not implemented" }),
      );
    });

    it("rejects unknown message type", async () => {
      mockSocket.handleMessage(JSON.stringify({ type: "unknown" }));
      expect(mockSocket.send).toHaveBeenCalledWith(
        JSON.stringify({ type: "error", message: "Unknown type: unknown" }),
      );
    });
  });

  describe("Event streaming", () => {
    it("sets up polling interval", async () => {
      const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
      (authenticateWs as any).mockResolvedValue({ id: "user-1" });
      (getAgentRun as any).mockResolvedValue({
        id: "test-run",
        mode: "interactive",
        state: "running",
        agentType: "claude-code",
        sessionId: "sess",
        worktreePath: "/ws",
        maxTurns: 100,
      });
      mockApp.get = vi.fn((_p: string, _o: any, cb: any) => {
        handler = cb;
      });
      registerAgentRunWebSocket(mockApp);
      await handler(mockSocket, mockReq);

      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 1000);
      setIntervalSpy.mockClear(); // cleanup
    });
  });
});
