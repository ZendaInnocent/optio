import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "../db/client.js";
import { userApiKeys } from "../db/schema.js";
import * as userApiKeysService from "./user-api-keys-service.js";

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./secret-service.js", () => ({
  encrypt: vi.fn().mockReturnValue({
    encrypted: Buffer.from("encrypted"),
    iv: Buffer.from("iv"),
    authTag: Buffer.from("authTag"),
  }),
  decrypt: vi.fn().mockReturnValue("decrypted-api-key"),
}));

describe("user-api-keys-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("storeUserApiKey", () => {
    it("inserts new API key when none exists", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const mockInsert = vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockResolvedValue([{ id: "new-id" }]),
      } as any);

      await userApiKeysService.storeUserApiKey("user-1", "openai", "sk-test-key");

      expect(mockSelect).toHaveBeenCalled();
      expect(mockInsert).toHaveBeenCalledWith(userApiKeys);
    });

    it("updates existing API key when one exists", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "existing-id" }]),
        }),
      } as any);

      const mockUpdate = vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "updated-id" }]),
        }),
      } as any);

      await userApiKeysService.storeUserApiKey("user-1", "openai", "sk-new-key");

      expect(mockSelect).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith(userApiKeys);
    });
  });

  describe("retrieveUserApiKey", () => {
    it("throws when API key not found", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      await expect(userApiKeysService.retrieveUserApiKey("user-1", "anthropic")).rejects.toThrow(
        "User API key not found for provider: anthropic",
      );
    });

    it("returns decrypted API key when found", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            {
              encryptedValue: Buffer.from("encrypted"),
              iv: Buffer.from("iv"),
              authTag: Buffer.from("authTag"),
            },
          ]),
        }),
      } as any);

      const result = await userApiKeysService.retrieveUserApiKey("user-1", "openai");

      expect(result).toBe("decrypted-api-key");
    });
  });

  describe("listUserApiKeys", () => {
    it("returns masked API keys", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([
            { provider: "openai", updatedAt: new Date("2026-01-01") },
            { provider: "anthropic", updatedAt: new Date("2026-01-02") },
          ]),
        }),
      } as any);

      const result = await userApiKeysService.listUserApiKeys("user-1");

      expect(result).toEqual([
        { provider: "openai", hasKey: true, lastUpdatedAt: new Date("2026-01-01") },
        { provider: "anthropic", hasKey: true, lastUpdatedAt: new Date("2026-01-02") },
      ]);
    });

    it("returns empty array when no keys exist", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await userApiKeysService.listUserApiKeys("user-1");

      expect(result).toEqual([]);
    });
  });

  describe("deleteUserApiKey", () => {
    it("deletes the API key", async () => {
      const mockDelete = vi.mocked(db.delete).mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      } as any);

      await userApiKeysService.deleteUserApiKey("user-1", "openai");

      expect(mockDelete).toHaveBeenCalledWith(userApiKeys);
    });
  });

  describe("hasUserApiKey", () => {
    it("returns true when key exists", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: "existing-id" }]),
        }),
      } as any);

      const result = await userApiKeysService.hasUserApiKey("user-1", "openai");

      expect(result).toBe(true);
    });

    it("returns false when key does not exist", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([]),
        }),
      } as any);

      const result = await userApiKeysService.hasUserApiKey("user-1", "anthropic");

      expect(result).toBe(false);
    });
  });
});
