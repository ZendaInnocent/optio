import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as optioSettingsService from "../services/optio-settings-service.js";
import * as userApiKeysService from "../services/user-api-keys-service.js";
import { getAvailableModels } from "../services/model-catalog-service.js";

const agentConfigInputSchema = z.object({
  type: z.enum(["claude-code", "codex", "opencode"]),
  enabled: z.boolean(),
});

const updateSettingsSchema = z.object({
  model: z.enum(["opus", "sonnet", "haiku"]).optional(),
  systemPrompt: z.string().optional(),
  enabledTools: z.array(z.string()).min(1, "At least one tool must be enabled").optional(),
  confirmWrites: z.boolean().optional(),
  maxTurns: z.number().int().min(5).max(50).optional(),
  agents: z.array(agentConfigInputSchema).optional(),
  defaultAgent: z.enum(["claude-code", "codex", "opencode"]).optional(),
});

const apiKeyInputSchema = z.object({
  provider: z.enum(["openai", "anthropic"]),
  apiKey: z.string().min(1, "API key is required"),
});

export async function optioSettingsRoutes(app: FastifyInstance) {
  // Get current settings
  app.get("/api/optio/settings", async (req, reply) => {
    const workspaceId = req.user?.workspaceId ?? null;
    const userId = req.user?.id;
    const settings = await optioSettingsService.getSettings(workspaceId);

    let userApiKeys: Array<{ provider: string; hasKey: boolean; lastUpdatedAt: Date }> = [];
    if (userId) {
      userApiKeys = await userApiKeysService.listUserApiKeys(userId);
    }

    reply.send({ settings, userApiKeys });
  });

  // Update settings (upsert)
  app.put("/api/optio/settings", async (req, reply) => {
    const input = updateSettingsSchema.parse(req.body);
    const workspaceId = req.user?.workspaceId ?? null;
    const settings = await optioSettingsService.upsertSettings(input, workspaceId);
    reply.send({ settings });
  });

  // Get user's API keys (masked)
  app.get("/api/optio/settings/api-keys", async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    const apiKeys = await userApiKeysService.listUserApiKeys(userId);
    reply.send({ userApiKeys: apiKeys });
  });

  // Save user's API key
  app.put("/api/optio/settings/api-keys", async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    const input = apiKeyInputSchema.parse(req.body);
    await userApiKeysService.storeUserApiKey(userId, input.provider, input.apiKey);
    reply.send({ success: true });
  });

  // Delete user's API key
  app.delete("/api/optio/settings/api-keys", async (req, reply) => {
    const userId = req.user?.id;
    if (!userId) {
      return reply.status(401).send({ error: "Authentication required" });
    }
    const input = apiKeyInputSchema.parse(req.body);
    await userApiKeysService.deleteUserApiKey(userId, input.provider);
    reply.send({ success: true });
  });

  // Get available OpenCode Zen models
  app.get("/api/optio/settings/models", async (req, reply) => {
    const workspaceId = req.user?.workspaceId ?? null;
    const userId = req.user?.id;

    // Fetch available models based on user's API keys
    const available = await getAvailableModels(userId);

    // Fetch user's currently enabled models
    const enabled = await optioSettingsService.getSettings(workspaceId);

    // Map to the response format expected by UI
    const models = available.map((m) => ({
      id: m.id,
      name: m.name,
      provider: m.provider,
      isFree: m.isFree,
      description: m.description,
      enabled: enabled.enabledModels.includes(m.id),
    }));

    reply.send({ models });
  });
}
