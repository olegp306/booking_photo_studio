export type OwnerDraftSource = "web" | "telegram";
export type OwnerDraftStatus = "collecting" | "draft_ready" | "email_pending" | "published";

export interface OwnerUser {
  id: string;
  email?: string;
  emailVerified?: string;
  displayName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerProfile {
  id: string;
  userId: string;
  status: "draft" | "published";
  studioName?: string;
  city?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramOwnerInput {
  telegramUserId: string;
  username?: string;
  firstName?: string;
}

export interface OwnerSession {
  user: OwnerUser;
  ownerProfile: OwnerProfile;
  telegram?: TelegramOwnerInput;
}

export interface OwnerOnboardingDraft {
  id: string;
  ownerProfileId: string;
  source: OwnerDraftSource;
  status: OwnerDraftStatus;
  rawText: string;
  aiDraftJson?: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface OwnerMedia {
  id: string;
  ownerProfileId: string;
  draftId?: string;
  kind: "interior" | "equipment" | "sample" | "document";
  fileName: string;
  mimeType: string;
  storageKey: string;
  publicUrl: string;
  sortOrder: number;
  aiTagsJson?: unknown;
  createdAt: string;
}

export interface CreateOwnerDraftInput {
  ownerProfileId: string;
  source: OwnerDraftSource;
  rawText: string;
}

export interface AppendDraftTextInput {
  draftId: string;
  text: string;
}

export interface AttachOwnerMediaInput {
  ownerProfileId: string;
  draftId?: string;
  kind: OwnerMedia["kind"];
  fileName: string;
  mimeType: string;
  storageKey: string;
  publicUrl: string;
  sortOrder?: number;
  aiTagsJson?: unknown;
}

export interface SaveAiDraftInput {
  draftId: string;
  aiDraftJson: unknown;
  status?: OwnerDraftStatus;
}

export interface MarkEmailVerifiedInput {
  userId: string;
  email: string;
  verifiedAt?: Date;
}

export interface OwnerRepository {
  createAnonymousOwner(): Promise<OwnerSession>;
  findOrCreateOwnerByTelegram(input: TelegramOwnerInput): Promise<OwnerSession>;
  findOrCreateOwnerByEmail(email: string): Promise<OwnerSession>;
  getOwnerSession(userId: string): Promise<OwnerSession | null>;
  getDraft(draftId: string): Promise<OwnerOnboardingDraft | null>;
  getDraftMedia(draftId: string): Promise<OwnerMedia[]>;
  createDraft(input: CreateOwnerDraftInput): Promise<OwnerOnboardingDraft>;
  appendDraftText(input: AppendDraftTextInput): Promise<OwnerOnboardingDraft>;
  attachMedia(input: AttachOwnerMediaInput): Promise<OwnerMedia>;
  saveAiDraft(input: SaveAiDraftInput): Promise<OwnerOnboardingDraft>;
  markEmailVerified(input: MarkEmailVerifiedInput): Promise<OwnerSession>;
}

const now = () => new Date().toISOString();

export const createInMemoryOwnerRepository = (): OwnerRepository => {
  const sessions = new Map<string, OwnerSession>();
  const telegramUserToUser = new Map<string, string>();
  const emailToUser = new Map<string, string>();
  const drafts = new Map<string, OwnerOnboardingDraft>();
  const media = new Map<string, OwnerMedia>();
  let userCount = 0;
  let ownerCount = 0;
  let draftCount = 0;
  let mediaCount = 0;

  const createSession = (input: { email?: string; telegram?: TelegramOwnerInput }): OwnerSession => {
    const timestamp = now();
    const user: OwnerUser = {
      id: `user_${++userCount}`,
      email: input.email,
      displayName: input.telegram?.firstName,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const ownerProfile: OwnerProfile = {
      id: `owner_${++ownerCount}`,
      userId: user.id,
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const session = { user, ownerProfile, telegram: input.telegram };
    sessions.set(user.id, session);
    if (input.email) emailToUser.set(input.email, user.id);
    if (input.telegram) telegramUserToUser.set(input.telegram.telegramUserId, user.id);
    return session;
  };

  const getDraft = (draftId: string) => {
    const draft = drafts.get(draftId);
    if (!draft) throw new Error(`Owner draft ${draftId} was not found.`);
    return draft;
  };

  return {
    async createAnonymousOwner() {
      return createSession({});
    },

    async findOrCreateOwnerByTelegram(input) {
      const existingUserId = telegramUserToUser.get(input.telegramUserId);
      if (existingUserId) {
        const session = sessions.get(existingUserId);
        if (session) return session;
      }
      return createSession({ telegram: input });
    },

    async findOrCreateOwnerByEmail(email) {
      const normalizedEmail = email.trim().toLowerCase();
      const existingUserId = emailToUser.get(normalizedEmail);
      if (existingUserId) {
        const session = sessions.get(existingUserId);
        if (session) return session;
      }
      return createSession({ email: normalizedEmail });
    },

    async getOwnerSession(userId) {
      return sessions.get(userId) ?? null;
    },

    async getDraft(draftId) {
      return drafts.get(draftId) ?? null;
    },

    async getDraftMedia(draftId) {
      return Array.from(media.values())
        .filter((item) => item.draftId === draftId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
    },

    async createDraft(input) {
      const timestamp = now();
      const draft: OwnerOnboardingDraft = {
        id: `draft_${++draftCount}`,
        ownerProfileId: input.ownerProfileId,
        source: input.source,
        status: "collecting",
        rawText: input.rawText,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      drafts.set(draft.id, draft);
      return draft;
    },

    async appendDraftText(input) {
      const draft = getDraft(input.draftId);
      const updated = {
        ...draft,
        rawText: [draft.rawText, input.text.trim()].filter(Boolean).join("\n"),
        updatedAt: now()
      };
      drafts.set(updated.id, updated);
      return updated;
    },

    async attachMedia(input) {
      const ownerMedia: OwnerMedia = {
        id: `media_${++mediaCount}`,
        ownerProfileId: input.ownerProfileId,
        draftId: input.draftId,
        kind: input.kind,
        fileName: input.fileName,
        mimeType: input.mimeType,
        storageKey: input.storageKey,
        publicUrl: input.publicUrl,
        sortOrder: input.sortOrder ?? mediaCount,
        aiTagsJson: input.aiTagsJson,
        createdAt: now()
      };
      media.set(ownerMedia.id, ownerMedia);
      return ownerMedia;
    },

    async saveAiDraft(input) {
      const draft = getDraft(input.draftId);
      const updated = {
        ...draft,
        status: input.status ?? "draft_ready",
        aiDraftJson: input.aiDraftJson,
        updatedAt: now()
      };
      drafts.set(updated.id, updated);
      return updated;
    },

    async markEmailVerified(input) {
      const session = sessions.get(input.userId);
      if (!session) throw new Error(`Owner session ${input.userId} was not found.`);
      const email = input.email.trim().toLowerCase();
      const updated: OwnerSession = {
        ...session,
        user: {
          ...session.user,
          email,
          emailVerified: (input.verifiedAt ?? new Date()).toISOString(),
          updatedAt: now()
        }
      };
      sessions.set(updated.user.id, updated);
      emailToUser.set(email, updated.user.id);
      return updated;
    }
  };
};
