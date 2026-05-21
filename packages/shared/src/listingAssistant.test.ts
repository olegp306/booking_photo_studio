import { describe, expect, it } from "vitest";
import { draftListingFromTranscript } from "./listingAssistant";

describe("listing assistant", () => {
  it("turns an owner transcript into listing fields and filters", () => {
    const draft = draftListingFromTranscript(
      "We have a soft daylight studio for fashion and product shoots. There is a cyclorama, softboxes, c-stands, makeup station, dressing room, wifi, and a product table. Minimum booking is 2 hours."
    );

    expect(draft.tagline).toBe("Soft Daylight Studio.");
    expect(draft.description).toContain("cyclorama");
    expect(draft.shootTypes).toEqual(["fashion", "product"]);
    expect(draft.featureIds).toEqual(["natural-light", "cyclorama", "product-table"]);
    expect(draft.equipmentIds).toEqual(["softboxes", "c-stands"]);
    expect(draft.amenityIds).toEqual(["makeup-station", "dressing-room", "wifi"]);
    expect(draft.rules).toContain("Minimum booking is 2 hours");
  });

  it("keeps prices and rules out of the generated title", () => {
    const draft = draftListingFromTranscript(
      "Studio called Karlin Sun Loft, Prague. 1300 CZK per hour, minimum booking is 2 hours, cyclorama, softboxes, makeup station, and wifi."
    );

    expect(draft.tagline).toBe("Karlin Sun Loft.");
    expect(draft.tagline).not.toContain("1300");
    expect(draft.description).toContain("1300 CZK per hour");
    expect(draft.featureIds).toContain("cyclorama");
    expect(draft.equipmentIds).toContain("softboxes");
    expect(draft.amenityIds).toEqual(expect.arrayContaining(["makeup-station", "wifi"]));
    expect(draft.rules).toContain("1300 CZK per hour, minimum booking is 2 hours, cyclorama, softboxes, makeup station, and wifi");
  });
});
