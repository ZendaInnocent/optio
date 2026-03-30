import type { AgentLogEntry } from "@optio/shared";

/**
 * Parse a single NDJSON line from OpenCode's output.
 *
 * OpenCode aims for compatibility with Claude Code's stream-json format.
 * Expected event types:
 * - { type: "system", subtype: "init", session_id, model, tools, ... }
 * - { type: "assistant", message: { content: [{ type: "thinking"|"text"|"tool_use" }] }, session_id }
 * - { type: "user", message: { content: [{ type: "tool_result" }] }, session_id }
 * - { type: "result", result: "...", total_cost_usd, num_turns, duration_ms, session_id }
 * - { type: "error", error: "...", message: "..." }
 *
 * Returns multiple entries per line (one per content block) since an assistant
 * message can contain thinking + tool_use in one event.
 */
export function parseOpencodeEvent(
  line: string,
  taskId: string,
): { entries: AgentLogEntry[]; sessionId?: string } {
  let event: any;
  try {
    event = JSON.parse(line);
  } catch {
    // Not JSON — raw text from shell/git
    if (!line.trim()) return { entries: [] };
    // Filter out terminal control sequences
    const clean = line.replace(/\x1b\[[0-9;]*[a-zA-Z]|\r/g, "").trim();
    if (!clean || clean.length < 2) return { entries: [] };
    // Check for PR URL in the text
    const prMatch = clean.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
    const content = prMatch ? clean.replace(prMatch[0], `🔗 ${prMatch[0]}`) : clean;
    return {
      entries: [{ taskId, timestamp: new Date().toISOString(), type: "text", content }],
    };
  }

  const sessionId = event.session_id ?? event.id ?? (event.conversation_id as string | undefined);
  const timestamp = new Date().toISOString();
  const entries: AgentLogEntry[] = [];

  // System init event
  if (event.type === "system" && event.subtype === "init") {
    const toolCount = Array.isArray(event.tools) ? event.tools.length : 0;
    entries.push({
      taskId,
      timestamp,
      sessionId,
      type: "system",
      content: `Session started · ${event.model ?? "unknown"} · ${toolCount} tools`,
      metadata: { model: event.model },
    });
    return { entries, sessionId };
  }

  // Other system events (with or without subtype)
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

  // Assistant message — the main event type
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

  // User message (tool results)
  if (event.type === "user" && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === "tool_result") {
        const raw =
          typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content.map((c: any) => c.text ?? c.content ?? "").join("")
              : "";
        const trimmed = raw.length > 300 ? raw.slice(0, 300) + "…" : raw;
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

  // Result event (final summary)
  if (event.type === "result") {
    const parts: string[] = [];
    if (event.result) parts.push(event.result);
    const meta: string[] = [];
    if (event.num_turns) meta.push(`${event.num_turns} turns`);
    if (event.duration_ms) meta.push(`${(event.duration_ms / 1000).toFixed(1)}s`);
    if (event.total_cost_usd) meta.push(`$${event.total_cost_usd.toFixed(4)}`);
    if (meta.length) parts.push(`(${meta.join(" · ")})`);

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

  // Error event
  if (event.type === "error") {
    const msg = [event.error, event.message].filter(Boolean).join(": ");
    const content = msg || JSON.stringify(event);
    entries.push({
      taskId,
      timestamp,
      sessionId,
      type: "error",
      content,
    });
    return { entries, sessionId };
  }

  // Usage or cost-only event (may be separate from result)
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
        content: `Usage: ${meta.join(" · ")}`,
        metadata: {
          inputTokens,
          outputTokens,
          cost: event.total_cost_usd,
        },
      });
    }
    return { entries, sessionId };
  }

  // Unknown JSON event — skip
  return { entries: [], sessionId };
}

/** Format a tool use into a concise human-readable string */
function formatToolUse(name: string, input: any): string {
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
