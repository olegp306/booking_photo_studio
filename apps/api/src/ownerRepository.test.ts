import { describe, expect, it } from "vitest";
import { createInMemoryOwnerRepository, createPrismaOwnerRepository } from "./ownerRepository";

const createFakePrismaDatabase = () => {
  const users = new Map<string, any>();
  const ownerProfiles = new Map<string, any>();
  const telegramIdentities = new Map<string, any>();
  const drafts = new Map<string, any>();
  const media = new Map<string, any>();
  let userCount = 0;
  let ownerCount = 0;
  let telegramCount = 0;
  let draftCount = 0;
  let mediaCount = 0;
  const now = () => new Date("2026-05-21T10:00:00.000Z");
  const enrichUser = (user: any) => {
    if (!user) return null;
    return {
      ...user,
      ownerProfile: Array.from(ownerProfiles.values()).find((profile) => profile.userId === user.id) ?? null,
      telegramLinks: Array.from(telegramIdentities.values()).filter((identity) => identity.userId === user.id)
    };
  };

  return {
    user: {
      async create({ data }: any) {
        const user = {
          id: `db_user_${++userCount}`,
          email: data.email ?? null,
          emailVerified: data.emailVerified ?? null,
          displayName: data.displayName ?? null,
          createdAt: now(),
          updatedAt: now()
        };
        users.set(user.id, user);
        if (data.ownerProfile?.create) {
          ownerProfiles.set(`db_owner_${++ownerCount}`, {
            id: `db_owner_${ownerCount}`,
            userId: user.id,
            status: data.ownerProfile.create.status ?? "draft",
            studioName: data.ownerProfile.create.studioName ?? null,
            city: data.ownerProfile.create.city ?? null,
            createdAt: now(),
            updatedAt: now()
          });
        }
        if (data.telegramLinks?.create) {
          const identity = {
            id: `db_telegram_${++telegramCount}`,
            userId: user.id,
            telegramUserId: data.telegramLinks.create.telegramUserId,
            username: data.telegramLinks.create.username ?? null,
            firstName: data.telegramLinks.create.firstName ?? null,
            createdAt: now()
          };
          telegramIdentities.set(identity.telegramUserId, identity);
        }
        return enrichUser(user);
      },
      async findUnique({ where }: any) {
        const user = where.id
          ? users.get(where.id)
          : Array.from(users.values()).find((item) => item.email === where.email);
        return enrichUser(user);
      },
      async update({ where, data }: any) {
        const user = users.get(where.id);
        const updated = {
          ...user,
          ...data,
          updatedAt: now()
        };
        users.set(updated.id, updated);
        return enrichUser(updated);
      }
    },
    ownerProfile: {
      async create({ data }: any) {
        const profile = {
          id: `db_owner_${++ownerCount}`,
          userId: data.userId,
          status: data.status ?? "draft",
          studioName: data.studioName ?? null,
          city: data.city ?? null,
          createdAt: now(),
          updatedAt: now()
        };
        ownerProfiles.set(profile.id, profile);
        return profile;
      }
    },
    telegramIdentity: {
      async findUnique({ where }: any) {
        const identity = telegramIdentities.get(where.telegramUserId);
        return identity
          ? { ...identity, user: enrichUser(users.get(identity.userId)) }
          : null;
      }
    },
    ownerOnboardingDraft: {
      async create({ data }: any) {
        const draft = {
          id: `db_draft_${++draftCount}`,
          ownerProfileId: data.ownerProfileId,
          source: data.source,
          status: data.status ?? "collecting",
          rawText: data.rawText ?? "",
          aiDraftJson: data.aiDraftJson ?? null,
          createdAt: now(),
          updatedAt: now()
        };
        drafts.set(draft.id, draft);
        return draft;
      },
      async findUnique({ where }: any) {
        return drafts.get(where.id) ?? null;
      },
      async update({ where, data }: any) {
        const draft = drafts.get(where.id);
        const updated = {
          ...draft,
          ...data,
          updatedAt: now()
        };
        drafts.set(updated.id, updated);
        return updated;
      }
    },
    ownerMedia: {
      async create({ data }: any) {
        const item = {
          id: `db_media_${++mediaCount}`,
          ownerProfileId: data.ownerProfileId,
          draftId: data.draftId ?? null,
          kind: data.kind,
          fileName: data.fileName,
          mimeType: data.mimeType,
          storageKey: data.storageKey,
          publicUrl: data.publicUrl,
          sortOrder: data.sortOrder ?? mediaCount,
          aiTagsJson: data.aiTagsJson ?? null,
          createdAt: now()
        };
        media.set(item.id, item);
        return item;
      },
      async findMany({ where }: any) {
        return Array.from(media.values())
          .filter((item) => item.draftId === where.draftId)
          .sort((left, right) => left.sortOrder - right.sortOrder);
      },
      async count({ where }: any) {
        return Array.from(media.values()).filter((item) => item.draftId === where.draftId).length;
      }
    }
  };
};

