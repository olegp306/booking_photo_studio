import { describe, expect, it } from "vitest";
import { createInMemoryOwnerRepository } from "./ownerRepository";

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
});
