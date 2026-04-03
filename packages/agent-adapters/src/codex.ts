import type {
  AgentTaskInput,
  AgentContainerConfig,
  AgentResult,
  AgentLogEntry,
  CodexAuthMode,
} from "@optio/shared";
import { TASK_BRANCH_PREFIX } from "@optio/shared";
import type {
  AgentAdapter,
  AgentExecCommand,
  AgentCommandOptions,
  AgentEventParseResult,
} from "./types.js";
import { isRawTextError, buildPrompt, truncate } from "./shared-utils.js";

/**
 * Codex CLI (codex exec --full-auto --json) outputs NDJSON events.
 * Each line is a JSON object. Known event shapes:
 *
 * - { type: "message", role: "assistant"|"system", content: "..." }
 * - { type: "function_call", name: "shell"|"...", call_id: "...", arguments: "..." }
 * - { type: "function_call_output", call_id: "...", output: "..." }
 * - { type: "error", message: "..." }
 * - { error: { message: "...", type: "...", code: "..." } }  (OpenAI API error envelope)
 * - { type: "usage", ... } or inline usage in final message
 *
 * The final summary event may contain usage data with input_tokens / output_tokens.
 */

/** Known Codex-compatible model pricing (USD per 1M tokens) */
const CODEX_MODEL_PRICING: Record<string, { input: number; output: number; cachedInput?: number }> =
  {
    "codex-mini": { input: 1.5, output: 6.0, cachedInput: 0.375 },
    "o4-mini": { input: 1.1, output: 4.4, cachedInput: 0.275 },
    o3: { input: 10.0, output: 40.0, cachedInput: 2.5 },
    "gpt-4.1": { input: 2.0, output: 8.0, cachedInput: 0.5 },
    "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
    "gpt-4.1-nano": { input: 0.1, output: 0.4, cachedInput: 0.025 },
  };

const DEFAULT_PRICING = CODEX_MODEL_PRICING["codex-mini"];

export class CodexAdapter implements AgentAdapter {
  readonly type = "codex";
  readonly displayName = "OpenAI Codex";

  validateSecrets(
    availableSecrets: string[],
    agentConfig?: Record<string, unknown>,
  ): { valid: boolean; missing: string[] } {
    const codexAuthMode = agentConfig?.codexAuthMode as CodexAuthMode | undefined;
    const required: string[] = ["GITHUB_TOKEN"];
    if (codexAuthMode !== "app-server") {
      required.push("OPENAI_API_KEY");
    }
    const missing = required.filter((s) => !availableSecrets.includes(s));
    return { valid: missing.length === 0, missing };
  }

