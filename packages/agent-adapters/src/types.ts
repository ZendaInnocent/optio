import type {
  AgentTaskInput,
  AgentContainerConfig,
  AgentResult,
  AgentLogEntry,
} from "@optio/shared";

export interface AgentExecCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentCommandOptions {
  resumeSessionId?: string;
  resumePrompt?: string;
  isReview?: boolean;
  maxTurnsCoding?: number;
  maxTurnsReview?: number;
}

export interface AgentEventParseResult {
  entries: AgentLogEntry[];
  sessionId?: string;
}

export interface AgentAdapter {
  readonly type: string;
  readonly displayName: string;

  /** Validate that required secrets are available */
  validateSecrets(
    availableSecrets: string[],
    agentConfig?: Record<string, unknown>,
  ): { valid: boolean; missing: string[] };

  /** Build the container configuration for running this agent */
  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig;

  /** Build the command to execute a prompt non-interactively */
  getExecCommand(
    prompt: string,
    model?: string,
    authEnv?: Record<string, string>,
  ): AgentExecCommand;

  /** Build the full shell command array for task execution */
  buildAgentCommand(env: Record<string, string>, opts?: AgentCommandOptions): string[];

  /** Infer exit code from agent logs based on agent-specific error patterns */
  inferExitCode(logs: string): number;

  /** Parse a single NDJSON/SSE line from the agent's output stream */
  parseEvent(line: string, taskId: string): AgentEventParseResult;

  /** Parse agent output to determine the result */
  parseResult(exitCode: number, logs: string): AgentResult;
}
