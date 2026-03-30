import type { AgentTaskInput, AgentContainerConfig, AgentResult } from "@optio/shared";
import { TASK_BRANCH_PREFIX } from "@optio/shared";
import type { AgentAdapter } from "./types.js";

/** OpenCode model pricing (USD per 1M tokens) */
const OPENCODE_MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "anthropic/claude-sonnet-4-20250514": { input: 3.0, output: 15.0 },
  "anthropic/claude-opus-4-20250514": { input: 15.0, output: 75.0 },
  "anthropic/claude-haiku-3-5-20241022": { input: 0.8, output: 4.0 },
  "anthropic/claude-3-5-sonnet-20241022": { input: 3.0, output: 15.0 },
  "anthropic/claude-3-5-haiku-20241022": { input: 0.8, output: 4.0 },
  // OpenAI
  "openai/gpt-4.1": { input: 2.0, output: 8.0 },
  "openai/gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "openai/gpt-4.1-nano": { input: 0.1, output: 0.4 },
  "openai/o4-mini": { input: 1.1, output: 4.4 },
  "openai/gpt-4o": { input: 2.5, output: 10.0 },
  "openai/gpt-4o-mini": { input: 0.15, output: 0.6 },
  // Default fallback (moderate pricing)
  default: { input: 3.0, output: 15.0 },
};

export class OpencodeAdapter implements AgentAdapter {
  readonly type = "opencode";
  readonly displayName = "Opencode AI";

  validateSecrets(availableSecrets: string[]): { valid: boolean; missing: string[] } {
    const required = ["GITHUB_TOKEN"];
    const missing = required.filter((s) => !availableSecrets.includes(s));

    // OpenCode requires at least one AI authentication key
    const aiKeys = ["OPENCODE_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"];
    const hasAiKey = aiKeys.some((key) => availableSecrets.includes(key));
    if (!hasAiKey) {
      missing.push(...aiKeys);
    }

    return { valid: missing.length === 0, missing };
  }

  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig {
    const prompt = input.renderedPrompt ?? this.buildPrompt(input);

    const env: Record<string, string> = {
      OPTIO_TASK_ID: input.taskId,
      OPTIO_REPO_URL: input.repoUrl,
      OPTIO_REPO_BRANCH: input.repoBranch,
      OPTIO_PROMPT: prompt,
      OPTIO_AGENT_TYPE: "opencode",
      OPTIO_BRANCH_NAME: `${TASK_BRANCH_PREFIX}${input.taskId}`,
    };

    const requiredSecrets: string[] = ["GITHUB_TOKEN"];
    const setupFiles: AgentContainerConfig["setupFiles"] = [];

    // Determine which AI auth secret is required based on the model
    const model = input.opencodeModel;
    if (model) {
      if (model.startsWith("anthropic/") || model.includes("claude")) {
        requiredSecrets.push("ANTHROPIC_API_KEY");
      } else if (model.startsWith("openai/") || model.includes("gpt") || model.includes("o4")) {
        requiredSecrets.push("OPENAI_API_KEY");
      } else {
        // Unknown provider or custom model — require OpenCode API key
        requiredSecrets.push("OPENCODE_API_KEY");
      }
    } else {
      // No model specified — require OpenCode API key as fallback
      requiredSecrets.push("OPENCODE_API_KEY");
    }

    // Write the task file into the worktree
    if (input.taskFileContent && input.taskFilePath) {
      setupFiles.push({
        path: input.taskFilePath,
        content: input.taskFileContent,
      });
    }

    // Create .opencode/opencode.json if model/temperature/top_p are configured
    if (input.opencodeModel) {
      const config: { model: string; temperature?: number; top_p?: number } = {
        model: input.opencodeModel,
      };
      if (input.opencodeTemperature !== undefined) {
        config.temperature = input.opencodeTemperature;
      }
      if (input.opencodeTopP !== undefined) {
        config.top_p = input.opencodeTopP;
      }
      setupFiles.push({
        path: ".opencode/opencode.json",
        content: JSON.stringify(config, null, 2),
      });
    }

    return {
      command: ["/opt/optio/entrypoint.sh"],
      env,
      requiredSecrets,
      setupFiles,
    };
  }

  parseResult(exitCode: number, logs: string): AgentResult {
    const prMatch = logs.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);

    let error: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let model: string | undefined;
    let directCost: number | undefined;

    for (const line of logs.split("\n")) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.model && !model) {
          model = event.model;
        }
        if (event.total_cost_usd != null) {
          directCost = event.total_cost_usd;
        }
        const usage = event.usage ?? event.response?.usage;
        if (usage) {
          if (usage.input_tokens) totalInputTokens += usage.input_tokens;
          if (usage.output_tokens) totalOutputTokens += usage.output_tokens;
          // OpenAI-style naming
          if (usage.prompt_tokens) totalInputTokens += usage.prompt_tokens;
          if (usage.completion_tokens) totalOutputTokens += usage.completion_tokens;
        }
        if (event.type === "error") {
          const msg = event.message ?? event.error ?? JSON.stringify(event);
          if (!error) error = msg;
        }
      } catch {
        // Not JSON — check for error patterns in raw text
        if (!error && isRawTextError(line)) {
          error = line.trim();
        }
      }
    }

    if (exitCode !== 0 && !error) {
      error = `Exit code: ${exitCode}`;
    }

    // Calculate cost if not directly provided
    let costUsd = directCost;
    if (costUsd == null && (totalInputTokens > 0 || totalOutputTokens > 0)) {
      const pricing = model
        ? (OPENCODE_MODEL_PRICING[model] ?? OPENCODE_MODEL_PRICING.default)
        : OPENCODE_MODEL_PRICING.default;
      costUsd =
        (totalInputTokens / 1_000_000) * pricing.input +
        (totalOutputTokens / 1_000_000) * pricing.output;
    }

    const success = exitCode === 0 && !error;

    return {
      success,
      prUrl: prMatch?.[0],
      costUsd,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      model,
      summary: success ? "Agent completed successfully" : `Agent exited with code ${exitCode}`,
      error,
    };
  }

  /** Build a fallback prompt when renderedPrompt is not provided */
  private buildPrompt(input: AgentTaskInput): string {
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
}

/** Detect common OpenCode error patterns in non-JSON output lines */
function isRawTextError(line: string): boolean {
  // Auth / API key errors
  if (
    /error|failed|fatal/i.test(line) &&
    /OPENCODE_API_KEY|ANTHROPIC_API_KEY|OPENAI_API_KEY|authentication|unauthorized|quota/i.test(
      line,
    )
  ) {
    return true;
  }
  // Model not found
  if (/model.*not found|model_not_found|does not exist|invalid.*model/i.test(line)) {
    return true;
  }
  // Context length exceeded
  if (/context.?length|maximum.?context|token.?limit|too many tokens/i.test(line)) {
    return true;
  }
  // Content filter / safety
  if (/content.?filter|content.?policy|safety.?system|flagged/i.test(line)) {
    return true;
  }
  // Server errors
  if (/server.?error|internal.?error|service.?unavailable|503|502/i.test(line)) {
    return true;
  }
  return false;
}
