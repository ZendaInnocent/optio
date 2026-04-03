export type { AgentAdapter, AgentCommandOptions, AgentEventParseResult } from "./types.js";
export { ClaudeCodeAdapter } from "./claude-code.js";
export { CodexAdapter } from "./codex.js";
export { OpencodeAdapter } from "./opencode.js";

import type { AgentAdapter } from "./types.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { CodexAdapter } from "./codex.js";
import { OpencodeAdapter } from "./opencode.js";

const adapters: Record<string, AgentAdapter> = {
  "claude-code": new ClaudeCodeAdapter(),
  codex: new CodexAdapter(),
  opencode: new OpencodeAdapter(),
};

export function getAdapter(type: string): AgentAdapter {
  const adapter = adapters[type];
  if (!adapter) {
    throw new Error(`Unknown agent type: ${type}. Available: ${Object.keys(adapters).join(", ")}`);
  }
  return adapter;
}

export function getAvailableAdapters(): AgentAdapter[] {
  return Object.values(adapters);
}
