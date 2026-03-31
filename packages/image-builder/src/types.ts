/**
 * Configuration for generating a Dockerfile.
 */
export interface ImageConfig {
  /**
   * Selected agent types to include in the image.
   * Each agent will be installed via its installCommand.
   */
  agentTypes: AgentType[];

  /**
   * Language preset to include language-specific tools.
   * Determines which additional tools get installed.
   */
  languagePreset: LanguagePresetId;

  /**
   * Optional custom Dockerfile to merge with generated layers.
   * If provided, the generated layers will be injected at the
   * placeholder comment `<!-- INSERT_GENERATED_LAYERS -->` if found,
   * otherwise appended at the end.
   */
  customDockerfile?: string;
}

export type LanguagePresetId = "base" | "node" | "python" | "go" | "rust" | "full" | "dind";

/**
 * Represents an agent type with its installation command.
 */
export interface AgentDefinition {
  id: AgentType;
  name: string;
  description: string;
  installCommand: string;
  requiredSecrets: string[];
}

export type AgentType = "claude-code" | "codex" | "opencode";

/**
 * Thrown when the DockerfileGenerator encounters invalid configuration.
 */
export class DockerfileGeneratorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DockerfileGeneratorError";
  }
}
