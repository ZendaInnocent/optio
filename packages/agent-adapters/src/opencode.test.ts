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
      // buildPrompt adds instructions, so we check that it contains the original prompt
      expect(config.env.OPTIO_PROMPT).toContain("Fix the bug");
      expect(config.env.OPTIO_PROMPT).toContain("Instructions:");
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

    it("requires GITHUB_TOKEN and OPENCODE_API_KEY when no model specified", () => {
      const config = adapter.buildContainerConfig(baseInput);
      expect(config.requiredSecrets).toEqual(["GITHUB_TOKEN", "OPENCODE_API_KEY"]);
    });

    it("requires ANTHROPIC_API_KEY when model starts with anthropic/", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        opencodeModel: "anthropic/claude-sonnet-4-20250514",
      });
      expect(config.requiredSecrets).toContain("GITHUB_TOKEN");
      expect(config.requiredSecrets).toContain("ANTHROPIC_API_KEY");
      expect(config.requiredSecrets).not.toContain("OPENAI_API_KEY");
      expect(config.requiredSecrets).not.toContain("OPENCODE_API_KEY");
    });

    it("requires OPENAI_API_KEY when model starts with openai/", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        opencodeModel: "openai/gpt-4.1",
      });
      expect(config.requiredSecrets).toContain("GITHUB_TOKEN");
      expect(config.requiredSecrets).toContain("OPENAI_API_KEY");
      expect(config.requiredSecrets).not.toContain("ANTHROPIC_API_KEY");
      expect(config.requiredSecrets).not.toContain("OPENCODE_API_KEY");
    });

    it("requires OPENCODE_API_KEY for unknown model", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        opencodeModel: "custom/model",
      });
      expect(config.requiredSecrets).toContain("GITHUB_TOKEN");
      expect(config.requiredSecrets).toContain("OPENCODE_API_KEY");
    });

    it("creates opencode.json config file when model is set", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        opencodeModel: "anthropic/claude-sonnet-4-20250514",
        opencodeTemperature: 0.7,
        opencodeTopP: 0.9,
      });
      expect(config.setupFiles ?? []).toHaveLength(1); // config file only
      const configFile = (config.setupFiles ?? []).find(
        (f) => f.path === ".opencode/opencode.json",
      );
      expect(configFile).toBeDefined();
      const parsed = JSON.parse(configFile!.content);
      expect(parsed.model).toBe("anthropic/claude-sonnet-4-20250514");
      expect(parsed.temperature).toBe(0.7);
      expect(parsed.top_p).toBe(0.9);
    });

    it("config file includes only model when temperature/top_p not set", () => {
      const config = adapter.buildContainerConfig({
        ...baseInput,
        opencodeModel: "openai/gpt-4.1",
      });
      const configFile = (config.setupFiles ?? []).find(
        (f) => f.path === ".opencode/opencode.json",
      );
      expect(configFile).toBeDefined();
      const parsed = JSON.parse(configFile!.content);
      expect(parsed.model).toBe("openai/gpt-4.1");
      expect(parsed.temperature).toBeUndefined();
      expect(parsed.top_p).toBeUndefined();
    });

    it("does not create config file when model is not set", () => {
      const config = adapter.buildContainerConfig(baseInput);
      const configFile = (config.setupFiles ?? []).find(
        (f) => f.path === ".opencode/opencode.json",
      );
      expect(configFile).toBeUndefined();
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

    it("extracts tokens from usage data", () => {
      const logs = [
        '{"type":"message","role":"assistant","content":"Working"}',
        '{"usage":{"input_tokens":1000,"output_tokens":500}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      expect(result.inputTokens).toBe(1000);
      expect(result.outputTokens).toBe(500);
    });

    it("calculates cost from tokens when total_cost_usd not provided", () => {
      const logs = [
        '{"model":"anthropic/claude-sonnet-4-20250514"}',
        '{"usage":{"input_tokens":1000,"output_tokens":500}}',
      ].join("\n");
      const result = adapter.parseResult(0, logs);
      // Expected: 1000/1e6 * 3.0 + 500/1e6 * 15.0 = 0.003 + 0.0075 = 0.0105
      expect(result.costUsd).toBeCloseTo(0.0105, 4);
    });

    it("uses direct cost when total_cost_usd provided", () => {
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

    it("detects errors in raw text", () => {
      const logs = "Error: OPENCODE_API_KEY is invalid";
      // Even with non-zero exit code, raw text error should be captured if present
      const result = adapter.parseResult(1, logs);
      expect(result.error).toBe("Error: OPENCODE_API_KEY is invalid");
      // With exit code 0, same error detection
      const result2 = adapter.parseResult(0, logs);
      expect(result2.error).toBe("Error: OPENCODE_API_KEY is invalid");
    });
  });

  describe("getExecCommand", () => {
    it("returns bash -c with the opencode run command", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.command).toBe("bash");
      expect(result.args[0]).toBe("-c");
      expect(result.args[1]).toContain("opencode run");
    });

    it("escapes single quotes in prompt", () => {
      const result = adapter.getExecCommand("test 'prompt' with quotes");

      expect(result.args[1]).toContain("'\\''");
    });

    it("includes model flag when model is provided", () => {
      const result = adapter.getExecCommand("test prompt", "anthropic/claude-sonnet-4-20250514");

      expect(result.args[1]).toContain("--model anthropic/claude-sonnet-4-20250514");
    });

    it("does not include model flag when model is undefined", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.args[1]).not.toContain("--model");
    });

    it("includes auth env vars when provided", () => {
      const authEnv = { OPENCODE_API_KEY: "sk-test" };
      const result = adapter.getExecCommand("test prompt", undefined, authEnv);

      expect(result.args[1]).toContain("export OPENCODE_API_KEY='sk-test'");
    });

    it("uses set -e in script", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.args[1]).toContain("set -e");
    });

    it("uses --format json for structured output", () => {
      const result = adapter.getExecCommand("test prompt");

      expect(result.args[1]).toContain("--format json");
    });
  });
});
