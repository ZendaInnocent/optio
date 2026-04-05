import { eq, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { optioSettings } from "../db/schema.js";
import { userApiKeys } from "../db/schema.js";
import { hasUserApiKey } from "./user-api-keys-service.js";

/**
 * Model information from the catalog
 */
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  isFree: boolean;
  description?: string;
}

/**
 * Known OpenCode Zen free models (as per issue #19)
 * These are available without provider-specific API keys
 */
const FREE_OPencode_ZEN_MODELS: ModelInfo[] = [
  { id: "opencode/big-pickle", name: "Big Pickle", provider: "opencode-zen", isFree: true },
  { id: "opencode/gpt-5-nano", name: "GPT-5 Nano (Free)", provider: "opencode-zen", isFree: true },
  {
    id: "opencode/minimax-m2.5-free",
    name: "Minimax M2.5 (Free)",
    provider: "opencode-zen",
    isFree: true,
  },
  {
    id: "opencode/nemotron-3-super-free",
    name: "Nemotron 3 Super (Free)",
    provider: "opencode-zen",
    isFree: true,
  },
  {
    id: "opencode/qwen3.6-plus-free",
    name: "Qwen3.6 Plus (Free)",
    provider: "opencode-zen",
    isFree: true,
  },
];

/**
 * Known paid models by provider (partial list - can be expanded)
 */
const PAID_MODELS_BY_PROVIDER: Record<string, ModelInfo[]> = {
  anthropic: [
    {
      id: "anthropic/claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      provider: "anthropic",
      isFree: false,
    },
    {
      id: "anthropic/claude-opus-4-20250514",
      name: "Claude Opus 4",
      provider: "anthropic",
      isFree: false,
    },
    {
      id: "anthropic/claude-haiku-3-5-20241022",
      name: "Claude Haiku 3.5",
      provider: "anthropic",
      isFree: false,
    },
    {
      id: "anthropic/claude-3-5-sonnet-20241022",
      name: "Claude 3.5 Sonnet",
      provider: "anthropic",
      isFree: false,
    },
    {
      id: "anthropic/claude-3-5-haiku-20241022",
      name: "Claude 3.5 Haiku",
      provider: "anthropic",
      isFree: false,
    },
  ],
  openai: [
    { id: "openai/gpt-4.1", name: "GPT-4.1", provider: "openai", isFree: false },
    { id: "openai/gpt-4.1-mini", name: "GPT-4.1 Mini", provider: "openai", isFree: false },
    { id: "openai/gpt-4.1-nano", name: "GPT-4.1 Nano", provider: "openai", isFree: false },
    { id: "openai/o4-mini", name: "O4 Mini", provider: "openai", isFree: false },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "openai", isFree: false },
    { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", isFree: false },
  ],
};

/**
 * Map provider names to API key provider identifiers
 */
const PROVIDER_TO_API_KEY: Record<string, "anthropic" | "openai"> = {
  anthropic: "anthropic",
  openai: "openai",
};

/**
 * Get all available models for a user based on their API keys
 *
 * Logic:
 * - If user has API key for a provider, include all paid models from that provider
 * - Always include free OpenCode Zen models (they don't require provider API keys)
 * - The result is sorted: free models first, then paid by provider
 *
 * @param userId - The user ID to check API keys for (optional)
 * @returns Array of available ModelInfo
 */
export async function getAvailableModels(userId?: string | null): Promise<ModelInfo[]> {
  const availableModels: ModelInfo[] = [];

  // Always include free models (no API key required)
  availableModels.push(...FREE_OPencode_ZEN_MODELS);

  if (!userId) {
    return availableModels;
  }

  // Check which provider API keys the user has
  const hasAnthropicKey = await hasUserApiKey(userId, "anthropic");
  const hasOpenAIKey = await hasUserApiKey(userId, "openai");

  // Add paid models based on available API keys
  if (hasAnthropicKey) {
    availableModels.push(...PAID_MODELS_BY_PROVIDER.anthropic);
  }
  if (hasOpenAIKey) {
    availableModels.push(...PAID_MODELS_BY_PROVIDER.openai);
  }

  return availableModels;
}

/**
 * Get the user's currently enabled models from optio_settings
 *
 * @param workspaceId - Workspace ID to fetch settings for
 * @returns Array of enabled model IDs
 */
export async function getEnabledModels(workspaceId?: string | null): Promise<string[]> {
  const settings = await db
    .select({ enabledModels: optioSettings.enabledModels })
    .from(optioSettings)
    .where(
      workspaceId ? eq(optioSettings.workspaceId, workspaceId) : isNull(optioSettings.workspaceId),
    )
    .limit(1);

  const row = settings[0];
  return row?.enabledModels ?? [];
}

/**
 * Update the user's enabled models in optio_settings
 *
 * @param workspaceId - Workspace ID to update settings for
 * @param modelIds - Array of model IDs to enable
 * @returns Updated settings row
 */
export async function setEnabledModels(
  workspaceId?: string | null,
  modelIds: string[] = [],
): Promise<{ enabledModels: string[] }> {
  // Find existing row or use global default
  const existing = await db
    .select()
    .from(optioSettings)
    .where(
      workspaceId ? eq(optioSettings.workspaceId, workspaceId) : isNull(optioSettings.workspaceId),
    )
    .limit(1);

  if (existing.length > 0) {
    const existingRow = existing[0];
    const [row] = await db
      .update(optioSettings)
      .set({ enabledModels: modelIds, updatedAt: new Date() })
      .where(eq(optioSettings.id, existingRow.id))
      .returning({ enabledModels: optioSettings.enabledModels });
    return row;
  } else {
    // Create default row with enabledModels
    const [row] = await db
      .insert(optioSettings)
      .values({
        enabledModels: modelIds,
        workspaceId: workspaceId ?? undefined,
      })
      .returning({ enabledModels: optioSettings.enabledModels });
    return row;
  }
}
