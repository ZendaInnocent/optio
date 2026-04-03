import { describe, it, expect } from "vitest";
import {
  repos,
  workspaceMembers,
  customImages,
  optioSettings,
  sessionMessages,
} from "../db/schema.js";

describe("Database Schema", () => {
  describe("repos table", () => {
    it("has agentTypes column (maps to agent_types in DB)", () => {
      expect("agentTypes" in repos).toBe(true);
    });

    it("has existing essential columns", () => {
      expect("repoUrl" in repos).toBe(true);
      expect("workspaceId" in repos).toBe(true);
      expect("imagePreset" in repos).toBe(true);
      expect("opencodeModel" in repos).toBe(true);
      expect("opencodeTemperature" in repos).toBe(true);
      expect("opencodeTopP" in repos).toBe(true);
    });
  });

  describe("workspace_members table", () => {
    it("has canBuild column", () => {
      expect("canBuild" in workspaceMembers).toBe(true);
    });

    it("has existing columns", () => {
      expect("id" in workspaceMembers).toBe(true);
      expect("workspaceId" in workspaceMembers).toBe(true);
      expect("userId" in workspaceMembers).toBe(true);
      expect("role" in workspaceMembers).toBe(true);
    });
  });

  describe("custom_images table", () => {
    it("has all required fields", () => {
      expect("id" in customImages).toBe(true);
      expect("workspaceId" in customImages).toBe(true);
      expect("repoUrl" in customImages).toBe(true);
      expect("imageTag" in customImages).toBe(true);
      expect("agentTypes" in customImages).toBe(true);
      expect("languagePreset" in customImages).toBe(true);
      expect("customDockerfile" in customImages).toBe(true);
      expect("buildStatus" in customImages).toBe(true);
      expect("buildLogs" in customImages).toBe(true);
      expect("builtAt" in customImages).toBe(true);
      expect("builtBy" in customImages).toBe(true);
    });
  });

  describe("optio_settings table", () => {
    it("has default_agent_type column", () => {
      expect("defaultAgentType" in optioSettings).toBe(true);
    });

    it("has default_language_preset column", () => {
      expect("defaultLanguagePreset" in optioSettings).toBe(true);
    });

    it("has enabled_models column for OpenCode Zen models", () => {
      expect("enabledModels" in optioSettings).toBe(true);
    });

    it("has existing settings columns", () => {
      expect("model" in optioSettings).toBe(true);
      expect("agents" in optioSettings).toBe(true);
      expect("defaultAgent" in optioSettings).toBe(true);
    });
  });

  describe("session_messages table", () => {
    it("has sessionId column", () => {
      expect("sessionId" in sessionMessages).toBe(true);
    });

    it("has role column", () => {
      expect("role" in sessionMessages).toBe(true);
    });

    it("has content column", () => {
      expect("content" in sessionMessages).toBe(true);
    });

    it("has timestamp column", () => {
      expect("timestamp" in sessionMessages).toBe(true);
    });

    it("has id column", () => {
      expect("id" in sessionMessages).toBe(true);
    });
  });
});
