import type { OwnerOnboardingDraft as PublicOwnerDraft, OwnerMedia as PublicOwnerMedia, PublishedStudioListing } from "@studio-market/shared";
import { createOwnerSessionToken, parseOwnerSessionToken } from "./auth";
import type { OwnerOnboardingDraft, OwnerRepository } from "./ownerRepository";

export interface AiOwnerDraft {
  studioName?: string;
  city?: string;
  description?: string;
  suggestedAmenities?: string[];
  suggestedRules?: string[];
  suggestedRooms?: PublicOwnerDraft["suggestedRooms"];
}

export interface OwnerOnboardingDeps {
  repository: OwnerRepository;
  ai: {
    createListingDraft(text: string): Promise<AiOwnerDraft>;
  };
}

export interface CreateDraftFromTextInput {
  source: "web" | "telegram";
  text: string;
}

export interface AppendTextInput {
  draftId: string;
  text: string;
}

export interface AttachMediaInput {
  draftId: string;
}

export interface RegenerateDraftInput {
  draftId: string;
}

export interface PublishDraftInput {
  draftId: string;
  ownerSessionToken: string;
}

export interface OwnerOnboardingService {
  createDraftFromText(input: CreateDraftFromTextInput): Promise<PublicOwnerDraft>;
  appendText(input: AppendTextInput): Promise<PublicOwnerDraft>;
  attachMedia(input: AttachMediaInput): Promise<PublicOwnerDraft>;
  regenerateDraft(input: RegenerateDraftInput): Promise<PublicOwnerDraft>;
  publishDraft(input: PublishDraftInput): Promise<PublishedStudioListing>;
}

const hasPrice = (text: string) => /(\d[\d\s.,]*)\s*(czk|kč|eur|€)/i.test(text);

const missingFieldsFor = (aiDraft: AiOwnerDraft, rawText: string) => [
  !aiDraft.studioName && "studioName",
  !aiDraft.city && "city",
  !aiDraft.description && "description",
  !hasPrice(rawText) && "price"
].filter(Boolean) as string[];

const emptyAiDraft = (rawText: string): AiOwnerDraft => ({
  description: rawText,
  suggestedAmenities: [],
  suggestedRules: [],
  suggestedRooms: []
});

const inferStudioName = (draft: PublicOwnerDraft) =>
  draft.studioName?.trim() ||
  draft.rawText.split(/[\n,.]/).map((part) => part.trim()).filter(Boolean)[0]?.slice(0, 80) ||
  "Untitled studio";

const inferCity = (draft: PublicOwnerDraft) => {
  const haystack = [draft.city, draft.rawText].filter(Boolean).join(" ").toLowerCase();
  if (haystack.includes("prague") || haystack.includes("praha")) return "Prague";
  return draft.city?.trim() || "Unknown city";
};

const publishedStudioSlug = (draft: PublicOwnerDraft) => {
  const base = inferStudioName(draft)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 56);
  const suffix = draft.id.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return [base || "owner-studio", suffix].filter(Boolean).join("-");
};

const toPublicMedia = (media: Awaited<ReturnType<OwnerRepository["getDraftMedia"]>>): PublicOwnerMedia[] =>
  media.map((item) => ({
    id: item.id,
    fileName: item.fileName,
    mimeType: item.mimeType,
    publicUrl: item.publicUrl,
    kind: item.kind,
    sortOrder: item.sortOrder
  }));

export function createOwnerOnboardingService(deps: OwnerOnboardingDeps): OwnerOnboardingService {
  const buildPublicDraft = async (draft: OwnerOnboardingDraft, ownerSessionToken?: string): Promise<PublicOwnerDraft> => {
    const aiDraft = (draft.aiDraftJson ?? emptyAiDraft(draft.rawText)) as AiOwnerDraft;
    return {
      id: draft.id,
      source: draft.source,
      status: draft.status,
      ownerSessionToken,
      rawText: draft.rawText,
      studioName: aiDraft.studioName,
      city: aiDraft.city,
      description: aiDraft.description,
      suggestedAmenities: aiDraft.suggestedAmenities ?? [],
      suggestedRules: aiDraft.suggestedRules ?? [],
      suggestedRooms: aiDraft.suggestedRooms ?? [],
      media: toPublicMedia(await deps.repository.getDraftMedia(draft.id)),
      missingFields: missingFieldsFor(aiDraft, draft.rawText)
    };
  };

  const createAiDraft = async (text: string) => {
    try {
      return await deps.ai.createListingDraft(text);
    } catch {
      return emptyAiDraft(text);
    }
  };

  return {
    async createDraftFromText(input) {
      const owner = await deps.repository.createAnonymousOwner();
      const draft = await deps.repository.createDraft({
        ownerProfileId: owner.ownerProfile.id,
        source: input.source,
        rawText: input.text.trim()
      });
      const aiDraft = await createAiDraft(draft.rawText);
      const saved = await deps.repository.saveAiDraft({
        draftId: draft.id,
        aiDraftJson: aiDraft,
        status: "draft_ready"
      });
      return buildPublicDraft(
        saved,
        createOwnerSessionToken({ userId: owner.user.id, email: owner.user.email })
      );
    },

    async appendText(input) {
      const draft = await deps.repository.appendDraftText(input);
      const aiDraft = await createAiDraft(draft.rawText);
      const saved = await deps.repository.saveAiDraft({
        draftId: draft.id,
        aiDraftJson: aiDraft,
        status: "draft_ready"
      });
      return buildPublicDraft(saved);
    },

    async attachMedia(input) {
      const draft = await deps.repository.getDraft(input.draftId);
      if (!draft) throw new Error(`Owner draft ${input.draftId} was not found.`);
      return buildPublicDraft(draft);
    },

    async regenerateDraft(input) {
      const draft = await deps.repository.getDraft(input.draftId);
      if (!draft) throw new Error(`Owner draft ${input.draftId} was not found.`);
      const aiDraft = await createAiDraft(draft.rawText);
      const saved = await deps.repository.saveAiDraft({
        draftId: draft.id,
        aiDraftJson: aiDraft,
        status: "draft_ready"
      });
      return buildPublicDraft(saved);
    },

    async publishDraft(input) {
      const parsed = parseOwnerSessionToken(input.ownerSessionToken);
      if (!parsed) throw new Error("Owner session token is invalid.");
      const session = await deps.repository.getOwnerSession(parsed.userId);
      if (!session?.user.emailVerified) throw new Error("Verified email is required before publishing.");
      const draft = await deps.repository.getDraft(input.draftId);
      if (!draft) throw new Error(`Owner draft ${input.draftId} was not found.`);
      const saved = await deps.repository.saveAiDraft({
        draftId: draft.id,
        aiDraftJson: draft.aiDraftJson ?? emptyAiDraft(draft.rawText),
        status: "published"
      });
      const publicDraft = await buildPublicDraft(saved);
      const studioSlug = publishedStudioSlug(publicDraft);

      return {
        id: studioSlug,
        draftId: saved.id,
        studioName: inferStudioName(publicDraft),
        city: inferCity(publicDraft),
        status: "published",
        publicUrl: `#studio/${studioSlug}`
      };
    }
  };
}

export const ownerDraftPublishing = {
  inferStudioName,
  inferCity,
  publishedStudioSlug
};