describe("owner repository", () => {
  it("keeps owner sessions, drafts, and media together in memory", async () => {
    const repository = createInMemoryOwnerRepository();
    const session = await repository.findOrCreateOwnerByTelegram({
      telegramUserId: "1001",
      username: "anna_studio",
      firstName: "Anna"
    });

    const sameSession = await repository.findOrCreateOwnerByTelegram({
      telegramUserId: "1001",
      username: "anna_studio"
    });
    const draft = await repository.createDraft({
      ownerProfileId: session.ownerProfile.id,
      source: "telegram",
      rawText: "Prague daylight loft with cyclorama."
    });
    const updatedDraft = await repository.appendDraftText({
      draftId: draft.id,
      text: "Also has a makeup table."
    });
    const media = await repository.attachMedia({
      ownerProfileId: session.ownerProfile.id,
      draftId: draft.id,
      kind: "interior",
      fileName: "Room.jpg",
      mimeType: "image/jpeg",
      storageKey: "owners/owner_1/room.jpg",
      publicUrl: "https://media.example.com/owners/owner_1/room.jpg"
    });

    expect(sameSession.user.id).toBe(session.user.id);
    expect(updatedDraft.rawText).toContain("makeup table");
    expect(media.publicUrl).toContain("room.jpg");
    await expect(repository.getOwnerSession(session.user.id)).resolves.toMatchObject({
      ownerProfile: { id: session.ownerProfile.id }
    });
  });

  it("persists owner drafts and media through a prisma-backed repository", async () => {
    const database = createFakePrismaDatabase();
    const firstRepository = createPrismaOwnerRepository(database as any);
    const session = await firstRepository.findOrCreateOwnerByTelegram({
      telegramUserId: "2002",
      username: "persisted_studio",
      firstName: "Pavel"
    });
    const draft = await firstRepository.createDraft({
      ownerProfileId: session.ownerProfile.id,
      source: "telegram",
      rawText: "Persistent Prague daylight studio."
    });
    await firstRepository.saveAiDraft({
      draftId: draft.id,
      aiDraftJson: { description: "Persistent draft", suggestedAmenities: ["wifi"] },
      status: "draft_ready"
    });
    await firstRepository.attachMedia({
      ownerProfileId: session.ownerProfile.id,
      draftId: draft.id,
      kind: "interior",
      fileName: "room.jpg",
      mimeType: "image/jpeg",
      storageKey: "owners/db_owner_1/room.jpg",
      publicUrl: "https://media.example.com/owners/db_owner_1/room.jpg"
    });

    const restartedRepository = createPrismaOwnerRepository(database as any);
    const restartedSession = await restartedRepository.findOrCreateOwnerByTelegram({
      telegramUserId: "2002"
    });

    await expect(restartedRepository.getDraft(draft.id)).resolves.toEqual(
      expect.objectContaining({
        id: draft.id,
        status: "draft_ready",
        aiDraftJson: expect.objectContaining({
          description: "Persistent draft"
        })
      })
    );
    await expect(restartedRepository.getDraftMedia(draft.id)).resolves.toEqual([
      expect.objectContaining({
        fileName: "room.jpg",
        publicUrl: "https://media.example.com/owners/db_owner_1/room.jpg"
      })
    ]);
    expect(restartedSession.user.id).toBe(session.user.id);
  });
});
