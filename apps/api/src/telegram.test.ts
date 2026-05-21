import { describe, expect, it } from "vitest";
import { buildServer } from "./server";
import { createTelegramBotHandler, type TelegramOwnerServices } from "./telegram";

type TestTelegramOwnerServices = TelegramOwnerServices & {
  drafts: Array<{ telegramUserId: string; text: string }>;
  photos: Array<{ telegramUserId: string; fileId: string; bytes: Buffer }>;
};

const createTestOwnerServices = (): TestTelegramOwnerServices => {
  const drafts: Array<{ telegramUserId: string; text: string }> = [];
  const photos: Array<{ telegramUserId: string; fileId: string; bytes: Buffer }> = [];

  return {
    async createDraftFromTelegram(input) {
      drafts.push(input);
      return {
        id: `draft_${drafts.length}`,
        studioName: "Loft Karlin",
        city: "Prague",
        missingFields: ["price"]
      };
    },
    async attachTelegramPhoto(input) {
      photos.push(input);
      return {
        id: `media_${photos.length}`,
        fileName: `${input.fileId}.jpg`
      };
    },
    get drafts() {
      return drafts;
    },
    get photos() {
      return photos;
    }
  };
};

describe("telegram owner onboarding", () => {
  it("creates an owner draft from a telegram text message", async () => {
    const services = createTestOwnerServices();
    const bot = createTelegramBotHandler({ services });

    const result = await bot.handleUpdate({
      message: {
        message_id: 1,
        from: { id: 1001, first_name: "Anna", username: "anna_studio" },
        chat: { id: 1001, type: "private" },
        text: "Studio in Prague, daylight, paper backdrops, makeup table."
      }
    });

    expect(result.messages[0].text).toContain("I started your studio draft");
    expect(services.drafts[0]).toMatchObject({
      telegramUserId: "1001",
      text: "Studio in Prague, daylight, paper backdrops, makeup table."
    });
  });

  it("downloads telegram photos and attaches them to the owner draft", async () => {
    const services = createTestOwnerServices();
    const bot = createTelegramBotHandler({
      services,
      fetchFileBytes: async () => Buffer.from("photo")
    });

    const result = await bot.handleUpdate({
      message: {
        message_id: 2,
        from: { id: 1001 },
        chat: { id: 1001, type: "private" },
        photo: [{ file_id: "file_small", file_unique_id: "u1", width: 320, height: 240, file_size: 100 }]
      }
    });

    expect(result.messages[0].text).toContain("photo added");
    expect(services.photos[0]).toMatchObject({
      telegramUserId: "1001",
      fileId: "file_small",
      bytes: Buffer.from("photo")
    });
  });

  it("accepts telegram owner updates through the webhook endpoint", async () => {
    const server = buildServer({
      services: {
        telegramOwner: createTestOwnerServices()
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/telegram/webhook",
      payload: {
        message: {
          message_id: 3,
          from: { id: 2002, first_name: "Pavel" },
          chat: { id: 2002, type: "private" },
          text: "Small product studio in Prague with strobes."
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().messages[0].text).toContain("I started your studio draft");
  });
});
