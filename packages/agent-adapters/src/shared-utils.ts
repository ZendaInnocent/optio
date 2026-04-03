import type { AgentTaskInput } from "@optio/shared";
import { TASK_BRANCH_PREFIX } from "@optio/shared";

/**
 * Detect common error patterns in non-JSON output lines.
 * Each pattern is tested against the line; if any match, the line is an error.
 */
const RAW_TEXT_ERROR_PATTERNS: RegExp[] = [
  // Auth / API key errors
  /error|failed|fatal/i,
  // Model not found
  /model.*not found|model_not_found|does not exist|invalid.*model/i,
  // Context length exceeded
  /context.?length|maximum.?context|token.?limit|too many tokens/i,
  // Content filter / safety
  /content.?filter|content.?policy|safety.?system|flagged/i,
  // Server errors
  /server.?error|internal.?error|service.?unavailable|503|502/i,
];

export function isRawTextError(line: string): boolean {
  return RAW_TEXT_ERROR_PATTERNS.some((pattern) => pattern.test(line));
}

/**
 * Build a fallback prompt when renderedPrompt is not provided.
 * Shared across all adapters for consistent behavior.
 */
export function buildPrompt(input: AgentTaskInput): string {
  const parts = [input.prompt, "", "Instructions:", "- Work on the task described above."];
  if (input.taskFilePath) {
    parts.push(`- Read the task file at ${input.taskFilePath} for full details.`);
  }
  parts.push(
    "- When you are done, create a pull request using the gh CLI.",
    `- Use branch name: ${TASK_BRANCH_PREFIX}${input.taskId}`,
    "- Write a clear PR title and description summarizing your changes.",
  );
  if (input.additionalContext) {
    parts.push("", "Additional context:", input.additionalContext);
  }
  return parts.join("\n");
}

/**
 * Truncate a string to maxLength, appending an ellipsis if truncated.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "\u2026";
}
