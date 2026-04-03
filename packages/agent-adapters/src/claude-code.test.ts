import { describe, it, expect } from "vitest";
import { ClaudeCodeAdapter } from "./claude-code.js";

const adapter = new ClaudeCodeAdapter();

describe("ClaudeCodeAdapter", () => {
  describe("type and displayName", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("claude-code");
    });

    it("has correct displayName", () => {
      expect(adapter.displayName).toBe("Claude Code");
    });
  });

  describe("getExecCommand", () => {
    it("returns bash -c with the claude command", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.command).toBe("bash");
      expect(result.args[0]).toBe("-c");
      expect(result.args[1]).toContain("claude -p");
    });

    it("escapes single quotes in prompt", () => {
      const result = adapter.getExecCommand("test 'prompt' with quotes");

      expect(result.args[1]).toContain("'\\''");
    });

    it("includes model flag when model is provided", () => {
      const result = adapter.getExecCommand("test prompt", "sonnet");

      expect(result.args[1]).toContain("--model sonnet");
    });

    it("does not include model flag when model is undefined", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.args[1]).not.toContain("--model");
    });

    it("includes auth env vars when provided", () => {
      const authEnv = { ANTHROPIC_API_KEY: "sk-test" };
      const result = adapter.getExecCommand("test prompt", undefined, authEnv);

      expect(result.args[1]).toContain("export ANTHROPIC_API_KEY='sk-test'");
    });

    it("uses set -e in script", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.args[1]).toContain("set -e");
    });
  });

  describe("buildAgentCommand", () => {
    it("returns claude command with required flags", () => {
      const result = adapter.buildAgentCommand({ OPTIO_PROMPT: "Fix the bug" });

      expect(result.some((line) => line.includes("claude -p"))).toBe(true);
      expect(result.some((line) => line.includes("--dangerously-skip-permissions"))).toBe(true);
      expect(result.some((line) => line.includes("--output-format stream-json"))).toBe(true);
      expect(result.some((line) => line.includes("--verbose"))).toBe(true);
      expect(result.some((line) => line.includes("--max-turns"))).toBe(true);
    });

    it("uses default max turns for coding", () => {
      const result = adapter.buildAgentCommand({ OPTIO_PROMPT: "Fix" });
      const maxTurnsLine = result.find((line) => line.includes("--max-turns"));
      expect(maxTurnsLine).toContain("--max-turns 50");
    });

    it("uses review max turns when isReview is true", () => {
      const result = adapter.buildAgentCommand({ OPTIO_PROMPT: "Fix" }, { isReview: true });
      const maxTurnsLine = result.find((line) => line.includes("--max-turns"));
      expect(maxTurnsLine).toContain("--max-turns 20");
    });

    it("allows custom max turns", () => {
      const result = adapter.buildAgentCommand({ OPTIO_PROMPT: "Fix" }, { maxTurnsCoding: 100 });
      const maxTurnsLine = result.find((line) => line.includes("--max-turns"));
      expect(maxTurnsLine).toContain("--max-turns 100");
    });

    it("includes resume flag when resumeSessionId provided", () => {
      const result = adapter.buildAgentCommand(
        { OPTIO_PROMPT: "Fix" },
        { resumeSessionId: "session-123" },
      );
      const resumeLine = result.find((line) => line.includes("--resume"));
      expect(resumeLine).toContain("--resume");
      expect(resumeLine).toContain("session-123");
    });

    it("prepends resume prompt with original prompt", () => {
      const result = adapter.buildAgentCommand(
        { OPTIO_PROMPT: "Original task" },
        { resumePrompt: "CI failed, fix it" },
      );
      const claudeLine = result.find((line) => line.includes("claude -p"));
      expect(claudeLine).toContain("CI failed, fix it");
      expect(claudeLine).toContain("Original task prompt for context");
    });

    it("sets up max-subscription auth when configured", () => {
      const result = adapter.buildAgentCommand({
        OPTIO_PROMPT: "Fix",
        OPTIO_AUTH_MODE: "max-subscription",
        OPTIO_API_URL: "http://api:4000",
      });
      expect(result.some((line) => line.includes("Token proxy OK"))).toBe(true);
      expect(result.some((line) => line.includes("unset ANTHROPIC_API_KEY"))).toBe(true);
    });

    it("does not set up max-subscription auth in api-key mode", () => {
      const result = adapter.buildAgentCommand({
        OPTIO_PROMPT: "Fix",
        OPTIO_AUTH_MODE: "api-key",
      });
      expect(result.some((line) => line.includes("Token proxy OK"))).toBe(false);
    });
  });

  describe("inferExitCode", () => {
    it("returns 0 for clean output", () => {
      expect(adapter.inferExitCode("some normal output")).toBe(0);
    });

    it("returns 1 when is_error is true in logs", () => {
      expect(adapter.inferExitCode('{"type":"result","is_error":true}')).toBe(1);
    });

    it("returns 1 for fatal errors", () => {
      expect(adapter.inferExitCode("fatal: something went wrong")).toBe(1);
    });

    it("returns 1 for authentication_failed", () => {
      expect(adapter.inferExitCode("Error: authentication_failed")).toBe(1);
    });

    it("returns 0 for successful output with PR link", () => {
      expect(adapter.inferExitCode("Working...\nhttps://github.com/org/repo/pull/42\nDone")).toBe(
        0,
      );
    });
  });
});
