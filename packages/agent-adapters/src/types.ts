import type { AgentTaskInput, AgentContainerConfig, AgentResult } from "@optio/shared";

export interface AgentExecCommand {
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface AgentAdapter {
  readonly type: string;
  readonly displayName: string;

  /** Validate that required secrets are available */
  validateSecrets(availableSecrets: string[]): { valid: boolean; missing: string[] };

  /** Build the container configuration for running this agent */
  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig;

  /** Build the command to execute a prompt non-interactively */
  getExecCommand(
    prompt: string,
    model?: string,
    authEnv?: Record<string, string>,
  ): AgentExecCommand;

  /** Parse agent output to determine the result */
  parseResult(exitCode: number, logs: string): AgentResult;
}
