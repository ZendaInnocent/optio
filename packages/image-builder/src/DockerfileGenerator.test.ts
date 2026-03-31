import { describe, it, expect } from "vitest";
import { DockerfileGenerator } from "./DockerfileGenerator.js";
import { DockerfileGeneratorError } from "./types.js";
import type { AgentType, PresetImageId } from "@optio/shared";

describe("DockerfileGenerator", () => {
  const generator = new DockerfileGenerator();

  describe("generate()", () => {
    it("should generate a basic Dockerfile with base image and no agents or presets", () => {
      const config = {
        agentTypes: [] as AgentType[],
        languagePreset: "base" as PresetImageId,
      };
      const dockerfile = generator.generate(config);

      expect(dockerfile).toContain("FROM optio-base:latest");
      expect(dockerfile).toContain("USER agent");
      expect(dockerfile).toContain("WORKDIR /workspace");
    });

    it("should include claude-code agent when specified", () => {
      const config = {
        agentTypes: ["claude-code"] as AgentType[],
        languagePreset: "base" as PresetImageId,
      };
      const dockerfile = generator.generate(config);

      expect(dockerfile).toContain("RUN npm install -g @anthropic-ai/claude-code");
    });

    it("should include opencode agent when specified", () => {
      const config = {
        agentTypes: ["opencode"] as AgentType[],
        languagePreset: "base" as PresetImageId,
      };
      const dockerfile = generator.generate(config);

      expect(dockerfile).toContain("RUN npm install -g opencode-ai");
    });

    it("should include codex agent when specified", () => {
      const config = {
        agentTypes: ["codex"] as AgentType[],
        languagePreset: "base" as PresetImageId,
      };
      const dockerfile = generator.generate(config);

      expect(dockerfile).toContain("RUN npm install -g codex-cli");
    });

    it("should include multiple agents when specified", () => {
      const config = {
        agentTypes: ["claude-code", "opencode", "codex"] as AgentType[],
        languagePreset: "base" as PresetImageId,
      };
      const dockerfile = generator.generate(config);

      expect(dockerfile).toContain("RUN npm install -g @anthropic-ai/claude-code");
      expect(dockerfile).toContain("RUN npm install -g opencode-ai");
      expect(dockerfile).toContain("RUN npm install -g codex-cli");
    });

    describe("language presets", () => {
      it("should not add any extra packages for base preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "base" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).not.toContain("build-essential");
        expect(dockerfile).not.toContain("python3-full");
        expect(dockerfile).not.toContain("curl -fsSL https://bun.sh/install");
      });

      it("should add bun and build tools for node preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "node" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain("bun");
        expect(dockerfile).toContain("build-essential");
        expect(dockerfile).toContain("python3-dev");
      });

      it("should add Python toolchain for python preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "python" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain("python3-full");
        expect(dockerfile).toContain("uv");
        expect(dockerfile).toContain("poetry");
      });

      it("should add Go toolchain for go preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "go" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain("GOVERSION=1.23.4");
        expect(dockerfile).toContain("protobuf-compiler");
        expect(dockerfile).toContain("gopls");
      });

      it("should add Rust toolchain for rust preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "rust" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain("rustup");
        expect(dockerfile).toContain("cargo");
        expect(dockerfile).toContain("cargo-nextest");
      });

      it("should add everything for full preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "full" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        // Node
        expect(dockerfile).toContain("bun");
        // Python
        expect(dockerfile).toContain("uv");
        // Go
        expect(dockerfile).toContain("GOVERSION=1.23.4");
        // Rust
        expect(dockerfile).toContain("rustup");
        // Additional tools
        expect(dockerfile).toContain("docker.io");
        expect(dockerfile).toContain("postgresql-client");
        expect(dockerfile).toContain("redis-tools");
      });

      it("should add Docker daemon for dind preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "dind" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain("docker.io");
      });
    });

    describe("custom Dockerfile merge", () => {
      it("should insert generated layers at placeholder if present", () => {
        const customDockerfile = `
FROM ubuntu:24.04
# Custom setup
RUN echo "Hello"
<!-- INSERT_GENERATED_LAYERS -->
# More custom stuff
`;
        const config = {
          agentTypes: ["claude-code"] as AgentType[],
          languagePreset: "node" as PresetImageId,
          customDockerfile,
        };
        const dockerfile = generator.generate(config);

        // The placeholder should be replaced with generated content
        expect(dockerfile).toContain("RUN npm install -g @anthropic-ai/claude-code");
        expect(dockerfile).toContain("bun");
        // Placeholder should NOT be present (replaced)
        expect(dockerfile).not.toContain("<!-- INSERT_GENERATED_LAYERS -->");
        // Custom content should still be there
        expect(dockerfile).toContain("Custom setup");
        expect(dockerfile).toContain("More custom stuff");
      });

      it("should append generated layers if no placeholder is found", () => {
        const customDockerfile = `
FROM ubuntu:24.04
RUN echo "Hello"
`;
        const config = {
          agentTypes: ["opencode"] as AgentType[],
          languagePreset: "python" as PresetImageId,
          customDockerfile,
        };
        const dockerfile = generator.generate(config);

        // Custom content should come first
        expect(dockerfile).toContain("FROM ubuntu:24.04");
        expect(dockerfile).toContain('RUN echo "Hello"');
        // Generated content should be appended at the end
        expect(dockerfile).toContain("RUN npm install -g opencode-ai");
        expect(dockerfile).toContain("uv");
      });

      it("should preserve entire custom Dockerfile structure when appending", () => {
        const customDockerfile = `
FROM ubuntu:24.04
USER root
RUN apt-get update
`;
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "base" as PresetImageId,
          customDockerfile,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain("FROM ubuntu:24.04");
        expect(dockerfile).toContain("USER root");
        expect(dockerfile).toContain("RUN apt-get update");
      });
    });

    describe("validation errors", () => {
      it("should throw error for unknown agent type", () => {
        const config = {
          agentTypes: ["unknown-agent"] as any,
          languagePreset: "base" as PresetImageId,
        };

        expect(() => generator.generate(config)).toThrow(DockerfileGeneratorError);
        expect(() => generator.generate(config)).toThrow("Unknown agent type: unknown-agent");
      });

      it("should throw error for invalid language preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "super-python" as any,
        };

        expect(() => generator.generate(config)).toThrow(DockerfileGeneratorError);
        expect(() => generator.generate(config)).toThrow("Unknown language preset: super-python");
      });

      it("should throw error if agentTypes is not an array", () => {
        const config = {
          agentTypes: "claude-code" as any,
          languagePreset: "base" as PresetImageId,
        };

        expect(() => generator.generate(config)).toThrow(DockerfileGeneratorError);
      });
    });

    describe("ordering and structure", () => {
      it("should set USER root before adding RUN layers", () => {
        const config = {
          agentTypes: ["claude-code"] as AgentType[],
          languagePreset: "node" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        // Find the position of USER root and RUN commands
        const userRootIndex = dockerfile.indexOf("USER root");
        const firstRunIndex = dockerfile.indexOf("RUN ");

        expect(userRootIndex).toBeLessThan(firstRunIndex);
      });

      it("should end with USER agent", () => {
        const config = {
          agentTypes: ["opencode"] as AgentType[],
          languagePreset: "rust" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        const lastLines = dockerfile.split("\n").slice(-10);
        expect(lastLines.some((line) => line.trim() === "USER agent")).toBe(true);
      });

      it("should include ENTRYPOINT from base if custom Dockerfile has it", () => {
        const customDockerfile = `
FROM optio-base:latest
ENTRYPOINT ["/opt/optio/repo-init.sh"]
<!-- INSERT_GENERATED_LAYERS -->
`;
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "base" as PresetImageId,
          customDockerfile,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toContain('ENTRYPOINT ["/opt/optio/repo-init.sh"]');
      });
    });

    describe("edge cases", () => {
      it("should handle empty agentTypes array with base preset", () => {
        const config = {
          agentTypes: [] as AgentType[],
          languagePreset: "base" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        expect(dockerfile).toBeTruthy();
        expect(dockerfile).toContain("FROM optio-base:latest");
      });

      it("should handle all agents with full preset", () => {
        const config = {
          agentTypes: ["claude-code", "codex", "opencode"] as AgentType[],
          languagePreset: "full" as PresetImageId,
        };
        const dockerfile = generator.generate(config);

        // All agents
        expect(dockerfile).toContain("@anthropic-ai/claude-code");
        expect(dockerfile).toContain("codex-cli");
        expect(dockerfile).toContain("opencode-ai");
        // Full preset tools
        expect(dockerfile).toContain("bun");
        expect(dockerfile).toContain("uv");
        expect(dockerfile).toContain("GOVERSION=1.23.4");
        expect(dockerfile).toContain("rustup");
      });
    });
  });
});
