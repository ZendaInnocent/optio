import { eq, and, or, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { optioSettings } from "../db/schema.js";
import { AGENT_DEFINITIONS } from "@optio/shared";
import type {
  AgentType,
  OptioAgentConfig,
  OptioSettings,
  UpdateOptioSettingsInput,
} from "@optio/shared";

interface StoredAgentConfig {
  type: string;
  enabled: boolean;
}

const DEFAULT_AGENTS_STORAGE: StoredAgentConfig[] = [
  { type: "claude-code", enabled: false },
  { type: "codex", enabled: false },
  { type: "opencode", enabled: true },
];

function addRequiredSecrets(agents: StoredAgentConfig[]): OptioAgentConfig[] {
  return agents.map((agent) => ({
    type: agent.type as AgentType,
    enabled: agent.enabled,
    requiredSecrets: AGENT_DEFINITIONS[agent.type as AgentType]?.requiredSecrets ?? [],
  }));
}

/**
 * Get settings for a workspace. Returns the settings row or sensible defaults
 * if none exists yet.
 */
export async function getSettings(workspaceId?: string | null): Promise<OptioSettings> {
  const conditions = [];
  if (workspaceId) {
    conditions.push(
      or(eq(optioSettings.workspaceId, workspaceId), isNull(optioSettings.workspaceId))!,
    );
  }

  const rows = await (conditions.length > 0
    ? db
        .select()
        .from(optioSettings)
        .where(and(...conditions))
    : db.select().from(optioSettings));

  // Prefer workspace-specific row, fall back to global (null workspace) row
  const wsRow = rows.find((r) => r.workspaceId === workspaceId);
  const globalRow = rows.find((r) => r.workspaceId === null);
  const row = wsRow ?? globalRow;

  if (row) return mapRow(row);

  // Return defaults (no row in DB yet)
  return {
    id: "",
    model: "sonnet",
    systemPrompt: "",
    enabledTools: [],
    confirmWrites: true,
    maxTurns: 20,
    agents: addRequiredSecrets(DEFAULT_AGENTS_STORAGE),
    defaultAgent: "opencode" as AgentType,
    enabledModels: [],
    workspaceId: workspaceId ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Upsert settings for a workspace. Creates if doesn't exist, updates if it does.
 */
export async function upsertSettings(
  input: UpdateOptioSettingsInput,
  workspaceId?: string | null,
): Promise<OptioSettings> {
  // Check for existing row
  const conditions = workspaceId
    ? [eq(optioSettings.workspaceId, workspaceId)]
    : [isNull(optioSettings.workspaceId)];

  const [existing] = await db
    .select()
    .from(optioSettings)
    .where(and(...conditions));

  if (existing) {
    // Update existing row
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.model !== undefined) updates.model = input.model;
    if (input.systemPrompt !== undefined) updates.systemPrompt = input.systemPrompt;
    if (input.enabledTools !== undefined) updates.enabledTools = input.enabledTools;
    if (input.confirmWrites !== undefined) updates.confirmWrites = input.confirmWrites;
    if (input.maxTurns !== undefined) updates.maxTurns = input.maxTurns;
    if (input.agents !== undefined) updates.agents = input.agents;
    if (input.defaultAgent !== undefined) updates.defaultAgent = input.defaultAgent;
    if (input.enabledModels !== undefined) updates.enabledModels = input.enabledModels;

    const [row] = await db
      .update(optioSettings)
      .set(updates)
      .where(eq(optioSettings.id, existing.id))
      .returning();
    return mapRow(row);
  } else {
    // Create new row
    const [row] = await db
      .insert(optioSettings)
      .values({
        model: input.model ?? "sonnet",
        systemPrompt: input.systemPrompt ?? "",
        enabledTools: input.enabledTools ?? [],
        confirmWrites: input.confirmWrites ?? true,
        maxTurns: input.maxTurns ?? 20,
        agents: input.agents ?? DEFAULT_AGENTS_STORAGE,
        defaultAgent: input.defaultAgent ?? "opencode",
        enabledModels: input.enabledModels ?? [],
        workspaceId: workspaceId ?? undefined,
      })
      .returning();
    return mapRow(row);
  }
}

function mapRow(row: typeof optioSettings.$inferSelect): OptioSettings {
  const storedAgents = row.agents ?? DEFAULT_AGENTS_STORAGE;
  return {
    id: row.id,
    model: row.model,
    systemPrompt: row.systemPrompt,
    enabledTools: row.enabledTools,
    confirmWrites: row.confirmWrites,
    maxTurns: row.maxTurns,
    agents: addRequiredSecrets(storedAgents),
    defaultAgent: (row.defaultAgent ?? "opencode") as AgentType,
    enabledModels: row.enabledModels ?? [],
    workspaceId: row.workspaceId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
