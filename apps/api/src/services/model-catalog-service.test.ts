import { describe, it, expect, vi, beforeEach } from "vitest";
import * as modelCatalogService from "./model-catalog-service.js";
import * as userApiKeysService from "./user-api-keys-service.js";

vi.mock("./user-api-keys-service.js", () => ({
  hasUserApiKey: vi.fn(),
}));

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([]),
      }),
    }),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
  },
}));

import { db } from "../db/client.js";

const FREE_MODELS = [
  { id: "opencode/big-pickle", name: "Big Pickle", provider: "opencode-zen", isFree: true },
  { id: "opencode/gpt-5-nano", name: "GPT-5 Nano (Free)", provider: "opencode-zen", isFree: true },
  {
    id: "opencode/minimax-m2.5-free",
    name: "Minimax M2.5 Free",
    provider: "opencode-zen",
    isFree: true,
  },
  {
    id: "opencode/nemotron-3-super-free",
    name: "Nemotron 3 Super Free",
    provider: "opencode-zen",
    isFree: true,
  },
  {
    id: "opencode/qwen3.6-plus-free",
    name: "Qwen3.6 Plus Free",
    provider: "opencode-zen",
    isFree: true,
  },
];

describe("model-catalog-service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getAvailableModels", () => {
    it("returns free models when no userId", async () => {
      const result = await modelCatalogService.getAvailableModels(null);
      expect(result.length).toBe(FREE_MODELS.length);
      expect(result.every((m) => m.isFree)).toBe(true);
    });

    it("includes Anthropic models when user has Anthropic API key", async () => {
      vi.mocked(userApiKeysService.hasUserApiKey)
        .mockResolvedValueOnce(true) // anthropic
        .mockResolvedValueOnce(false); // openai

      const result = await modelCatalogService.getAvailableModels("user-1");
      const hasAnthropic = result.some((m) => m.provider === "anthropic" && !m.isFree);
      expect(hasAnthropic).toBe(true);
    });

    it("includes OpenAI models when user has OpenAI API key", async () => {
      vi.mocked(userApiKeysService.hasUserApiKey)
        .mockResolvedValueOnce(false) // anthropic
        .mockResolvedValueOnce(true); // openai

      const result = await modelCatalogService.getAvailableModels("user-1");
      const hasOpenAI = result.some((m) => m.provider === "openai" && !m.isFree);
      expect(hasOpenAI).toBe(true);
    });

    it("includes both when user has both API keys", async () => {
      vi.mocked(userApiKeysService.hasUserApiKey)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      const result = await modelCatalogService.getAvailableModels("user-1");
      const hasAnthropic = result.some((m) => m.provider === "anthropic" && !m.isFree);
      const hasOpenAI = result.some((m) => m.provider === "openai" && !m.isFree);
      expect(hasAnthropic).toBe(true);
      expect(hasOpenAI).toBe(true);
    });
  });

  describe("getEnabledModels", () => {
    it("returns enabled models array", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ enabledModels: ["model-1", "model-2"] }]),
          }),
        }),
      } as any);

      const result = await modelCatalogService.getEnabledModels("ws-1");
      expect(result).toEqual(["model-1", "model-2"]);
    });

    it("returns empty array when no settings", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const result = await modelCatalogService.getEnabledModels("ws-1");
      expect(result).toEqual([]);
    });
  });

  describe("setEnabledModels", () => {
    it("creates new row when none exists", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as any);

      const mockInsert = vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ enabledModels: ["new-model"] }]),
        }),
      } as any);

      const result = await modelCatalogService.setEnabledModels("ws-1", ["new-model"]);
      expect(result.enabledModels).toEqual(["new-model"]);
    });

    it("updates existing row", async () => {
      const mockSelect = vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "existing-id" }]),
          }),
        }),
      } as any);

      const mockUpdate = vi.mocked(db.update).mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ enabledModels: ["updated-model"] }]),
          }),
        }),
      } as any);

      const result = await modelCatalogService.setEnabledModels("ws-1", ["updated-model"]);
      expect(result.enabledModels).toEqual(["updated-model"]);
    });
  });
});
