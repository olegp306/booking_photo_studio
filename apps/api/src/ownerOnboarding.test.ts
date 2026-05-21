import { describe, expect, it } from "vitest";
import { createInMemoryOwnerRepository } from "./ownerRepository";
import { createOwnerOnboardingService } from "./ownerOnboarding";

describe("owner onboarding service", () => {
  it("creates a draft from owner text and flags missing fields", async () => {
    const service = createOwnerOnboardingService({
      repository: createInMemoryOwnerRepository(),
      ai: {
        createListingDraft: async () => ({
          studioName: "Loft Karlin",
          city: "Prague",
          description: "Bright daylight loft with cyclorama.",
          suggestedAmenities: ["cyclorama", "makeup table"],
          suggestedRules: ["No smoking"],
          suggestedRooms: []
        })
      }
    });

    const draft = await service.createDraftFromText({
      source: "web",
      text: "Loft in Karlin, daylight, cyclorama, makeup table."
    });

    expect(draft.status).toBe("draft_ready");
    expect(draft.studioName).toBe("Loft Karlin");
    expect(draft.missingFields).toContain("price");
  });
});
