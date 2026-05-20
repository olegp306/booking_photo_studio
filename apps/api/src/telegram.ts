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

export const isTelegramSecretValid = (configuredSecret: string | undefined, incomingSecret: string | undefined) =>
  !configuredSecret?.trim() || configuredSecret === incomingSecret;

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
        `Open owner dashboard: ${(config.publicAppUrl || "http://localhost:5173").replace(/\/$/, "")}/#profile`
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
