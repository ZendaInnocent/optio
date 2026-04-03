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

  describe("validateSecrets", () => {
    it("returns valid when GITHUB_TOKEN is present", () => {
      const result = adapter.validateSecrets(["GITHUB_TOKEN"]);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
    });

    it("reports missing GITHUB_TOKEN", () => {
      const result = adapter.validateSecrets([]);
      expect(result.valid).toBe(false);
      expect(result.missing).toContain("GITHUB_TOKEN");
    });

    it("returns valid when additional secrets are present", () => {
      const result = adapter.validateSecrets(["GITHUB_TOKEN", "ANTHROPIC_API_KEY"]);
      expect(result.valid).toBe(true);
    });
  });

  describe("buildContainerConfig", () => {
    const baseInput = {
      taskId: "test-123",
      prompt: "Fix the bug",
      repoUrl: "https://github.com/org/repo",
      repoBranch: "main",
    };

    it("uses rendered prompt when available", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        renderedPrompt: "Rendered: Fix the bug",
      });
      expect(config.env.OPTIO_PROMPT).toBe("Rendered: Fix the bug");
    });

    it("falls back to shared prompt builder when no rendered prompt", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.env.OPTIO_PROMPT).toContain("Fix the bug");
      expect(config.env.OPTIO_PROMPT).toContain("Instructions:");
    });

    it("sets correct env vars", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.env.OPTIO_TASK_ID).toBe("test-123");
      expect(config.env.OPTIO_AGENT_TYPE).toBe("claude-code");
      expect(config.env.OPTIO_BRANCH_NAME).toBe("optio/task-test-123");
    });

    it("includes setup files when task file is provided", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        taskFileContent: "# Task\nDo something",
        taskFilePath: ".optio/task.md",
      });
      expect(config.setupFiles).toHaveLength(2); // task file + claude settings
      const taskFile = config.setupFiles!.find((f) => f.path === ".optio/task.md");
      expect(taskFile).toBeDefined();
      expect(taskFile!.content).toBe("# Task\nDo something");
    });

    it("returns entrypoint command", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.command).toEqual(["/opt/optio/entrypoint.sh"]);
    });

    it("requires GITHUB_TOKEN in required secrets", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.requiredSecrets).toContain("GITHUB_TOKEN");
    });

    it("requires ANTHROPIC_API_KEY in api-key mode", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.requiredSecrets).toContain("ANTHROPIC_API_KEY");
    });

    it("does not require ANTHROPIC_API_KEY in max-subscription mode", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        claudeAuthMode: "max-subscription",
      });
      expect(config.requiredSecrets).toContain("GITHUB_TOKEN");
      expect(config.requiredSecrets).not.toContain("ANTHROPIC_API_KEY");
    });

    it("sets OPTIO_AUTH_MODE", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        claudeAuthMode: "max-subscription",
      });
      expect(config.env.OPTIO_AUTH_MODE).toBe("max-subscription");
    });

    it("creates Claude settings file with model", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        claudeModel: "sonnet",
        claudeContextWindow: "1m",
      });
      const settingsFile = config.setupFiles!.find(
        (f) => f.path === "/home/agent/.claude/settings.json",
      );
      expect(settingsFile).toBeDefined();
      const parsed = JSON.parse(settingsFile!.content);
      expect(parsed.model).toBe("sonnet[1m]");
      expect(parsed.hasCompletedOnboarding).toBe(true);
    });

    it("creates Claude settings with thinking and effort", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        claudeThinking: true,
        claudeEffort: "high",
      });
      const settingsFile = config.setupFiles!.find(
        (f) => f.path === "/home/agent/.claude/settings.json",
      );
      const parsed = JSON.parse(settingsFile!.content);
      expect(parsed.alwaysThinkingEnabled).toBe(true);
      expect(parsed.effortLevel).toBe("high");
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

  describe("parseEvent", () => {
    it("parses system init event", () => {
      const line = JSON.stringify({
        type: "system",
        subtype: "init",
        model: "claude-sonnet-4",
        session_id: "sess-123",
        tools: ["Read", "Write", "Bash"],
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("system");
      expect(result.entries[0].content).toContain("claude-sonnet-4");
      expect(result.entries[0].content).toContain("3 tools");
      expect(result.sessionId).toBe("sess-123");
    });

    it("parses assistant text message", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "I'll fix this bug" }],
        },
        session_id: "sess-123",
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("text");
      expect(result.entries[0].content).toBe("I'll fix this bug");
    });

    it("parses assistant thinking block", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "thinking", thinking: "Let me analyze..." }],
        },
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("thinking");
      expect(result.entries[0].content).toBe("Let me analyze...");
    });

    it("parses tool_use block", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "Read",
              id: "tool-1",
              input: { file_path: "/src/index.ts" },
            },
          ],
        },
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("tool_use");
      expect(result.entries[0].content).toContain("Read");
      expect(result.entries[0].content).toContain("/src/index.ts");
      expect(result.entries[0].metadata?.toolName).toBe("Read");
    });

    it("parses tool_result block", () => {
      const line = JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "tool_result",
              content: "File contents here",
            },
          ],
        },
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("tool_result");
      expect(result.entries[0].content).toBe("File contents here");
    });

    it("truncates long tool results", () => {
      const longOutput = "x".repeat(500);
      const line = JSON.stringify({
        type: "user",
        message: {
          content: [{ type: "tool_result", content: longOutput }],
        },
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries[0].content.length).toBeLessThanOrEqual(301); // 300 + ellipsis
    });

    it("parses result event with cost", () => {
      const line = JSON.stringify({
        type: "result",
        result: "Task completed",
        total_cost_usd: 0.05,
        num_turns: 5,
        duration_ms: 30000,
        session_id: "sess-123",
      });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("info");
      expect(result.entries[0].content).toContain("Task completed");
      expect(result.entries[0].content).toContain("5 turns");
      expect(result.entries[0].content).toContain("$0.0500");
      expect(result.entries[0].metadata?.cost).toBe(0.05);
    });

    it("handles non-JSON raw text", () => {
      const result = adapter.parseEvent("Some raw output", "task-1");
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].type).toBe("text");
      expect(result.entries[0].content).toBe("Some raw output");
    });

    it("filters empty lines", () => {
      const result = adapter.parseEvent("", "task-1");
      expect(result.entries).toHaveLength(0);
    });

    it("skips rate_limit_event", () => {
      const line = JSON.stringify({ type: "rate_limit_event", timestamp: "2024-01-01" });
      const result = adapter.parseEvent(line, "task-1");
      expect(result.entries).toHaveLength(0);
    });
  });

  describe("parseResult", () => {
    it("returns success for exit code 0", () => {
      const result = adapter.parseResult(0, "some output");
      expect(result.success).toBe(true);
      expect(result.summary).toBe("Agent completed successfully");
      expect(result.error).toBeUndefined();
    });

    it("returns failure for non-zero exit code", () => {
      const result = adapter.parseResult(1, "some output");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Exit code: 1");
    });

    it("extracts PR URL from logs", () => {
      const logs = `Working...\nhttps://github.com/org/repo/pull/42\nDone`;
      const result = adapter.parseResult(0, logs);
      expect(result.prUrl).toBe("https://github.com/org/repo/pull/42");
    });

    it("extracts cost from total_cost_usd", () => {
      const logs = '{"type":"result","total_cost_usd":0.0534}';
      const result = adapter.parseResult(0, logs);
      expect(result.costUsd).toBe(0.0534);
    });

    it("extracts token usage from assistant messages", () => {
      const logs = [
        '{"type":"system","subtype":"init","model":"claude-sonnet-4"}',
        '{"type":"assistant","message":{"usage":{"input_tokens":1000,"output_tokens":500}}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
      expect(result.model).toBe("claude-sonnet-4");
    });

    it("extracts error from result event when exit code is non-zero", () => {
      const logs = '{"type":"result","is_error":true,"result":"Something went wrong"}';
      const result = adapter.parseResult(1, logs);
      expect(result.success).toBe(false);
      expect(result.error).toBe("Something went wrong");
    });

    it("handles empty logs gracefully", () => {
      const result = adapter.parseResult(0, "");
      expect(result.success).toBe(true);
      expect(result.costUsd).toBeUndefined();
    });
  });
});
