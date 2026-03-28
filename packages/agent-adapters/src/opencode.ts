import type { AgentTaskInput, AgentContainerConfig, AgentResult } from "@optio/shared";
import { TASK_BRANCH_PREFIX } from "@optio/shared";
import type { AgentAdapter } from "./types.js";

export class OpencodeAdapter implements AgentAdapter {
  readonly type = "opencode";
  readonly displayName = "Opencode AI";

  validateSecrets(availableSecrets: string[]): { valid: boolean; missing: string[] } {
    const required = ["GITHUB_TOKEN"];
    const missing = required.filter((s) => !availableSecrets.includes(s));
    return { valid: missing.length === 0, missing };
  }

  buildContainerConfig(input: AgentTaskInput): AgentContainerConfig {
    const prompt = input.renderedPrompt ?? input.prompt;

    const env: Record<string, string> = {
      OPTIO_TASK_ID: input.taskId,
      OPTIO_REPO_URL: input.repoUrl,
      OPTIO_REPO_BRANCH: input.repoBranch,
      OPTIO_PROMPT: prompt,
      OPTIO_AGENT_TYPE: "opencode",
      OPTIO_BRANCH_NAME: `${TASK_BRANCH_PREFIX}${input.taskId}`,
    };

    const requiredSecrets = ["GITHUB_TOKEN"];
    const setupFiles: AgentContainerConfig["setupFiles"] = [];

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

  parseResult(exitCode: number, logs: string): AgentResult {
    const prMatch = logs.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
    const costMatch = logs.match(/"total_cost_usd":\s*([\d.]+)/);

    let error: string | undefined;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let model: string | undefined;

    for (const line of logs.split("\n")) {
      try {
        const event = JSON.parse(line);

        if (event.model && !model) {
          model = event.model;
        }

        if (event.usage) {
          totalInputTokens += event.usage.input_tokens || 0;
          totalOutputTokens += event.usage.output_tokens || 0;
        }

        if (event.type === "error" && event.message) {
          error = event.message;
        }
      } catch {
        // Not JSON, skip
      }
    }

    if (exitCode !== 0 && !error) {
      error = `Exit code: ${exitCode}`;
    }

    const success = exitCode === 0 && !error;

    return {
      success,
      prUrl: prMatch?.[0],
      costUsd: costMatch ? parseFloat(costMatch[1]) : undefined,
      inputTokens: totalInputTokens > 0 ? totalInputTokens : undefined,
      outputTokens: totalOutputTokens > 0 ? totalOutputTokens : undefined,
      model,
      summary: success ? "Agent completed successfully" : `Agent exited with code ${exitCode}`,
      error,
    };
  }
}
