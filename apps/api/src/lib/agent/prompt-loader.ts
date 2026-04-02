import fs from "fs";
import path from "path";
import { renderPromptTemplate } from "@optio/shared";

export interface PromptConfig {
  type: "do-work" | "plan" | "review";
  phase?: string;
  includeHooks?: boolean;
}

export interface PromptVariables {
  TASK_FILE?: string;
  BRANCH_NAME?: string;
  TASK_ID?: string;
  TASK_TITLE?: string;
  REPO_NAME?: string;
  AUTO_MERGE?: string;
  ISSUE_NUMBER?: string;
  PR_NUMBER?: string;
  TEST_COMMAND?: string;
  [key: string]: string | undefined;
}

export interface LoadedPrompt {
  content: string;
  type: string;
  phase?: string;
  metadata: Record<string, unknown>;
}

const AGENTS_DIR = path.resolve(process.cwd(), ".agents");

export class PromptLoader {
  private cache: Map<string, LoadedPrompt> = new Map();

  async load(config: PromptConfig): Promise<LoadedPrompt> {
    const cacheKey = `${config.type}:${config.phase ?? "main"}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    let content: string;

    switch (config.type) {
      case "do-work":
        content = await this.loadDoWorkPrompt(config.phase);
        break;
      case "plan":
        content = await this.loadPlanPrompt(config.phase ?? "analyze");
        break;
      case "review":
        content = await this.loadReviewPrompt(config.phase ?? "code-quality");
        break;
      default:
        throw new Error(`Unknown prompt type: ${config.type}`);
    }

    const loaded: LoadedPrompt = {
      content,
      type: config.type,
      phase: config.phase,
      metadata: {
        loadedAt: new Date().toISOString(),
        source: this.getPromptPath(config),
      },
    };

    this.cache.set(cacheKey, loaded);
    return loaded;
  }

  private async loadDoWorkPrompt(phase?: string): Promise<string> {
    const promptsDir = path.join(AGENTS_DIR, "prompts", "do-work");

    if (phase) {
      const phasePath = path.join(promptsDir, "phases", `${phase}.md`);
      if (fs.existsSync(phasePath)) {
        return fs.readFileSync(phasePath, "utf-8");
      }
    }

    const mainPath = path.join(promptsDir, "main.md");
    if (!fs.existsSync(mainPath)) {
      throw new Error(`Do-work main.md not found at ${mainPath}`);
    }

    let content = fs.readFileSync(mainPath, "utf-8");

    content = await this.resolveIncludes(content, promptsDir);

    return content;
  }

  private async loadPlanPrompt(phase: string): Promise<string> {
    const planDir = path.join(AGENTS_DIR, "prompts", "plan");
    const phasePath = path.join(planDir, `${phase}.md`);

    if (!fs.existsSync(phasePath)) {
      throw new Error(`Plan prompt not found: ${phasePath}`);
    }

    return fs.readFileSync(phasePath, "utf-8");
  }

  private async loadReviewPrompt(phase: string): Promise<string> {
    const reviewDir = path.join(AGENTS_DIR, "prompts", "review");
    const phasePath = path.join(reviewDir, `${phase}.md`);

    if (!fs.existsSync(phasePath)) {
      throw new Error(`Review prompt not found: ${phasePath}`);
    }

    return fs.readFileSync(phasePath, "utf-8");
  }

  private async resolveIncludes(content: string, baseDir: string): Promise<string> {
    const includeRegex = /INCLUDE:\s*(.+)/g;
    let result = content;
    let match;

    while ((match = includeRegex.exec(content)) !== null) {
      const includePath = match[1].trim();
      const fullPath = path.resolve(baseDir, includePath);

      if (fs.existsSync(fullPath)) {
        const included = fs.readFileSync(fullPath, "utf-8");
        result = result.replace(match[0], included);
      } else {
        result = result.replace(match[0], `<!-- INCLUDE NOT FOUND: ${includePath} -->`);
      }
    }

    return result;
  }

  private getPromptPath(config: PromptConfig): string {
    const promptsDir = path.join(AGENTS_DIR, "prompts", config.type);
    if (config.phase) {
      return path.join(
        promptsDir,
        config.phase === "main" ? "main.md" : `phases/${config.phase}.md`,
      );
    }
    return path.join(promptsDir, "main.md");
  }

  render(content: string, variables: PromptVariables): string {
    return renderPromptTemplate(content, variables as Record<string, string>);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const promptLoader = new PromptLoader();
