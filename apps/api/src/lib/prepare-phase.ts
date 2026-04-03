import { TaskContext } from "./task-orchestrator-types.js";
import { getAdapter } from "@optio/agent-adapters";
import { getPromptTemplate } from "../services/prompt-template-service.js";
import { resolveSecretsForTask } from "../services/secret-service.js";
import { getMcpServersForTask, buildMcpJsonContent } from "../services/mcp-server-service.js";
import { getSkillsForTask, buildSkillSetupFiles } from "../services/skill-service.js";
import { promptLoader } from "../lib/agent/prompt-loader.js";
import {
  renderPromptTemplate,
  renderTaskFile,
  TASK_FILE_PATH,
  TASK_BRANCH_PREFIX,
} from "@optio/shared";

export interface PrepareResult {
  success: boolean;
  error?: string;
}

export async function runPrepare(ctx: TaskContext): Promise<PrepareResult> {
  const { task, repo, log } = ctx;

  // ── Load prompt template ──────────────────────────────────────────
  const workflowType = (task as any).workflowType ?? "do-work";
  const promptConfig = await getPromptTemplate(task.repoUrl, workflowType);
  if (!promptConfig) {
    return {
      success: false,
      error: `No prompt template found for workflow type "${workflowType}"`,
    };
  }

  // ── Render prompt and task file ───────────────────────────────────
  const repoName = task.repoUrl.replace(/.*github\.com[/:]/, "").replace(/\.git$/, "");
  const branchName = `${TASK_BRANCH_PREFIX}${task.id}`;

  const renderedPrompt = renderPromptTemplate(promptConfig.template, {
    TASK_FILE: TASK_FILE_PATH,
    BRANCH_NAME: branchName,
    TASK_ID: task.id,
    TASK_TITLE: task.title,
    REPO_NAME: repoName,
    AUTO_MERGE: String(promptConfig.autoMerge),
    ISSUE_NUMBER: task.ticketExternalId ?? "",
  });

  const taskFileContent = renderTaskFile({
    taskTitle: task.title,
    taskBody: task.prompt,
    taskId: task.id,
    ticketSource: task.ticketSource ?? undefined,
    ticketUrl: (task.metadata as any)?.ticketUrl,
  });

  // ── Resolve secrets ───────────────────────────────────────────────
  const secrets = await resolveSecretsForTask(task.repoUrl, task.workspaceId);
  ctx.secrets = secrets;

  // ── Build agent config ────────────────────────────────────────────
  const adapter = getAdapter(task.agentType);
  const optioApiUrl = `http://${process.env.API_HOST ?? "host.docker.internal"}:${process.env.API_PORT ?? "4000"}`;

  const agentConfig = adapter.buildContainerConfig({
    taskId: task.id,
    prompt: task.prompt,
    repoUrl: task.repoUrl,
    repoBranch: task.repoBranch,
    claudeAuthMode: "api-key",
    codexAuthMode: "api-key",
    optioApiUrl,
    renderedPrompt,
    taskFileContent,
    taskFilePath: TASK_FILE_PATH,
    claudeModel: repo.claudeModel ?? undefined,
    claudeContextWindow: repo.claudeContextWindow ?? undefined,
    claudeThinking: repo.claudeThinking ?? undefined,
    claudeEffort: repo.claudeEffort ?? undefined,
    opencodeModel: repo.opencodeModel ?? undefined,
    opencodeTemperature: repo.opencodeTemperature ? Number(repo.opencodeTemperature) : undefined,
    opencodeTopP: repo.opencodeTopP ? Number(repo.opencodeTopP) : undefined,
  });

  // ── MCP servers ───────────────────────────────────────────────────
  const mcpServers = await getMcpServersForTask(task.repoUrl, task.workspaceId);
  if (mcpServers.length > 0) {
    const mcpJsonContent = await buildMcpJsonContent(mcpServers, task.repoUrl);
    agentConfig.setupFiles = agentConfig.setupFiles ?? [];
    agentConfig.setupFiles.push({
      path: ".mcp.json",
      content: mcpJsonContent,
    });
    log.info({ count: mcpServers.length }, "MCP servers configured");
  }

  // ── Custom skills ─────────────────────────────────────────────────
  const skills = await getSkillsForTask(task.repoUrl, task.workspaceId);
  if (skills.length > 0) {
    const skillFiles = await buildSkillSetupFiles(skills);
    agentConfig.setupFiles = agentConfig.setupFiles ?? [];
    agentConfig.setupFiles.push(...skillFiles);
    log.info({ count: skills.length }, "Custom skills configured");
  }

  // ── Build prompt file ─────────────────────────────────────────────
  const promptFile = await promptLoader.buildPromptFile({
    renderedPrompt,
    taskFileContent,
    taskFilePath: TASK_FILE_PATH,
    agentConfig,
  });

  ctx.agentImage = agentConfig.image;
  (ctx as any)._agentConfig = agentConfig;
  (ctx as any)._promptFile = promptFile;

  log.info("Task preparation complete");
  return { success: true };
}
