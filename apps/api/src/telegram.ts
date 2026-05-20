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
