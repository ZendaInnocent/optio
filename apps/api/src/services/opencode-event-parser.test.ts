import { describe, it, expect } from "vitest";
import { parseOpencodeEvent } from "./opencode-event-parser.js";

const TASK_ID = "test-task-123";

describe("parseOpencodeEvent", () => {
  it("parses system init event", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "init",
      model: "anthropic/claude-sonnet-4-20250514",
      tools: ["Bash", "Read", "Write", "Edit"],
      session_id: "session-abc",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.sessionId).toBe("session-abc");
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("system");
    expect(result.entries[0].content).toContain("anthropic/claude-sonnet-4-20250514");
    expect(result.entries[0].content).toContain("4 tools");
    expect(result.entries[0].metadata?.model).toBe("anthropic/claude-sonnet-4-20250514");
  });

  it("handles non-JSON lines as raw text", () => {
    const result = parseOpencodeEvent("[optio] Starting OpenCode agent...", TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("text");
    expect(result.entries[0].content).toBe("[optio] Starting OpenCode agent...");
  });

  it("strips terminal control sequences", () => {
    const result = parseOpencodeEvent("\x1b[32mgreen text\x1b[0m\r", TASK_ID);
    expect(result.entries[0].content).toBe("green text");
  });

  it("skips empty lines", () => {
    expect(parseOpencodeEvent("", TASK_ID).entries).toHaveLength(0);
    expect(parseOpencodeEvent("   ", TASK_ID).entries).toHaveLength(0);
    expect(parseOpencodeEvent("\n", TASK_ID).entries).toHaveLength(0);
  });

  it("parses assistant message with thinking block", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "thinking", thinking: "I need to analyze this code first..." }],
      },
      session_id: "session-xyz",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("thinking");
    expect(result.entries[0].content).toContain("analyze");
    expect(result.sessionId).toBe("session-xyz");
  });

  it("parses assistant message with text block", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [{ type: "text", text: "I'll help you fix this bug." }],
      },
      session_id: "session-123",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("text");
    expect(result.entries[0].content).toBe("I'll help you fix this bug.");
  });

  it("parses assistant message with tool_use block", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "src/index.ts" },
            id: "call_abc123",
          },
        ],
      },
      session_id: "session-456",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("tool_use");
    expect(result.entries[0].content).toBe("Read src/index.ts");
    expect(result.entries[0].metadata?.toolName).toBe("Read");
    expect(result.entries[0].metadata?.toolInput?.file_path).toBe("src/index.ts");
    expect(result.entries[0].metadata?.toolUseId).toBe("call_abc123");
  });

  it("parses assistant message with multiple content blocks", () => {
    const line = JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "Let me read the file first." },
          { type: "text", text: "Reading the file now." },
          {
            type: "tool_use",
            name: "Read",
            input: { file_path: "README.md" },
            id: "call_789",
          },
        ],
      },
      session_id: "session-multi",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(3);
    expect(result.entries[0].type).toBe("thinking");
    expect(result.entries[1].type).toBe("text");
    expect(result.entries[2].type).toBe("tool_use");
  });

  it("parses user message with tool_result", () => {
    const line = JSON.stringify({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            content: "File content: console.log('hello');",
          },
        ],
      },
      session_id: "session-789",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("tool_result");
    expect(result.entries[0].content).toContain("console.log");
  });

  it("truncates long tool_result content", () => {
    const longContent = "a".repeat(400);
    const line = JSON.stringify({
      type: "user",
      message: {
        content: [{ type: "tool_result", content: longContent }],
      },
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries[0].content.length).toBeLessThan(350);
    expect(result.entries[0].content).toContain("…");
  });

  it("parses result event with usage and cost", () => {
    const line = JSON.stringify({
      type: "result",
      result: "Task completed successfully",
      num_turns: 5,
      duration_ms: 45000,
      total_cost_usd: 0.0234,
      session_id: "session-final",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("info");
    expect(result.entries[0].content).toContain("Task completed");
    expect(result.entries[0].content).toContain("5 turns");
    expect(result.entries[0].content).toContain("45.0s");
    expect(result.entries[0].content).toContain("$0.0234");
    expect(result.entries[0].metadata?.cost).toBe(0.0234);
    expect(result.entries[0].metadata?.turns).toBe(5);
    expect(result.entries[0].metadata?.durationMs).toBe(45000);
  });

  it("parses result event without optional fields", () => {
    const line = JSON.stringify({
      type: "result",
      result: "Done",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("info");
    expect(result.entries[0].content).toBe("Done");
  });

  it("parses error event", () => {
    const line = JSON.stringify({
      type: "error",
      error: "API rate limit exceeded",
      message: "Please wait before retrying",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("error");
    expect(result.entries[0].content).toContain("rate limit");
  });

  it("extracts session ID from various fields", () => {
    const cases = [
      { json: { session_id: "sess1" }, expected: "sess1" },
      { json: { id: "sess2" }, expected: "sess2" },
      { json: { conversation_id: "sess3" }, expected: "sess3" },
    ];
    for (const { json, expected } of cases) {
      const line = JSON.stringify({ type: "system", subtype: "init", ...json });
      const result = parseOpencodeEvent(line, TASK_ID);
      expect(result.sessionId).toBe(expected);
    }
  });

  it("handles tool_use for various tool names with proper formatting", () => {
    const cases = [
      {
        name: "Read",
        input: { file_path: "package.json" },
        expected: "Read package.json",
      },
      {
        name: "Write",
        input: { file_path: "src/App.tsx" },
        expected: "Write src/App.tsx",
      },
      {
        name: "Edit",
        input: { file_path: "README.md" },
        expected: "Edit README.md",
      },
      {
        name: "Bash",
        input: { command: "npm install && npm test" },
        expected: "$ npm install && npm test",
      },
      {
        name: "Bash",
        input: { command: "very long command that should be truncated".repeat(5) },
        expected: (s: string) => expect(s.length).toBeLessThan(130),
      },
      {
        name: "Glob",
        input: { pattern: "**/*.ts", path: "src" },
        expected: "Glob **/*.ts in src",
      },
      {
        name: "Grep",
        input: { pattern: "TODO", path: "src" },
        expected: 'Grep "TODO" in src',
      },
      {
        name: "WebSearch",
        input: { query: "how to fix memory leak in nodejs" },
        expected: "Search: how to fix memory leak in nodejs",
      },
      {
        name: "WebFetch",
        input: { url: "https://example.com/docs" },
        expected: "Fetch: https://example.com/docs",
      },
      {
        name: "UnknownTool",
        input: { arg: "value" },
        expected: "UnknownTool",
      },
    ];

    for (const { name, input, expected } of cases) {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "tool_use", name, input, id: "call_test" }],
        },
      });
      const result = parseOpencodeEvent(line, TASK_ID);
      expect(result.entries).toHaveLength(1);
      const content = result.entries[0].content;
      if (typeof expected === "string") {
        expect(content).toBe(expected);
      } else {
        expected(content);
      }
    }
  });

  it("detects PR URLs in raw text output", () => {
    const result = parseOpencodeEvent(
      "Creating pull request... https://github.com/user/repo/pull/123 opened!",
      TASK_ID,
    );
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].content).toContain("https://github.com/user/repo/pull/123");
  });

  it("handles malformed JSON gracefully", () => {
    const result = parseOpencodeEvent("{ invalid json", TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("text");
    expect(result.entries[0].content).toBe("{ invalid json");
  });

  it("handles system events without subtype", () => {
    const line = JSON.stringify({
      type: "system",
      message: "Connection lost",
      error: "Network timeout",
    });
    const result = parseOpencodeEvent(line, TASK_ID);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].type).toBe("system");
    expect(result.entries[0].content).toContain("Connection lost");
  });
});
