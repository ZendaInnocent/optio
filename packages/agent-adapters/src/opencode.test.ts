import { describe, it, expect } from "vitest";
import { OpencodeAdapter } from "./opencode.js";

const adapter = new OpencodeAdapter();

describe("OpencodeAdapter", () => {
  describe("type and displayName", () => {
    it("has correct type", () => {
      expect(adapter.type).toBe("opencode");
    });

    it("has correct displayName", () => {
      expect(adapter.displayName).toBe("Opencode AI");
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
      const result = adapter.validateSecrets([
        "GITHUB_TOKEN",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
      ]);
      expect(result.valid).toBe(true);
      expect(result.missing).toEqual([]);
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

    it("falls back to raw prompt when no rendered prompt", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.env.OPTIO_PROMPT).toBe("Fix the bug");
    });

    it("includes setup files when task file is provided", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        taskFileContent: "# Task\nDo something",
        taskFilePath: ".optio/task.md",
      });
      expect(config.setupFiles).toHaveLength(1);
      expect(config.setupFiles![0].path).toBe(".optio/task.md");
      expect(config.setupFiles![0].content).toBe("# Task\nDo something");
    });

    it("returns empty setupFiles when no task file", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.setupFiles).toEqual([]);
    });

    it("sets correct env vars", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.env.OPTIO_TASK_ID).toBe("test-123");
      expect(config.env.OPTIO_AGENT_TYPE).toBe("opencode");
      expect(config.env.OPTIO_BRANCH_NAME).toBe("optio/task-test-123");
    });

    it("requires GITHUB_TOKEN secret", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.requiredSecrets).toEqual(["GITHUB_TOKEN"]);
    });
  });

  describe("parseResult", () => {
    it("returns success for exit code 0 with no errors", () => {
      const result = adapter.parseResult(0, "some output\nmore output");
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
      const logs = `Working on task...\nhttps://github.com/org/repo/pull/42\nDone!`;
      const result = adapter.parseResult(0, logs);
      expect(result.prUrl).toBe("https://github.com/org/repo/pull/42");
    });

    it("extracts cost from usage data in JSON events", () => {
      const logs = [
        '{"type":"message","role":"assistant","content":"Working on it"}',
        '{"type":"message","role":"assistant","content":"Done","usage":{"input_tokens":1000,"output_tokens":500}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
    });

    it("extracts cost from total_cost_usd when provided directly", () => {
      const logs = '{"type":"result","total_cost_usd":0.0534}';
      const result = adapter.parseResult(0, logs);
      expect(result.costUsd).toBe(0.0534);
    });

    it("detects error events in JSON output", () => {
      const logs = '{"type":"error","message":"API key is invalid"}';
      const result = adapter.parseResult(0, logs);
      expect(result.success).toBe(false);
      expect(result.error).toBe("API key is invalid");
    });

    it("extracts model from events", () => {
      const logs = '{"model":"opencode-model","type":"message","role":"assistant","content":"Hi"}';
      const result = adapter.parseResult(0, logs);
      expect(result.model).toBe("opencode-model");
    });

    it("handles empty logs gracefully", () => {
      const result = adapter.parseResult(0, "");
      expect(result.success).toBe(true);
      expect(result.costUsd).toBeUndefined();
    });
  });
});
