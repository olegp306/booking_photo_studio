import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TelegramDraftRecord } from "./telegram";

interface ListingDraftStore {
  add: (draft: Omit<TelegramDraftRecord, "id">) => Promise<TelegramDraftRecord>;
  list: () => Promise<TelegramDraftRecord[]>;
}

const fileName = "telegram-listing-drafts.json";

const readDraftsFile = async (path: string): Promise<TelegramDraftRecord[]> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as TelegramDraftRecord[];
  } catch {
    return [];
  }
};

export const createListingDraftStore = (localDataDir?: string): ListingDraftStore => {
  if (!localDataDir?.trim()) {
    const drafts: TelegramDraftRecord[] = [];

    return {
      add: async (draft) => {
        const record = {
          id: `telegram-draft-${drafts.length + 1}`,
          ...draft
        };
        drafts.unshift(record);
        return record;
      },
      list: async () => drafts
    };
  }

  const filePath = join(localDataDir, fileName);

  return {
    add: async (draft) => {
      const drafts = await readDraftsFile(filePath);
      const record = {
        id: `telegram-draft-${drafts.length + 1}`,
        ...draft
      };
      const updatedDrafts = [record, ...drafts];

      await mkdir(localDataDir, { recursive: true });
      await writeFile(filePath, JSON.stringify(updatedDrafts, null, 2), "utf8");

      return record;
    },
    list: async () => readDraftsFile(filePath)
  };
};
