import type { Studio, StudioSearchFilters } from "./types";

const includesAll = <T>(actual: T[], expected: T[] | undefined): boolean => {
  if (!expected?.length) return true;
  return expected.every((item) => actual.includes(item));
};

const matchesQuery = (studio: Studio, query: string | undefined): boolean => {
  if (!query?.trim()) return true;
  const normalized = query.toLowerCase().trim();
  return [
    studio.name,
    studio.district,
    studio.tagline,
    studio.description,
    studio.moodTags.join(" ")
  ]
    .join(" ")
    .toLowerCase()
    .includes(normalized);
};

export const searchStudios = (
  studios: Studio[],
  filters: StudioSearchFilters = {}
): Studio[] => {
  return studios.filter((studio) => {
    if (filters.cityId && studio.city.id !== filters.cityId) return false;
    if (filters.maxPrice && studio.priceFrom > filters.maxPrice) return false;
    if (filters.shootType && !studio.shootTypes.includes(filters.shootType)) return false;
    if (filters.bookingMode && studio.bookingMode !== filters.bookingMode) return false;
    if (!includesAll(studio.featureIds, filters.featureIds)) return false;
    if (!includesAll(studio.equipmentIds, filters.equipmentIds)) return false;
    if (!includesAll(studio.amenityIds, filters.amenityIds)) return false;
    return matchesQuery(studio, filters.query);
  });
};

export const findStudioBySlug = (studios: Studio[], slug: string): Studio | undefined => {
  return studios.find((studio) => studio.slug === slug);
};
