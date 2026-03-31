import {
  AGENT_DEFINITIONS,
  type AgentType,
  PRESET_IMAGES,
  type PresetImageId,
} from "@optio/shared";
import { DockerfileGeneratorError } from "./types.js";

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
  languagePreset: PresetImageId;

  /**
   * Optional custom Dockerfile to merge with generated layers.
   * If provided, the generated layers will be injected at the
   * placeholder comment `<!-- INSERT_GENERATED_LAYERS -->` if found,
   * otherwise appended at the end.
   */
  customDockerfile?: string;
}

/**
 * Generator for Dockerfiles that combine base images, agent installations,
 * and language-specific tools into a single optimized image.
 */
export class DockerfileGenerator {
  /**
   * Generates a complete Dockerfile string based on the provided configuration.
   *
   * @param config - The image configuration
   * @returns A valid Dockerfile as a string
   * @throws DockerfileGeneratorError if configuration is invalid
   */
  generate(config: {
    agentTypes: readonly AgentType[];
    languagePreset: PresetImageId;
    customDockerfile?: string;
  }): string {
    this.validateConfig(config);

    const lines: string[] = [];

    // Start with custom Dockerfile if provided, otherwise use base image
    if (config.customDockerfile) {
      lines.push(...this.processCustomDockerfile(config.customDockerfile, config));
    } else {
      lines.push("FROM optio-base:latest");
    }

    // If we have a custom Dockerfile that didn't have a placeholder, we'll
    // append generated layers at the end. If no custom Dockerfile, we need
    // to add the generated layers now.
    if (
      !config.customDockerfile ||
      !config.customDockerfile.includes("<!-- INSERT_GENERATED_LAYERS -->")
    ) {
      lines.push("", "# --- Generated layers ---");
      // Switch to root before any RUN commands
      lines.push("USER root");
      lines.push(...this.generateAgentLayers(config.agentTypes));
      lines.push(...this.generateLanguageLayers(config.languagePreset));
      lines.push("", "USER agent");
      lines.push("WORKDIR /workspace");
    } else {
      // If there was a placeholder, it was already replaced in processCustomDockerfile
      // Just ensure we end with USER agent and WORKDIR if not already present
      const content = lines.join("\n");
      if (!content.includes("USER agent")) {
        lines.push("", "USER agent");
      }
      if (!content.includes("WORKDIR /workspace")) {
        lines.push("WORKDIR /workspace");
      }
    }

    return lines.join("\n");
  }

  /**
   * Validates the configuration and throws descriptive errors.
   */
  private validateConfig(config: {
    agentTypes: readonly AgentType[];
    languagePreset: PresetImageId;
    customDockerfile?: string;
  }): void {
    // Validate agentTypes
    if (!Array.isArray(config.agentTypes)) {
      throw new DockerfileGeneratorError("agentTypes must be an array");
    }

    for (const agent of config.agentTypes) {
      if (typeof agent !== "string") {
        throw new DockerfileGeneratorError("All agent types must be strings");
      }
      if (!(agent in AGENT_DEFINITIONS)) {
        throw new DockerfileGeneratorError(`Unknown agent type: ${agent}`);
      }
    }

    // Validate languagePreset
    if (typeof config.languagePreset !== "string") {
      throw new DockerfileGeneratorError("languagePreset must be a string");
    }
    if (!(config.languagePreset in PRESET_IMAGES)) {
      throw new DockerfileGeneratorError(`Unknown language preset: ${config.languagePreset}`);
    }
  }

  /**
   * Generates RUN commands for installing selected agents.
   */
  private generateAgentLayers(agentTypes: readonly AgentType[]): string[] {
    const layers: string[] = [];

    for (const agentType of agentTypes) {
      const agent = AGENT_DEFINITIONS[agentType];
      if (agent.installCommand) {
        layers.push(`RUN ${agent.installCommand}`);
      }
    }

    return layers;
  }

