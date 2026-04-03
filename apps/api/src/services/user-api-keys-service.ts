import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { userApiKeys } from "../db/schema.js";
import { encrypt, decrypt } from "./secret-service.js";

export type ApiProvider = "openai" | "anthropic";

export interface UserApiKeyRecord {
  id: string;
  userId: string;
  provider: ApiProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserApiKeyWithValue extends UserApiKeyRecord {
  apiKey: string;
}

export interface MaskedUserApiKey {
  provider: ApiProvider;
  hasKey: boolean;
  lastUpdatedAt: Date;
}

export async function storeUserApiKey(
  userId: string,
  provider: ApiProvider,
  apiKey: string,
): Promise<void> {
  const { encrypted, iv, authTag } = encrypt(apiKey);

  const existing = await db
    .select({ id: userApiKeys.id })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));

  if (existing.length > 0) {
    await db
      .update(userApiKeys)
      .set({ encryptedValue: encrypted, iv, authTag, updatedAt: new Date() })
      .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
  } else {
    await db.insert(userApiKeys).values({
      userId,
      provider,
      encryptedValue: encrypted,
      iv,
      authTag,
    });
  }
}

export async function retrieveUserApiKey(userId: string, provider: ApiProvider): Promise<string> {
  const [row] = await db
    .select()
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));

  if (!row) {
    throw new Error(`User API key not found for provider: ${provider}`);
  }

  return decrypt(row.encryptedValue, row.iv, row.authTag);
}

export async function listUserApiKeys(userId: string): Promise<MaskedUserApiKey[]> {
  const rows = await db
    .select({
      provider: userApiKeys.provider,
      updatedAt: userApiKeys.updatedAt,
    })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId));

  return rows.map((row) => ({
    provider: row.provider as ApiProvider,
    hasKey: true,
    lastUpdatedAt: row.updatedAt,
  }));
}

export async function deleteUserApiKey(userId: string, provider: ApiProvider): Promise<void> {
  await db
    .delete(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));
}

export async function hasUserApiKey(userId: string, provider: ApiProvider): Promise<boolean> {
  const [row] = await db
    .select({ id: userApiKeys.id })
    .from(userApiKeys)
    .where(and(eq(userApiKeys.userId, userId), eq(userApiKeys.provider, provider)));

  return !!row;
}
