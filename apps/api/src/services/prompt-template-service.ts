import { eq, and, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { promptTemplates, repos } from "../db/schema.js";
import {
  DEFAULT_PROMPT_TEMPLATE,
  DEFAULT_REVIEW_PROMPT_TEMPLATE,
  normalizeRepoUrl,
} from "@optio/shared";
import { promptLoader } from "../lib/agent/prompt-loader.js";

export type WorkflowType = "do-work" | "plan" | "review";

/**
 * Get the prompt template for a repo and workflow type. Priority:
 * 1. Repo-level override (repos.promptTemplateOverride)
 * 2. Modular prompt from .agents/prompts/ via PromptLoader
 * 3. Global default (prompt_templates table)
 * 4. Hardcoded default
 */
export async function getPromptTemplate(
  repoUrl?: string,
  workflowType?: WorkflowType,
): Promise<{
  id: string;
  template: string;
  autoMerge: boolean;
}> {
  // Check repo-level override first
  if (repoUrl) {
    const normalized = normalizeRepoUrl(repoUrl);
    const [repo] = await db.select().from(repos).where(eq(repos.repoUrl, normalized));
    if (repo?.promptTemplateOverride) {
      return {
        id: repo.id,
        template: repo.promptTemplateOverride,
        autoMerge: repo.autoMerge,
      };
    }
    // Also use the repo's autoMerge setting even if no prompt override
    if (repo) {
      const globalTemplate = await getGlobalDefault(workflowType);
      return {
        ...globalTemplate,
        autoMerge: repo.autoMerge,
      };
    }
  }

  return getGlobalDefault(workflowType);
}

async function getGlobalDefault(workflowType?: WorkflowType): Promise<{
  id: string;
  template: string;
  autoMerge: boolean;
}> {
  const [defaultTemplate] = await db
    .select()
    .from(promptTemplates)
    .where(and(eq(promptTemplates.isDefault, true), isNull(promptTemplates.repoUrl)));

  if (defaultTemplate) {
    return {
      id: defaultTemplate.id,
      template: defaultTemplate.template,
      autoMerge: defaultTemplate.autoMerge,
    };
  }

  // Fall back to modular prompts from .agents/prompts/ if no DB template exists
  if (workflowType) {
    try {
      const loaded = await promptLoader.load({ type: workflowType });
      return {
        id: `modular:${workflowType}`,
        template: loaded.content,
        autoMerge: false,
      };
    } catch {
      // Fall through to hardcoded defaults
    }
  }

  // Hardcoded defaults by workflow type
  switch (workflowType) {
    case "review":
      return {
        id: "builtin",
        template: DEFAULT_REVIEW_PROMPT_TEMPLATE,
        autoMerge: false,
      };
    case "plan":
    case "do-work":
    default:
      return {
        id: "builtin",
        template: DEFAULT_PROMPT_TEMPLATE,
        autoMerge: false,
      };
  }
}

/**
 * Save or update the global default prompt template.
 */
export async function saveDefaultPromptTemplate(
  template: string,
  autoMerge: boolean,
): Promise<void> {
  const [existing] = await db
    .select()
    .from(promptTemplates)
    .where(and(eq(promptTemplates.isDefault, true), isNull(promptTemplates.repoUrl)));

  if (existing) {
    await db
      .update(promptTemplates)
      .set({ template, autoMerge, updatedAt: new Date() })
      .where(eq(promptTemplates.id, existing.id));
  } else {
    await db.insert(promptTemplates).values({
      name: "default",
      template,
      isDefault: true,
      autoMerge,
    });
  }
}

/**
 * Save or update a repo-specific prompt template.
 */
export async function saveRepoPromptTemplate(
  rawRepoUrl: string,
  template: string,
  autoMerge: boolean,
): Promise<void> {
  const repoUrl = normalizeRepoUrl(rawRepoUrl);
  const [existing] = await db
    .select()
    .from(promptTemplates)
    .where(eq(promptTemplates.repoUrl, repoUrl));

  if (existing) {
    await db
      .update(promptTemplates)
      .set({ template, autoMerge, updatedAt: new Date() })
      .where(eq(promptTemplates.id, existing.id));
  } else {
    await db.insert(promptTemplates).values({
      name: `repo:${repoUrl}`,
      template,
      repoUrl,
      autoMerge,
    });
  }
}

/**
 * List all prompt templates.
 */
export async function listPromptTemplates() {
  return db.select().from(promptTemplates);
}