  /**
   * Generates RUN commands and environment setup for the language preset.
   */
  private generateLanguageLayers(preset: PresetImageId): string[] {
    const layers: string[] = [];

    switch (preset) {
      case "node":
        layers.push(
          "USER root",
          "",
          "# Bun package manager",
          "RUN curl -fsSL https://bun.sh/install | bash \\",
          "    && mv /root/.bun/bin/bun /usr/local/bin/ \\",
          "    && rm -rf /root/.bun",
          "",
          "# Build tools for native modules",
          "RUN apt-get update && apt-get install -y build-essential python3-dev \\",
          "    && rm -rf /var/lib/apt/lists/*",
        );
        break;

      case "python":
        layers.push(
          "USER root",
          "",
          "# Full Python toolchain",
          "RUN apt-get update && apt-get install -y \\",
          "    python3-full python3-pip python3-venv python3-dev \\",
          "    build-essential \\",
          "    && rm -rf /var/lib/apt/lists/*",
          "",
          "# uv (fast Python package manager)",
          "RUN curl -LsSf https://astral.sh/uv/install.sh | sh \\",
          "    && mv /root/.local/bin/uv /usr/local/bin/ \\",
          "    && mv /root/.local/bin/uvx /usr/local/bin/ \\",
          "    && rm -rf /root/.local",
          "",
          "# poetry",
          "RUN pip3 install --break-system-packages poetry",
        );
        break;

      case "go":
        layers.push(
          "USER root",
          "",
          "# Go",
          "ENV GOVERSION=1.23.4",
          'RUN curl -fsSL "https://go.dev/dl/go${GOVERSION}.linux-$(dpkg --print-architecture).tar.gz" \\',
          "    | tar -C /usr/local -xzf -",
          'ENV PATH="/usr/local/go/bin:/home/agent/go/bin:${PATH}"',
          'ENV GOPATH="/home/agent/go"',
          "",
          "# protobuf compiler",
          "RUN apt-get update && apt-get install -y protobuf-compiler \\",
          "    && rm -rf /var/lib/apt/lists/*",
          "",
          "# Go tools",
          "RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@latest \\",
          "    && go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest \\",
          "    && go install golang.org/x/tools/gopls@latest",
        );
        break;

      case "rust":
        layers.push(
          "USER root",
          "",
          "# Build tools",
          "RUN apt-get update && apt-get install -y build-essential pkg-config libssl-dev \\",
          "    && rm -rf /var/lib/apt/lists/*",
          "",
          "USER agent",
          "",
          "# Rust via rustup",
          "RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
          'ENV PATH="/home/agent/.cargo/bin:${PATH}"',
          "",
          "# Common tools",
          "RUN cargo install cargo-watch \\",
          "    && cargo install cargo-nextest --locked || true",
        );
        break;

      case "full":
        layers.push(
          "USER root",
          "",
          "# Build essentials",
          "RUN apt-get update && apt-get install -y \\",
          "    build-essential pkg-config libssl-dev \\",
          "    python3-full python3-pip python3-venv python3-dev \\",
          "    protobuf-compiler \\",
          "    postgresql-client redis-tools \\",
          "    docker.io \\",
          "    && rm -rf /var/lib/apt/lists/*",
          "",
          "# Node.js package managers (pnpm and yarn are already provided by corepack in the base image)",
          "RUN curl -fsSL https://bun.sh/install | bash \\",
          "    && mv /root/.bun/bin/bun /usr/local/bin/ \\",
          "    && rm -rf /root/.bun",
          "",
          "# Python tools",
          "RUN curl -LsSf https://astral.sh/uv/install.sh | sh \\",
          "    && mv /root/.local/bin/uv /usr/local/bin/ \\",
          "    && mv /root/.local/bin/uvx /usr/local/bin/ \\",
          "    && rm -rf /root/.local \\",
          "    && pip3 install --break-system-packages poetry",
          "",
          "# Go",
          "ENV GOVERSION=1.23.4",
          'RUN curl -fsSL "https://go.dev/dl/go${GOVERSION}.linux-$(dpkg --print-architecture).tar.gz" \\',
          "    | tar -C /usr/local -xzf -",
          'ENV PATH="/usr/local/go/bin:/home/agent/go/bin:${PATH}"',
          'ENV GOPATH="/home/agent/go"',
          "",
          "USER agent",
          "",
          "# Rust",
          "RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y",
          'ENV PATH="/home/agent/.cargo/bin:${PATH}"',
        );
        break;

      case "dind":
        layers.push(
          "USER root",
          "",
          "# Docker daemon and CLI",
          "RUN apt-get update && apt-get install -y docker.io \\",
          "    && rm -rf /var/lib/apt/lists/*",
        );
        break;

      case "base":
      default:
        // No additional layers
        break;
    }

    return layers;
  }

  /**
   * Processes a custom Dockerfile by either inserting generated layers at the
   * placeholder or appending them at the end.
   */
  private processCustomDockerfile(
    customDockerfile: string,
    config: { agentTypes: readonly AgentType[]; languagePreset: PresetImageId },
  ): string[] {
    const lines = customDockerfile.split("\n");
    const generatedLayers = [
      "USER root", // Ensure we have root before any RUN
      ...this.generateAgentLayers(config.agentTypes),
      ...this.generateLanguageLayers(config.languagePreset),
    ];

    const placeholderIndex = lines.findIndex((line) =>
      line.includes("<!-- INSERT_GENERATED_LAYERS -->"),
    );

    if (placeholderIndex !== -1) {
      // Insert generated layers at the placeholder, replacing it
      const before = lines.slice(0, placeholderIndex);
      const after = lines.slice(placeholderIndex + 1);
      return [...before, ...generatedLayers, ...after];
    } else {
      // Append to the end
      return [
        ...lines,
        "",
        "# --- Generated layers ---",
        ...generatedLayers,
        "",
        "USER agent",
        "WORKDIR /workspace",
      ];
    }
  }
}
