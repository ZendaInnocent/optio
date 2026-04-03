import { describe, it, expect } from "vitest";
import { ClaudeCodeAdapter } from "@optio/agent-adapters";
import { CodexAdapter } from "@optio/agent-adapters";

const claudeAdapter = new ClaudeCodeAdapter();
const codexAdapter = new CodexAdapter();

describe("buildAgentCommand via adapters", () => {
  describe("claude-code agent", () => {
    it("produces a basic claude command with prompt from env", () => {
      const env = { OPTIO_PROMPT: "Fix the bug" };
      const cmds = claudeAdapter.buildAgentCommand(env);

      expect(cmds.some((c) => c.includes("claude -p"))).toBe(true);
      expect(cmds.some((c) => c.includes("--dangerously-skip-permissions"))).toBe(true);
      expect(cmds.some((c) => c.includes("--output-format stream-json"))).toBe(true);
      expect(cmds.some((c) => c.includes("--verbose"))).toBe(true);
      expect(cmds.some((c) => c.includes("--max-turns 50"))).toBe(true);
    });

    it("uses default coding max turns (50)", () => {
      const env = { OPTIO_PROMPT: "Do stuff" };
      const cmds = claudeAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("--max-turns 50"))).toBe(true);
    });

    it("uses default review max turns (20) when isReview is true", () => {
      const env = { OPTIO_PROMPT: "Review PR" };
      const cmds = claudeAdapter.buildAgentCommand(env, { isReview: true });
      expect(cmds.some((c) => c.includes("--max-turns 20"))).toBe(true);
    });

    it("respects custom maxTurnsCoding override", () => {
      const env = { OPTIO_PROMPT: "Build feature" };
      const cmds = claudeAdapter.buildAgentCommand(env, { maxTurnsCoding: 100 });
      expect(cmds.some((c) => c.includes("--max-turns 100"))).toBe(true);
    });

    it("respects custom maxTurnsReview override for reviews", () => {
      const env = { OPTIO_PROMPT: "Review code" };
      const cmds = claudeAdapter.buildAgentCommand(env, {
        isReview: true,
        maxTurnsReview: 25,
      });
      expect(cmds.some((c) => c.includes("--max-turns 25"))).toBe(true);
    });

    it("adds resume flag when resumeSessionId is provided", () => {
      const env = { OPTIO_PROMPT: "Continue work" };
      const cmds = claudeAdapter.buildAgentCommand(env, {
        resumeSessionId: "sess-abc-123",
      });
      expect(cmds.some((c) => c.includes("--resume"))).toBe(true);
      expect(cmds.some((c) => c.includes("sess-abc-123"))).toBe(true);
    });

    it("uses resumePrompt with original prompt as context when provided", () => {
      const env = { OPTIO_PROMPT: "Original prompt" };
      const cmds = claudeAdapter.buildAgentCommand(env, {
        resumePrompt: "Fix the tests now",
      });
      expect(cmds.some((c) => c.includes("Fix the tests now"))).toBe(true);
      expect(cmds.some((c) => c.includes("Original prompt"))).toBe(true);
    });

    it("adds max-subscription auth setup when auth mode is max-subscription", () => {
      const env = {
        OPTIO_PROMPT: "Do work",
        OPTIO_AUTH_MODE: "max-subscription",
        OPTIO_API_URL: "http://localhost:4000",
      };
      const cmds = claudeAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("Token proxy OK"))).toBe(true);
      expect(cmds.some((c) => c.includes("unset ANTHROPIC_API_KEY"))).toBe(true);
    });

    it("does not add auth setup for api-key mode", () => {
      const env = { OPTIO_PROMPT: "Do work", OPTIO_AUTH_MODE: "api-key" };
      const cmds = claudeAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("Token proxy OK"))).toBe(false);
      expect(cmds.some((c) => c.includes("unset ANTHROPIC_API_KEY"))).toBe(false);
    });

    it("includes review label in echo when isReview is true", () => {
      const env = { OPTIO_PROMPT: "Review" };
      const cmds = claudeAdapter.buildAgentCommand(env, { isReview: true });
      expect(cmds.some((c) => c.includes("(review)"))).toBe(true);
    });
  });

  describe("codex agent", () => {
    it("produces a codex exec command", () => {
      const env = { OPTIO_PROMPT: "Build feature" };
      const cmds = codexAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("codex exec"))).toBe(true);
      expect(cmds.some((c) => c.includes("--full-auto"))).toBe(true);
      expect(cmds.some((c) => c.includes("--json"))).toBe(true);
    });

    it("does not include --app-server flag in api-key mode", () => {
      const env = { OPTIO_PROMPT: "Build feature", OPTIO_CODEX_AUTH_MODE: "api-key" };
      const cmds = codexAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("--app-server"))).toBe(false);
    });

    it("includes --app-server flag with URL in app-server mode", () => {
      const env = {
        OPTIO_PROMPT: "Build feature",
        OPTIO_CODEX_AUTH_MODE: "app-server",
        OPTIO_CODEX_APP_SERVER_URL: "ws://localhost:3900/v1/connect",
      };
      const cmds = codexAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("--app-server"))).toBe(true);
      expect(cmds.some((c) => c.includes("ws://localhost:3900/v1/connect"))).toBe(true);
    });

    it("includes app-server label in echo when in app-server mode", () => {
      const env = {
        OPTIO_PROMPT: "Build feature",
        OPTIO_CODEX_AUTH_MODE: "app-server",
        OPTIO_CODEX_APP_SERVER_URL: "ws://localhost:3900/v1/connect",
      };
      const cmds = codexAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("(app-server)"))).toBe(true);
    });

    it("does not include --app-server flag when auth mode is app-server but URL is missing", () => {
      const env = { OPTIO_PROMPT: "Build feature", OPTIO_CODEX_AUTH_MODE: "app-server" };
      const cmds = codexAdapter.buildAgentCommand(env);
      expect(cmds.some((c) => c.includes("--app-server"))).toBe(false);
    });
  });
});

