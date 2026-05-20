import { describe, expect, it } from "vitest";
import { draftListingFromTranscript } from "./listingAssistant";

describe("listing assistant", () => {
  it("turns an owner transcript into listing fields and filters", () => {
    const draft = draftListingFromTranscript(
      "We have a soft daylight studio for fashion and product shoots. There is a cyclorama, softboxes, c-stands, makeup station, dressing room, wifi, and a product table. Minimum booking is 2 hours."
    );

    expect(draft.tagline).toBe("Soft daylight studio for fashion and product shoots.");
    expect(draft.description).toContain("cyclorama");
    expect(draft.shootTypes).toEqual(["fashion", "product"]);
    expect(draft.featureIds).toEqual(["natural-light", "cyclorama", "product-table"]);
    expect(draft.equipmentIds).toEqual(["softboxes", "c-stands"]);
    expect(draft.amenityIds).toEqual(["makeup-station", "dressing-room", "wifi"]);
    expect(draft.rules).toContain("Minimum booking is 2 hours");
  });
});
