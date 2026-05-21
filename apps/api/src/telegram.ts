import type { ListingDraft } from "@studio-market/shared";
import type { RuntimeConfig } from "./env";
import type { DraftMode, FetchLike } from "./aiListing";

export interface TelegramDraftRecord {
  id: string;
  source: "telegram";
  chatId?: number | string;
  transcript: string;
  mode: DraftMode;
  draft: ListingDraft;
  createdAt: string;
}

export interface TelegramWebhookSetupResult {
  ok: true;
  webhookUrl: string;
  telegram: unknown;
}

export interface TelegramOwnerDraftSummary {
  id: string;
  studioName?: string;
  city?: string;
  missingFields: string[];
}

export interface TelegramOwnerMediaSummary {
  id: string;
  fileName: string;
}

export interface TelegramOwnerServices {
  createDraftFromTelegram(input: {
    telegramUserId: string;
    username?: string;
    firstName?: string;
    text: string;
  }): Promise<TelegramOwnerDraftSummary>;
  attachTelegramPhoto(input: {
    telegramUserId: string;
    fileId: string;
    bytes: Buffer;
    mimeType: string;
  }): Promise<TelegramOwnerMediaSummary>;
}

export interface TelegramBotHandlerResult {
  ok: true;
  messages: Array<{
    chatId?: number | string;
    text: string;
  }>;
}

export interface TelegramBotHandler {
  handleUpdate(update: unknown): Promise<TelegramBotHandlerResult>;
}

export interface TelegramBotDeps {
  services: TelegramOwnerServices;
  fetchFileBytes?: (fileId: string) => Promise<Buffer>;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export const extractTelegramText = (body: unknown) => {
  if (!body || typeof body !== "object") return "";
  const payload = body as {
    message?: {
      text?: string;
      caption?: string;
    };
  };

  return payload.message?.text ?? payload.message?.caption ?? "";
};

export const extractTelegramChatId = (body: unknown) => {
  if (!body || typeof body !== "object") return undefined;
  const payload = body as {
    message?: {
      chat?: {
        id?: number | string;
      };
    };
  };

  return payload.message?.chat?.id;
};

const extractTelegramFrom = (body: unknown) => {
  if (!body || typeof body !== "object") return undefined;
  const payload = body as {
    message?: {
      from?: {
        id?: number | string;
        username?: string;
        first_name?: string;
      };
    };
  };

  return payload.message?.from;
};

const extractLargestTelegramPhoto = (body: unknown) => {
  if (!body || typeof body !== "object") return undefined;
  const payload = body as {
    message?: {
      photo?: Array<{
        file_id: string;
        file_unique_id?: string;
        width?: number;
        height?: number;
        file_size?: number;
      }>;
    };
  };
  const photos = payload.message?.photo ?? [];

  return [...photos].sort((left, right) => (right.file_size ?? 0) - (left.file_size ?? 0))[0];
};

export const isTelegramSecretValid = (configuredSecret: string | undefined, incomingSecret: string | undefined) =>
  !configuredSecret?.trim() || configuredSecret === incomingSecret;

export const createTelegramBotHandler = (deps: TelegramBotDeps): TelegramBotHandler => ({
  async handleUpdate(update) {
    const chatId = extractTelegramChatId(update);
    const from = extractTelegramFrom(update);
    const telegramUserId = String(from?.id ?? chatId ?? "unknown");
    const text = extractTelegramText(update).trim();
    const photo = extractLargestTelegramPhoto(update);

    if (text === "/start") {
      return {
        ok: true,
        messages: [{
          chatId,
          text: "Send studio notes or photos, and I will help create your studio draft."
        }]
      };
    }

    if (text === "/draft") {
      return {
        ok: true,
        messages: [{ chatId, text: "Send a studio description and I will turn it into a draft." }]
      };
    }

    if (text === "/email") {
      return {
        ok: true,
        messages: [{ chatId, text: "Open the web draft and add email backup access with a 6-digit code." }]
      };
    }

    if (text === "/publish") {
      return {
        ok: true,
        messages: [{ chatId, text: "Publishing requires a verified email from the web draft." }]
      };
    }

    if (photo) {
      const bytes = deps.fetchFileBytes
        ? await deps.fetchFileBytes(photo.file_id)
        : Buffer.alloc(0);
      await deps.services.attachTelegramPhoto({
        telegramUserId,
        fileId: photo.file_id,
        bytes,
        mimeType: "image/jpeg"
      });

      return {
        ok: true,
        messages: [{ chatId, text: "Studio photo added to your draft. Send more photos or describe the space." }]
      };
    }

    if (text) {
      const draft = await deps.services.createDraftFromTelegram({
        telegramUserId,
        username: from?.username,
        firstName: from?.first_name,
        text
      });

      return {
        ok: true,
        messages: [{
          chatId,
          text: [
            `I started your studio draft${draft.studioName ? ` for ${draft.studioName}` : ""}.`,
            draft.city ? `City: ${draft.city}.` : undefined,
            draft.missingFields.length ? `Still needed: ${draft.missingFields.join(", ")}.` : undefined,
            "Add email backup access from the web draft so you do not lose it."
          ].filter(Boolean).join(" ")
        }]
      };
    }

    return {
      ok: true,
      messages: [{ chatId, text: "Send studio notes or a studio photo to start." }]
    };
  }
});

export const sendTelegramListingDraftReply = async (
  chatId: number | string | undefined,
  record: TelegramDraftRecord,
  config: RuntimeConfig,
  fetchImpl: FetchLike = fetch
) => {
  if (!chatId || !config.telegramBotToken?.trim()) return false;

  const response = await fetchImpl(`https://api.telegram.org/bot${config.telegramBotToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chat_id: chatId,
      text: [
        "Listing draft ready.",
        `Draft: ${record.draft.tagline}`,
        `Open Telegram draft inbox: ${(config.publicAppUrl || "http://localhost:5173").replace(/\/$/, "")}/#telegram-drafts`
      ].join("\n")
    })
  });

  return response.ok;
};

export const registerTelegramListingDraftWebhook = async (
  config: RuntimeConfig,
  fetchImpl: FetchLike = fetch
): Promise<TelegramWebhookSetupResult> => {
  const publicAppUrl = config.publicAppUrl?.trim().replace(/\/$/, "");
  const webhookUrl = `${publicAppUrl}/api/integrations/telegram/listing-draft`;
  const body: {
    url: string;
    secret_token?: string;
    allowed_updates: string[];
  } = {
    url: webhookUrl,
    allowed_updates: ["message"]
  };

  if (config.telegramWebhookSecret?.trim()) {
    body.secret_token = config.telegramWebhookSecret.trim();
  }

  const response = await fetchImpl(`https://api.telegram.org/bot${config.telegramBotToken}/setWebhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const telegram = (await response.json()) as unknown;

  if (!response.ok || (isObject(telegram) && telegram.ok === false)) {
    throw new Error("Telegram rejected webhook setup");
  }

  return {
    ok: true,
    webhookUrl,
    telegram
  };
};
