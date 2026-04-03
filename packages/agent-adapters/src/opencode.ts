import type {
  AgentTaskInput,
  AgentContainerConfig,
  AgentResult,
  AgentLogEntry,
} from "@optio/shared";
import { TASK_BRANCH_PREFIX } from "@optio/shared";
import type {
  AgentAdapter,
  AgentExecCommand,
  AgentCommandOptions,
  AgentEventParseResult,
} from "./types.js";
import { isRawTextError, buildPrompt, truncate } from "./shared-utils.js";

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
      "export PATH=/usr/local/bin:/root/.local/bin:$PATH",
      ...Object.entries(authEnv ?? {}).map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`),
      `opencode run '${escapedPrompt}' ${modelFlag} --format json 2>&1 || true`,
    ].join(" && ");

    return {
      command: "bash",
      args: ["-c", script],
      env: authEnv ?? {},
    };
  }

  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig {
    const prompt = input.renderedPrompt ?? buildPrompt(input);

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

    const model = input.opencodeModel;

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

  buildAgentCommand(env: Record<string, string>, opts?: AgentCommandOptions): string[] {
    const prompt = opts?.resumePrompt
      ? `${opts.resumePrompt}\n\n---\n\nOriginal task prompt for context:\n${env.OPTIO_PROMPT}`
      : env.OPTIO_PROMPT;

    return [
      `echo "[optio] Running OpenCode..."`,
      `opencode run ${JSON.stringify(prompt)} --format json 2>&1`,
    ];
  }

  inferExitCode(logs: string): number {
    const hasResultError = logs.includes('"is_error":true');
    const hasFatalError =
      logs.includes("fatal:") ||
      logs.includes("Error: authentication_failed") ||
      logs.includes("exit 1");
    return hasResultError || hasFatalError ? 1 : 0;
  }

  parseEvent(line: string, taskId: string): AgentEventParseResult {
    let jsonStr = line;
    if (line.startsWith("data:")) {
      jsonStr = line.slice(5).trim();
    }

    let event: any;
    try {
      event = JSON.parse(jsonStr);
    } catch {
      if (!line.trim()) return { entries: [] };
      const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]|\r/g, "").trim();
      if (!clean || clean.length < 2) return { entries: [] };
      const prMatch = clean.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
      const content = prMatch ? clean.replace(prMatch[0], `\uD83D\uDD17 ${prMatch[0]}`) : clean;
      return {
        entries: [{ taskId, timestamp: new Date().toISOString(), type: "text", content }],
      };
    }

    const sessionId = event.session_id ?? event.id ?? (event.conversation_id as string | undefined);
    const timestamp = new Date().toISOString();
    const entries: AgentLogEntry[] = [];

    if (event.type === "system" && event.subtype === "init") {
      const toolCount = Array.isArray(event.tools) ? event.tools.length : 0;
      entries.push({
        taskId,
        timestamp,
        sessionId,
        type: "system",
        content: `Session started \u00b7 ${event.model ?? "unknown"} \u00b7 ${toolCount} tools`,
        metadata: { model: event.model },
      });
      return { entries, sessionId };
    }

    if (event.type === "system") {
      let msg = "";
      if (event.subtype) {
        msg = `[${event.subtype}] ${event.message ?? event.error ?? ""}`.trim();
      } else if (event.message || event.error) {
        msg = event.message ?? event.error ?? "";
      }
      if (msg) {
        entries.push({ taskId, timestamp, sessionId, type: "system", content: msg });
      }
      return { entries, sessionId };
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "thinking" && block.thinking) {
          entries.push({ taskId, timestamp, sessionId, type: "thinking", content: block.thinking });
        } else if (block.type === "text" && block.text) {
          entries.push({ taskId, timestamp, sessionId, type: "text", content: block.text });
        } else if (block.type === "tool_use") {
          entries.push({
            taskId,
            timestamp,
            sessionId,
            type: "tool_use",
            content: formatOpencodeToolUse(block.name, block.input),
            metadata: { toolName: block.name, toolInput: block.input, toolUseId: block.id },
          });
        } else {
          // Unknown content block type — capture as text
          const blockContent = JSON.stringify(block).slice(0, 500);
          entries.push({ taskId, timestamp, sessionId, type: "text", content: blockContent });
        }
      }
      return { entries, sessionId };
    }

    if (event.type === "user" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "tool_result") {
          const raw =
            typeof block.content === "string"
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c: any) => c.text ?? c.content ?? "").join("")
                : "";
          const trimmed = raw.length > 300 ? raw.slice(0, 300) + "\u2026" : raw;
          if (trimmed.trim()) {
            entries.push({ taskId, timestamp, sessionId, type: "tool_result", content: trimmed });
          }
        }
      }
      return { entries, sessionId };
    }

    if (event.type === "result") {
      const parts: string[] = [];
      if (event.result) parts.push(event.result);
      const meta: string[] = [];
      if (event.num_turns) meta.push(`${event.num_turns} turns`);
      if (event.duration_ms) meta.push(`${(event.duration_ms / 1000).toFixed(1)}s`);
      if (event.total_cost_usd) meta.push(`$${event.total_cost_usd.toFixed(4)}`);
      if (meta.length) parts.push(`(${meta.join(" \u00b7 ")})`);

      entries.push({
        taskId,
        timestamp,
        sessionId,
        type: "info",
        content: parts.join(" "),
        metadata: {
          cost: event.total_cost_usd,
          turns: event.num_turns,
          durationMs: event.duration_ms,
        },
      });
      return { entries, sessionId };
    }

    if (event.type === "error") {
      const msg = [event.error, event.message].filter(Boolean).join(": ");
      entries.push({
        taskId,
        timestamp,
        sessionId,
        type: "error",
        content: msg || JSON.stringify(event),
      });
      return { entries, sessionId };
    }

    if (event.usage || event.total_cost_usd) {
      const usage = event.usage ?? {};
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

    // Unknown JSON event — capture as text so nothing is silently dropped
    const unknownContent = JSON.stringify(event).slice(0, 500);
    entries.push({ taskId, timestamp, sessionId, type: "text", content: unknownContent });
    return { entries, sessionId };
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
}

function formatOpencodeToolUse(name: string, input: any): string {
  if (!input) return name;
  switch (name) {
    case "Read":
      return `Read ${input.file_path ?? input.path ?? ""}`;
    case "Write":
      return `Write ${input.file_path ?? input.path ?? ""}`;
    case "Edit":
      return `Edit ${input.file_path ?? input.path ?? ""}`;
    case "Bash":
      return `$ ${(input.command ?? input.cmd ?? "").split("\n")[0].slice(0, 120)}`;
    case "Glob":
      return `Glob ${input.pattern ?? ""}${input.path ? ` in ${input.path}` : ""}`;
    case "Grep":
      return `Grep "${input.pattern ?? ""}"${input.path ? ` in ${input.path}` : ""}`;
    case "WebSearch":
      return `Search: ${input.query ?? ""}`;
    case "WebFetch":
      return `Fetch: ${input.url ?? ""}`;
    case "Agent":
      return `Agent: ${input.description ?? ""}`;
    default:
      return name;
  }
}