  getExecCommand(
    prompt: string,
    model?: string,
    authEnv?: Record<string, string>,
  ): AgentExecCommand {
    const escapedPrompt = prompt.replace(/'/g, "'\\''");
    const modelFlag = model ? `--model ${model}` : "";
    const script = [
      "set -e",
      ...Object.entries(authEnv ?? {}).map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`),
      `codex exec --full-auto '${escapedPrompt}' ${modelFlag} --json 2>&1 || true`,
    ].join(" && ");

    return {
      command: "bash",
      args: ["-c", script],
      env: authEnv ?? {},
    };
  }

  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig {
    // Use the pre-rendered prompt from the template system, or fall back to raw prompt
    const prompt = input.renderedPrompt ?? buildPrompt(input);

    const env: Record<string, string> = {
      OPTIO_TASK_ID: input.taskId,
      OPTIO_REPO_URL: input.repoUrl,
      OPTIO_REPO_BRANCH: input.repoBranch,
      OPTIO_PROMPT: prompt,
      OPTIO_AGENT_TYPE: "codex",
      OPTIO_BRANCH_NAME: `${TASK_BRANCH_PREFIX}${input.taskId}`,
    };

    const requiredSecrets: string[] = ["GITHUB_TOKEN"];

    if (input.codexAuthMode === "app-server") {
      env.OPTIO_CODEX_AUTH_MODE = "app-server";
      if (input.codexAppServerUrl) {
        env.OPTIO_CODEX_APP_SERVER_URL = input.codexAppServerUrl;
      }
    } else {
      env.OPTIO_CODEX_AUTH_MODE = "api-key";
      requiredSecrets.push("OPENAI_API_KEY");
    }

    const setupFiles: AgentContainerConfig["setupFiles"] = [];

    // Write the task file into the worktree
    if (input.taskFileContent && input.taskFilePath) {
      setupFiles.push({
        path: input.taskFilePath,
        content: input.taskFileContent,
      });
    }

    return {
      command: ["/opt/optio/entrypoint.sh"],
      env,
      requiredSecrets,
      setupFiles,
    };
  }

  buildAgentCommand(env: Record<string, string>, opts?: AgentCommandOptions): string[] {
    const prompt = opts?.resumePrompt
      ? `${opts.resumePrompt}\n\n---\n\nOriginal task prompt for context:\n${env.OPTIO_PROMPT}`
      : env.OPTIO_PROMPT;

    const appServerFlag =
      env.OPTIO_CODEX_AUTH_MODE === "app-server" && env.OPTIO_CODEX_APP_SERVER_URL
        ? ` --app-server ${JSON.stringify(env.OPTIO_CODEX_APP_SERVER_URL)}`
        : "";
    return [
      `echo "[optio] Running OpenAI Codex${appServerFlag ? " (app-server)" : ""}..."`,
      `codex exec --full-auto ${JSON.stringify(prompt)}${appServerFlag} --json`,
    ];
  }

  inferExitCode(logs: string): number {
    const hasErrorEvent = logs.includes('"type":"error"') || logs.includes('"type": "error"');
    const hasApiErrorEnvelope = /"error"\s*:\s*\{\s*"message"/.test(logs);
    const hasAuthError =
      /OPENAI_API_KEY|invalid.*api.?key|unauthorized|authentication.*failed/i.test(logs);
    const hasQuotaError = /quota|insufficient_quota|billing/i.test(logs);
    const hasModelError = /model_not_found|model.*not found|does not exist.*model/i.test(logs);
    const hasContentFilter = /content.?filter|content.?policy|safety.?system/i.test(logs);
    return hasErrorEvent ||
      hasApiErrorEnvelope ||
      hasAuthError ||
      hasQuotaError ||
      hasModelError ||
      hasContentFilter
      ? 1
      : 0;
  }

  parseEvent(line: string, taskId: string): AgentEventParseResult {
    let event: any;
    try {
      event = JSON.parse(line);
    } catch {
      if (!line.trim()) return { entries: [] };
      const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]|\r/g, "").trim();
      if (!clean || clean.length < 2) return { entries: [] };
      return {
        entries: [{ taskId, timestamp: new Date().toISOString(), type: "text", content: clean }],
      };
    }

    const timestamp = new Date().toISOString();
    const entries: AgentLogEntry[] = [];
    const sessionId = (event.id ?? event.session_id ?? event.conversation_id) as string | undefined;

    if (event.type === "message" && event.role === "system") {
      const content =
        typeof event.content === "string" ? event.content : JSON.stringify(event.content);
      if (content?.trim()) {
        entries.push({ taskId, timestamp, sessionId, type: "system", content });
      }
      return { entries, sessionId };
    }

    if (event.type === "message" && event.role === "assistant") {
      const content =
        typeof event.content === "string"
          ? event.content
          : Array.isArray(event.content)
            ? event.content
                .map((block: any) => {
                  if (typeof block === "string") return block;
                  if (block.type === "text") return block.text;
                  if (block.type === "output_text") return block.text;
                  return "";
                })
                .filter(Boolean)
                .join("\n")
            : "";
      if (content?.trim()) {
        entries.push({ taskId, timestamp, sessionId, type: "text", content });
      }

      const usage = event.usage ?? event.response?.usage;
      if (usage) {
        const meta: string[] = [];
        const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
        const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
        if (inputTokens) meta.push(`${inputTokens} input tokens`);
        if (outputTokens) meta.push(`${outputTokens} output tokens`);
        if (event.total_cost_usd) meta.push(`$${event.total_cost_usd.toFixed(4)}`);
        if (meta.length) {
          entries.push({
            taskId,
            timestamp,
            sessionId,
            type: "info",
            content: `Usage: ${meta.join(" \u00b7 ")}`,
            metadata: { inputTokens, outputTokens, cost: event.total_cost_usd },
          });
        }
      }
      return { entries, sessionId };
    }

    if (event.type === "function_call") {
      const args = parseCodexArgs(event.arguments);
      entries.push({
        taskId,
        timestamp,
        sessionId,
        type: "tool_use",
        content: formatCodexToolUse(event.name, args),
        metadata: { toolName: event.name, toolInput: args, toolUseId: event.call_id },
      });
      return { entries, sessionId };
    }

    if (event.type === "function_call_output") {
      const output = typeof event.output === "string" ? event.output : JSON.stringify(event.output);
      const trimmed = output.length > 300 ? output.slice(0, 300) + "\u2026" : output;
      if (trimmed.trim()) {
        entries.push({
          taskId,
          timestamp,
          sessionId,
          type: "tool_result",
          content: trimmed,
          metadata: { toolUseId: event.call_id },
        });
      }
      return { entries, sessionId };
    }

    if (event.type === "error") {
      const msg = event.message ?? event.error ?? JSON.stringify(event);
      entries.push({ taskId, timestamp, sessionId, type: "error", content: msg });
      return { entries, sessionId };
    }

    if (event.type === "reasoning") {
      const content = typeof event.content === "string" ? event.content : "";
      if (content.trim()) {
        entries.push({ taskId, timestamp, sessionId, type: "thinking", content });
      }
      return { entries, sessionId };
    }

    if (event.usage || event.response?.usage) {
      const usage = event.usage ?? event.response.usage;
      const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;
      const meta: string[] = [];
      if (inputTokens) meta.push(`${inputTokens} input tokens`);
      if (outputTokens) meta.push(`${outputTokens} output tokens`);
      if (event.total_cost_usd) meta.push(`$${event.total_cost_usd.toFixed(4)}`);
      if (meta.length) {
        entries.push({
          taskId,
          timestamp,
          sessionId,
          type: "info",
          content: `Usage: ${meta.join(" \u00b7 ")}`,
          metadata: { inputTokens, outputTokens, cost: event.total_cost_usd },
        });
      }
      return { entries, sessionId };
    }

    return { entries: [], sessionId };
  }

  parseResult(exitCode: number, logs: string): AgentResult {
    // Extract PR URL from anywhere in the logs
    const prMatch = logs.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);

    // Parse NDJSON lines to extract structured data
    const { costUsd, errorMessage, hasError, summary } = this.parseLogs(logs);

    const success = exitCode === 0 && !hasError;

    return {
      success,
      prUrl: prMatch?.[0],
      costUsd,
      summary:
        summary ??
        (success ? "Agent completed successfully" : `Agent exited with code ${exitCode}`),
      error: !success ? (errorMessage ?? `Exit code: ${exitCode}`) : undefined,
    };
  }

  private parseLogs(logs: string): {
    costUsd?: number;
    errorMessage?: string;
    hasError: boolean;
    summary?: string;
  } {
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCachedTokens = 0;
    let directCost: number | undefined;
    let model: string | undefined;
    let errorMessage: string | undefined;
    let hasError = false;
    let lastAssistantMessage: string | undefined;

    for (const line of logs.split("\n")) {
      if (!line.trim()) continue;

      let event: any;
      try {
        event = JSON.parse(line);
      } catch {
        // Not JSON — check for error patterns in raw text
        if (!errorMessage && isRawTextError(line)) {
          errorMessage = line.trim();
          hasError = true;
        }
        continue;
      }

      // Extract model name
      if (event.model && !model) {
        model = event.model;
      }

      // OpenAI structured API error envelope: { error: { message, type, code } }
      if (event.error && typeof event.error === "object" && event.error.message) {
        errorMessage = event.error.message;
        hasError = true;
        continue;
      }

      // Error events: { type: "error", message: "..." }
      if (event.type === "error") {
        errorMessage = event.message ?? event.error ?? JSON.stringify(event);
        hasError = true;
        continue;
      }

      // Track assistant messages for summary
      if (event.type === "message" && event.role === "assistant" && event.content) {
        if (typeof event.content === "string") {
          lastAssistantMessage = event.content;
        }
      }

      // Extract usage data — may appear in multiple places
      const usage = event.usage ?? event.response?.usage;
      if (usage) {
        if (usage.input_tokens) totalInputTokens += usage.input_tokens;
        if (usage.output_tokens) totalOutputTokens += usage.output_tokens;
        // Also handle OpenAI-style naming
        if (usage.prompt_tokens) totalInputTokens += usage.prompt_tokens;
        if (usage.completion_tokens) totalOutputTokens += usage.completion_tokens;
        // Cached tokens (discounted pricing)
        if (usage.cached_tokens) totalCachedTokens += usage.cached_tokens;
        if (usage.prompt_tokens_details?.cached_tokens)
          totalCachedTokens += usage.prompt_tokens_details.cached_tokens;
      }

      // Capture direct cost without returning early — subsequent lines may
      // contain error events or additional messages that we still need to parse.
      if (event.total_cost_usd != null) {
        directCost = event.total_cost_usd;
      }
    }

    // Prefer direct cost from the agent over token-calculated cost
    let costUsd: number | undefined = directCost;
    if (costUsd == null && (totalInputTokens > 0 || totalOutputTokens > 0)) {
      const pricing = model ? (CODEX_MODEL_PRICING[model] ?? DEFAULT_PRICING) : DEFAULT_PRICING;
      // Cached tokens are a subset of input tokens and charged at a discounted rate
      const nonCachedInputTokens = Math.max(0, totalInputTokens - totalCachedTokens);
      const cachedRate = pricing.cachedInput ?? pricing.input * 0.25;
      costUsd =
        (nonCachedInputTokens / 1_000_000) * pricing.input +
        (totalCachedTokens / 1_000_000) * cachedRate +
        (totalOutputTokens / 1_000_000) * pricing.output;
    }

    return {
      costUsd,
      errorMessage,
      hasError,
      summary: lastAssistantMessage ? truncate(lastAssistantMessage, 200) : undefined,
    };
  }
}

function parseCodexArgs(args: unknown): Record<string, unknown> | undefined {
  if (!args) return undefined;
  if (typeof args === "object") return args as Record<string, unknown>;
  if (typeof args === "string") {
    try {
      return JSON.parse(args);
    } catch {
      return { raw: args };
    }
  }
  return undefined;
}

function formatCodexToolUse(name: string, args: Record<string, unknown> | undefined): string {
  if (!name) return "unknown tool";
  if (!args) return name;
  switch (name) {
    case "shell":
    case "bash":
    case "terminal":
      return `$ ${String(args.command ?? args.cmd ?? "")
        .split("\n")[0]
        .slice(0, 120)}`;
    case "read_file":
    case "readFile":
      return `Read ${args.path ?? args.file_path ?? ""}`;
    case "write_file":
    case "writeFile":
    case "create_file":
      return `Write ${args.path ?? args.file_path ?? ""}`;
    case "edit_file":
    case "editFile":
    case "apply_diff":
      return `Edit ${args.path ?? args.file_path ?? ""}`;
    case "search":
    case "grep":
      return `Search: ${args.query ?? args.pattern ?? ""}`;
    case "list_dir":
    case "listDir":
      return `List ${args.path ?? args.dir ?? "."}`;
    default:
      return name;
  }
}
