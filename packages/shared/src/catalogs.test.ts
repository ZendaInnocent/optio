import { describe, it, expect } from "vitest";
import { AGENT_DEFINITIONS, type AgentType } from "./types/optio-settings.js";
import { PRESET_IMAGES, type PresetImageId } from "./types/image.js";

describe("Agent Catalog", () => {
  it("should have all required agent types", () => {
    const requiredAgents: AgentType[] = ["claude-code", "codex", "opencode"];
    requiredAgents.forEach((agent) => {
      expect(AGENT_DEFINITIONS).toHaveProperty(agent);
    });
  });

  it("each agent should have name, description, requiredSecrets, and installCommand", () => {
    (Object.values(AGENT_DEFINITIONS) as Array<(typeof AGENT_DEFINITIONS)[AgentType]>).forEach(
      (agent) => {
        expect(agent.name).toBeTypeOf("string");
        expect(agent.name.length).toBeGreaterThan(0);
        expect(agent.description).toBeTypeOf("string");
        expect(agent.description.length).toBeGreaterThan(0);
        expect(agent.requiredSecrets).toBeInstanceOf(Array);
        expect(agent.installCommand).toBeTypeOf("string");
        expect(agent.installCommand?.length).toBeGreaterThan(0);
      },
    );
  });

  it("requiredSecrets should be strings", () => {
    (Object.values(AGENT_DEFINITIONS) as Array<(typeof AGENT_DEFINITIONS)[AgentType]>).forEach(
      (agent) => {
        agent.requiredSecrets.forEach((secret) => {
          expect(secret).toBeTypeOf("string");
        });
      },
    );
  });
});

describe("Language Preset Catalog", () => {
  const requiredPresets: PresetImageId[] = ["base", "node", "python", "go", "rust", "full"];

  it("should have all required preset images", () => {
    requiredPresets.forEach((preset) => {
      expect(PRESET_IMAGES).toHaveProperty(preset);
    });
  });

  it("each preset should have tag, label, description, and languages", () => {
    (
      Object.entries(PRESET_IMAGES) as Array<[PresetImageId, (typeof PRESET_IMAGES)[PresetImageId]]>
    ).forEach(([key, preset]) => {
      expect(typeof key).toBe("string");
      expect(preset.tag).toBeTypeOf("string");
      expect(preset.label).toBeTypeOf("string");
      expect(preset.description).toBeTypeOf("string");
      expect(preset.languages).toBeInstanceOf(Array);
    });
  });

  it("full preset should include all language types", () => {
    const fullPreset = PRESET_IMAGES.full;
    expect(fullPreset.languages).toContain("javascript");
    expect(fullPreset.languages).toContain("typescript");
    expect(fullPreset.languages).toContain("python");
    expect(fullPreset.languages).toContain("go");
    expect(fullPreset.languages).toContain("rust");
  });

  it("preset image IDs should match PresetImageId type", () => {
    const presetIds = Object.keys(PRESET_IMAGES) as Array<PresetImageId>;
    presetIds.forEach((id) => {
      expect(PRESET_IMAGES[id]).toBeDefined();
    });
  });
});
