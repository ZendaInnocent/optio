import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

describe("agent-entrypoint.sh", () => {
  const scriptPath = join(__dirname, "../../../scripts/agent-entrypoint.sh");

  it("uses 'opencode run' for OpenCode agent (not deprecated --prompt)", () => {
    const script = readFileSync(scriptPath, "utf-8");

    // Find the opencode case branch
    const caseMatch = script.match(/opencode\)\s*([\s\S]*?)\s*;;/);
    expect(caseMatch, "opencode case branch should exist").not.toBeNull();

    const branchBody = caseMatch![1];
    const lines = branchBody
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);

    // Find the actual command line (starts with 'opencode' and not an echo)
    const commandLine = lines.find(
      (line: string) => line.startsWith("opencode") && !line.startsWith("echo"),
    );
    expect(commandLine, "should have an opencode command line").toBeDefined();

    // Should use 'opencode run' subcommand
    expect(commandLine).toContain("opencode run");

    // Should not use deprecated '--prompt' flag
    expect(commandLine).not.toContain("--prompt");

    // Should use '--format json' for structured output
    expect(commandLine).toContain("--format json");
  });
});
