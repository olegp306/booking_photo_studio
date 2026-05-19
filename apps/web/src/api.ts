import { searchStudios, seedStudios, type Studio, type StudioSearchFilters } from "@studio-market/shared";

const API_BASE = "/api";

export const loadStudios = async (filters: StudioSearchFilters): Promise<Studio[]> => {
  const params = new URLSearchParams();

  if (filters.cityId) params.set("cityId", filters.cityId);
  if (filters.query) params.set("query", filters.query);
  if (filters.maxPrice) params.set("maxPrice", String(filters.maxPrice));
  if (filters.shootType) params.set("shootType", filters.shootType);
  if (filters.bookingMode) params.set("bookingMode", filters.bookingMode);
  if (filters.featureIds?.length) params.set("featureIds", filters.featureIds.join(","));
  if (filters.equipmentIds?.length) params.set("equipmentIds", filters.equipmentIds.join(","));
  if (filters.amenityIds?.length) params.set("amenityIds", filters.amenityIds.join(","));

  try {
    const response = await fetch(`${API_BASE}/studios?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to load studios");
    const payload = (await response.json()) as { studios: Studio[] };
    return payload.studios;
  } catch {
    return searchStudios(seedStudios, filters);
  }
};
