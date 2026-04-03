import { describe, it, expect } from "vitest";
import {
  getAdapter,
  getAvailableAdapters,
  ClaudeCodeAdapter,
  CodexAdapter,
  OpencodeAdapter,
} from "./index.js";

describe("adapter registry", () => {
  describe("getAdapter", () => {
    it("returns ClaudeCodeAdapter for claude-code", () => {
      const adapter = getAdapter("claude-code");
      expect(adapter).toBeInstanceOf(ClaudeCodeAdapter);
      expect(adapter.type).toBe("claude-code");
    });

    it("returns CodexAdapter for codex", () => {
      const adapter = getAdapter("codex");
      expect(adapter).toBeInstanceOf(CodexAdapter);
      expect(adapter.type).toBe("codex");
    });

    it("returns OpencodeAdapter for opencode", () => {
      const adapter = getAdapter("opencode");
      expect(adapter).toBeInstanceOf(OpencodeAdapter);
      expect(adapter.type).toBe("opencode");
    });

    it("throws for unknown agent type", () => {
      expect(() => getAdapter("unknown")).toThrow("Unknown agent type: unknown");
    });

    it("error message lists available adapters", () => {
      expect(() => getAdapter("unknown")).toThrow(/claude-code.*codex.*opencode/);
    });
  });

  describe("getAvailableAdapters", () => {
    it("returns all three adapters", () => {
      const adapters = getAvailableAdapters();
      expect(adapters).toHaveLength(3);
    });

    it("includes all agent types", () => {
      const adapters = getAvailableAdapters();
      const types = adapters.map((a) => a.type);
      expect(types).toContain("claude-code");
      expect(types).toContain("codex");
      expect(types).toContain("opencode");
    });

    it("all adapters implement the full interface", () => {
      const adapters = getAvailableAdapters();
      for (const adapter of adapters) {
        expect(typeof adapter.type).toBe("string");
        expect(typeof adapter.displayName).toBe("string");
        expect(typeof adapter.validateSecrets).toBe("function");
        expect(typeof adapter.buildContainerConfig).toBe("function");
        expect(typeof adapter.getExecCommand).toBe("function");
        expect(typeof adapter.buildAgentCommand).toBe("function");
        expect(typeof adapter.inferExitCode).toBe("function");
        expect(typeof adapter.parseEvent).toBe("function");
        expect(typeof adapter.parseResult).toBe("function");
      }
    });
  });
});
