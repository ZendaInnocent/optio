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
import { buildPrompt } from "./shared-utils.js";

const DEFAULT_MAX_TURNS_CODING = 50;
const DEFAULT_MAX_TURNS_REVIEW = 20;

export class ClaudeCodeAdapter implements AgentAdapter {
  readonly type = "claude-code";
  readonly displayName = "Claude Code";

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
      ...Object.entries(authEnv ?? {}).map(([k, v]) => `export ${k}='${v.replace(/'/g, "'\\''")}'`),
      `claude -p '${escapedPrompt}' ${modelFlag} --output-format stream-json --verbose --dangerously-skip-permissions 2>&1 || true`,
    ].join(" && ");

    return {
      command: "bash",
      args: ["-c", script],
      env: authEnv ?? {},
    };
  }

  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig {
    // Use the pre-rendered prompt from the template system, or fall back to shared prompt builder
    const prompt = input.renderedPrompt ?? buildPrompt(input);
    const authMode = input.claudeAuthMode ?? "api-key";

    const env: Record<string, string> = {
      OPTIO_TASK_ID: input.taskId,
      OPTIO_REPO_URL: input.repoUrl,
      OPTIO_REPO_BRANCH: input.repoBranch,
      OPTIO_PROMPT: prompt,
      OPTIO_AGENT_TYPE: "claude-code",
      OPTIO_BRANCH_NAME: `${TASK_BRANCH_PREFIX}${input.taskId}`,
      OPTIO_AUTH_MODE: authMode,
    };

    const requiredSecrets = ["GITHUB_TOKEN"];
    const setupFiles: AgentContainerConfig["setupFiles"] = [];

    // Write the task file into the worktree
    if (input.taskFileContent && input.taskFilePath) {
      setupFiles.push({
        path: input.taskFilePath,
        content: input.taskFileContent,
      });
    }

    if (authMode === "api-key") {
      requiredSecrets.push("ANTHROPIC_API_KEY");
    } else if (authMode === "max-subscription") {
      // Max subscription: use CLAUDE_CODE_OAUTH_TOKEN env var
      // The token is fetched from the Optio auth proxy at task execution time
      // and injected as an env var by the task worker
      const apiUrl = input.optioApiUrl ?? "http://host.docker.internal:4000";
      env.OPTIO_API_URL = apiUrl;
      // CLAUDE_CODE_OAUTH_TOKEN will be injected by the task worker after fetching from auth proxy
    }

    // Claude Code settings
    const claudeSettings: Record<string, unknown> = {
      hasCompletedOnboarding: true,
    };
    // Model: format is "sonnet", "opus", "sonnet[1m]", "opus[1m]"
    if (input.claudeModel) {
      const ctx = input.claudeContextWindow === "1m" ? "[1m]" : "";
      claudeSettings.model = `${input.claudeModel}${ctx}`;
    }
    if (input.claudeThinking !== undefined) {
      claudeSettings.alwaysThinkingEnabled = input.claudeThinking;
    }
    if (input.claudeEffort) {
      claudeSettings.effortLevel = input.claudeEffort;
    }
    setupFiles.push({
      path: "/home/agent/.claude/settings.json",
      content: JSON.stringify(claudeSettings),
    });

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
    const maxTurns = opts?.isReview
      ? (opts.maxTurnsReview ?? DEFAULT_MAX_TURNS_REVIEW)
      : (opts?.maxTurnsCoding ?? DEFAULT_MAX_TURNS_CODING);

    const authSetup =
      env.OPTIO_AUTH_MODE === "max-subscription"
        ? [
            `if curl -sf "${env.OPTIO_API_URL}/api/auth/claude-token" > /dev/null 2>&1; then echo "[optio] Token proxy OK"; fi`,
            `unset ANTHROPIC_API_KEY 2>/dev/null || true`,
          ]
        : [];

    const resumeFlag = opts?.resumeSessionId
      ? `--resume ${JSON.stringify(opts.resumeSessionId)}`
      : "";

    return [
      ...authSetup,
      `echo "[optio] Running Claude Code${opts?.isReview ? " (review)" : ""}..."`,
      `claude -p ${JSON.stringify(prompt)} \\`,
      `  --dangerously-skip-permissions \\`,
      `  --output-format stream-json \\`,
      `  --verbose \\`,
      `  --max-turns ${maxTurns} \\`,
      `  ${resumeFlag}`.trim(),
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

    const sessionId = event.session_id as string | undefined;
    const timestamp = new Date().toISOString();
    const entries: AgentLogEntry[] = [];

    if (event.type === "system" && event.subtype === "init") {
      entries.push({
        taskId,
        timestamp,
        sessionId,
        type: "system",
        content: `Session started · ${event.model ?? "unknown"} · ${(event.tools ?? []).length} tools`,
        metadata: { model: event.model },
      });
      return { entries, sessionId };
    }

    if (event.type === "system") {
      const msg = event.subtype ? `[${event.subtype}] ${event.error ?? ""}`.trim() : "";
      if (msg) {
        entries.push({ taskId, timestamp, sessionId, type: "system", content: msg });
      }
      return { entries, sessionId };
    }

    if (event.type === "assistant" && event.message?.content) {
      for (const block of event.message.content) {
        if (block.type === "thinking" && block.thinking) {
          entries.push({
            taskId,
            timestamp,
            sessionId,
            type: "thinking",
            content: block.thinking,
          });
        } else if (block.type === "text" && block.text) {
          entries.push({
            taskId,
            timestamp,
            sessionId,
            type: "text",
            content: block.text,
          });
        } else if (block.type === "tool_use") {
          entries.push({
            taskId,
            timestamp,
            sessionId,
            type: "tool_use",
            content: formatToolUse(block.name, block.input),
            metadata: {
              toolName: block.name,
              toolInput: block.input,
              toolUseId: block.id,
            },
          });
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
            entries.push({
              taskId,
              timestamp,
              sessionId,
              type: "tool_result",
              content: trimmed,
            });
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
          isError: event.is_error,
        },
      });
      return { entries, sessionId };
    }

    return { entries: [], sessionId };
  }

  parseResult(exitCode: number, logs: string): AgentResult {
    const prMatch = logs.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
    const costMatch = logs.match(/"total_cost_usd":\s*([\d.]+)/);

    // Extract error, token usage, and model from Claude's NDJSON events
    let error: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let model: string | undefined;

    for (const line of logs.split("\n")) {
      try {
        const event = JSON.parse(line);

        // Extract model from system init event
        if (event.type === "system" && event.subtype === "init" && event.model && !model) {
          model = event.model;
        }

        // Accumulate token usage from assistant messages
        if (event.type === "assistant" && event.message?.usage) {
          totalInputTokens += event.message.usage.input_tokens || 0;
          totalOutputTokens += event.message.usage.output_tokens || 0;
          if (!model && event.message.model) {
            model = event.message.model;
          }
        }

        // Extract error from result event
        if (exitCode !== 0 && event.type === "result" && event.is_error && event.result) {
          error = event.result;
        }
      } catch {
        // Not JSON, skip
      }
    }

    if (exitCode !== 0 && !error) {
      error = `Exit code: ${exitCode}`;
    }

    return {
      success: exitCode === 0,
      prUrl: prMatch?.[0],
      costUsd: costMatch ? parseFloat(costMatch[1]) : undefined,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      model,
      summary:
        exitCode === 0 ? "Agent completed successfully" : `Agent exited with code ${exitCode}`,
      error,
    };
  }
}

function formatToolUse(name: string, input: any): string {
  if (!input) return name;
  switch (name) {
    case "Read":
      return `Read ${input.file_path ?? ""}`;
    case "Write":
      return `Write ${input.file_path ?? ""}`;
    case "Edit":
      return `Edit ${input.file_path ?? ""}`;
    case "Bash":
      return `$ ${(input.command ?? "").split("\n")[0].slice(0, 120)}`;
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
