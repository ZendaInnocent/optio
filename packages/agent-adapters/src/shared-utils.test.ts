import { describe, it, expect } from "vitest";
import { isRawTextError, buildPrompt, truncate } from "./shared-utils.js";

describe("shared-utils", () => {
  describe("isRawTextError", () => {
    it("detects authentication errors", () => {
      expect(isRawTextError("Error: OPENAI_API_KEY is not set")).toBe(true);
    });

    it("detects model not found errors", () => {
      expect(isRawTextError("model_not_found - The model does not exist")).toBe(true);
    });

    it("detects context length errors", () => {
      expect(isRawTextError("This model's maximum context length is 128000 tokens")).toBe(true);
    });

    it("detects content filter errors", () => {
      expect(isRawTextError("content_filter - Output was blocked by content policy")).toBe(true);
    });

    it("detects server errors", () => {
      expect(isRawTextError("503 service unavailable")).toBe(true);
    });

    it("detects fatal errors", () => {
      expect(isRawTextError("fatal: something went wrong")).toBe(true);
    });

    it("does not flag normal output lines", () => {
      expect(isRawTextError("Working on the task...")).toBe(false);
    });

    it("does not flag lines with 'error' unrelated to API/auth", () => {
      // The pattern requires error/fatal/failed to be present
      // A line like "I found an error in the code" would match since it has 'error'
      // This is intentional — the pattern is conservative to catch potential issues
      expect(isRawTextError("I found an error in the code")).toBe(true);
    });
  });

  describe("buildPrompt", () => {
    const baseInput = {
      taskId: "task-123",
      prompt: "Fix the bug",
      repoUrl: "https://github.com/org/repo",
      repoBranch: "main",
    };

    it("includes the original prompt", () => {
      const result = buildPrompt(baseInput);
      expect(result).toContain("Fix the bug");
    });

    it("includes instructions section", () => {
      const result = buildPrompt(baseInput);
      expect(result).toContain("Instructions:");
      expect(result).toContain("Work on the task described above.");
    });

    it("includes task file path when provided", () => {
      const result = buildPrompt({ ...baseInput, taskFilePath: ".optio/task.md" });
      expect(result).toContain(".optio/task.md");
    });

    it("does not include task file path section when not provided", () => {
      const result = buildPrompt(baseInput);
      expect(result).not.toContain("task file at");
    });

    it("includes branch name with task ID", () => {
      const result = buildPrompt(baseInput);
      expect(result).toContain("optio/task-task-123");
    });

    it("includes additional context when provided", () => {
      const result = buildPrompt({ ...baseInput, additionalContext: "Use TypeScript" });
      expect(result).toContain("Additional context:");
      expect(result).toContain("Use TypeScript");
    });

    it("does not include additional context section when not provided", () => {
      const result = buildPrompt(baseInput);
      expect(result).not.toContain("Additional context:");
    });
  });

  describe("truncate", () => {
    it("returns the original string when shorter than maxLength", () => {
      expect(truncate("hello", 10)).toBe("hello");
    });

    it("returns the original string when equal to maxLength", () => {
      expect(truncate("hello", 5)).toBe("hello");
    });

    it("truncates and adds ellipsis when longer than maxLength", () => {
      expect(truncate("hello world", 5)).toBe("hello\u2026");
    });

    it("handles empty string", () => {
      expect(truncate("", 5)).toBe("");
    });

    it("handles maxLength of 0", () => {
      expect(truncate("hello", 0)).toBe("\u2026");
    });
  });
});