describe("inferExitCode via adapters", () => {
  describe("claude-code", () => {
    it("returns 0 for clean logs", () => {
      const logs = '{"type":"assistant","content":"All done"}\n';
      expect(claudeAdapter.inferExitCode(logs)).toBe(0);
    });

    it("returns 1 when is_error is true in result", () => {
      const logs = '{"type":"result","is_error":true,"error":"Something failed"}\n';
      expect(claudeAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 on fatal git error", () => {
      const logs = "fatal: repository not found\n";
      expect(claudeAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 on authentication_failed error", () => {
      const logs = "Error: authentication_failed - token expired\n";
      expect(claudeAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 when exit 1 appears in logs", () => {
      const logs = "some output\nexit 1\nmore output\n";
      expect(claudeAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 0 when logs contain non-fatal content", () => {
      const logs = '{"type":"result","is_error":false}\nCompleted successfully\n';
      expect(claudeAdapter.inferExitCode(logs)).toBe(0);
    });
  });

  describe("codex", () => {
    it("returns 0 for clean codex logs", () => {
      const logs = '{"type":"message","content":"Done"}\n';
      expect(codexAdapter.inferExitCode(logs)).toBe(0);
    });

    it("returns 1 when error event is present", () => {
      const logs = '{"type":"error","message":"something broke"}\n';
      expect(codexAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 when error event has spaces in JSON", () => {
      const logs = '{"type": "error", "message": "broke"}\n';
      expect(codexAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 on OPENAI_API_KEY auth error", () => {
      const logs = "Error: OPENAI_API_KEY is not set\n";
      expect(codexAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 on invalid API key", () => {
      const logs = "invalid api key provided\n";
      expect(codexAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 on quota exceeded", () => {
      const logs = "Error: insufficient_quota - you have exceeded your billing limit\n";
      expect(codexAdapter.inferExitCode(logs)).toBe(1);
    });

    it("returns 1 on billing error", () => {
      const logs = "billing limit exceeded\n";
      expect(codexAdapter.inferExitCode(logs)).toBe(1);
    });
  });
});
