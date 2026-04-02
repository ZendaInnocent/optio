import { describe, it, expect } from "vitest";
import { ClaudeCodeAdapter } from "./claude-code.js";

describe("ClaudeCodeAdapter.getExecCommand", () => {
  const adapter = new ClaudeCodeAdapter();

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
