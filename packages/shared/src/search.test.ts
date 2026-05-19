import { describe, expect, it } from "vitest";
import { searchStudios } from "./search";
import { seedStudios } from "./seedStudios";

describe("searchStudios", () => {
  it("filters studios by city", () => {
    const results = searchStudios(seedStudios, { cityId: "prague" });

    expect(results).toHaveLength(3);
    expect(results.every((studio) => studio.city.name === "Prague")).toBe(true);
  });

  it("filters by shoot type and equipment", () => {
    const results = searchStudios(seedStudios, {
      shootType: "fashion",
      equipmentIds: ["smoke-machine"]
    });

    expect(results.map((studio) => studio.slug)).toEqual(["framehouse-smichov"]);
  });

  it("filters by amenities and max price", () => {
    const results = searchStudios(seedStudios, {
      amenityIds: ["pet-friendly"],
      maxPrice: 1000
    });

    expect(results.map((studio) => studio.slug)).toEqual(["atelier-rosa-vinohrady"]);
  });

  it("matches text query against visual descriptors", () => {
    const results = searchStudios(seedStudios, { query: "cyclorama" });

    expect(results.map((studio) => studio.slug)).toEqual(["studio-lumen-karlin"]);
  });
});
