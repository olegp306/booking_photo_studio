import {
  createBookingIntent,
  decideBookingIntent,
  findStudioBySlug,
  getAvailabilityForStudio,
  searchStudios,
  seedStudios,
  type BookingIntent,
  type BookingIntentRequest,
  type OwnerListingUpdate,
  type OwnerBookingDecision,
  type SharedShortlist,
  type SharedShortlistItem,
  type Studio,
  type StudioAvailability,
  type StudioSearchFilters
} from "@studio-market/shared";

const API_BASE = "/api";
const localShortlists = new Map<string, SharedShortlist>();
let localShortlistCount = 0;

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

export const loadAvailability = async (studio: Studio, date: string): Promise<StudioAvailability> => {
  try {
    const response = await fetch(`${API_BASE}/studios/${studio.slug}/availability?date=${date}`);
    if (!response.ok) throw new Error("Failed to load availability");
    const payload = (await response.json()) as { availability: StudioAvailability };
    return payload.availability;
  } catch {
    return getAvailabilityForStudio(studio, date);
  }
};

export const submitBookingRequest = async (
  studioSlug: string,
  request: BookingIntentRequest
): Promise<BookingIntent> => {
  try {
    const response = await fetch(`${API_BASE}/booking-requests`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studioSlug,
        ...request
      })
    });
    if (!response.ok) throw new Error("Failed to create booking request");
    const payload = (await response.json()) as { booking: BookingIntent };
    return payload.booking;
  } catch {
    const studio = findStudioBySlug(seedStudios, studioSlug);
    if (!studio) throw new Error("Studio was not found");
    return createBookingIntent(studio, request);
  }
};

export const loadOwnerBookings = async (studioSlug?: string): Promise<BookingIntent[]> => {
  const params = new URLSearchParams();
  if (studioSlug) params.set("studioSlug", studioSlug);

  try {
    const response = await fetch(`${API_BASE}/owner/bookings?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to load owner bookings");
    const payload = (await response.json()) as { bookings: BookingIntent[] };
    return payload.bookings;
  } catch {
    return [];
  }
};

export const loadCustomerBookings = async (guestEmail?: string): Promise<BookingIntent[]> => {
  const params = new URLSearchParams();
  if (guestEmail) params.set("guestEmail", guestEmail);

  try {
    const response = await fetch(`${API_BASE}/bookings?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to load bookings");
    const payload = (await response.json()) as { bookings: BookingIntent[] };
    return payload.bookings;
  } catch {
    return [];
  }
};

export const decideOwnerBooking = async (
  booking: BookingIntent,
  decision: OwnerBookingDecision
): Promise<BookingIntent> => {
  try {
    const response = await fetch(`${API_BASE}/owner/bookings/${booking.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        decision
      })
    });
    if (!response.ok) throw new Error("Failed to update booking");
    const payload = (await response.json()) as { booking: BookingIntent };
    return payload.booking;
  } catch {
    return decideBookingIntent(booking, decision);
  }
};

export const updateOwnerListing = async (studio: Studio, updates: OwnerListingUpdate): Promise<Studio> => {
  try {
    const response = await fetch(`${API_BASE}/owner/studios/${studio.slug}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error("Failed to update studio listing");
    const payload = (await response.json()) as { studio: Studio };
    return payload.studio;
  } catch {
    return {
      ...studio,
      ...updates,
      description: updates.description ?? studio.description,
      priceFrom: updates.priceFrom ?? studio.priceFrom,
      bookingMode: updates.bookingMode ?? studio.bookingMode,
      shootTypes: updates.shootTypes ?? studio.shootTypes,
      featureIds: updates.featureIds ?? studio.featureIds,
      equipmentIds: updates.equipmentIds ?? studio.equipmentIds,
      amenityIds: updates.amenityIds ?? studio.amenityIds,
      rules: updates.rules ?? studio.rules,
      images: updates.images ?? studio.images
    };
  }
};

export const createSharedShortlist = async (
  studioSlugs: string[],
  items: SharedShortlistItem[] = []
): Promise<SharedShortlist> => {
  const uniqueStudioSlugs = Array.from(new Set(studioSlugs));

  try {
    const response = await fetch(`${API_BASE}/shortlists`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        studioSlugs: uniqueStudioSlugs,
        items
      })
    });
    if (!response.ok) throw new Error("Failed to create shortlist");
    const payload = (await response.json()) as { shortlist: SharedShortlist };
    return payload.shortlist;
  } catch {
    localShortlistCount += 1;
    const shortlist: SharedShortlist = {
      id: `shortlist-${localShortlistCount}`,
      studioSlugs: uniqueStudioSlugs,
      items: uniqueStudioSlugs.map((studioSlug) => ({
        studioSlug,
        ...items.find((item) => item.studioSlug === studioSlug)
      })),
      createdAt: new Date().toISOString()
    };
    localShortlists.set(shortlist.id, shortlist);
    return shortlist;
  }
};

export const loadSharedShortlist = async (shortlistId: string): Promise<SharedShortlist> => {
  try {
    const response = await fetch(`${API_BASE}/shortlists/${shortlistId}`);
    if (!response.ok) throw new Error("Failed to load shortlist");
    const payload = (await response.json()) as { shortlist: SharedShortlist };
    return payload.shortlist;
  } catch {
    const shortlist = localShortlists.get(shortlistId);
    if (!shortlist) throw new Error("Shortlist was not found");
    return shortlist;
  }
};

export const updateSharedShortlist = async (
  shortlistId: string,
  items: SharedShortlistItem[]
): Promise<SharedShortlist> => {
  const localShortlist = localShortlists.get(shortlistId);
  if (localShortlist) {
    localShortlists.set(shortlistId, {
      ...localShortlist,
      items: localShortlist.studioSlugs.map((studioSlug) => ({
        studioSlug,
        ...items.find((item) => item.studioSlug === studioSlug)
      }))
    });
  }

  try {
    const response = await fetch(`${API_BASE}/shortlists/${shortlistId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        items
      })
    });
    if (!response.ok) throw new Error("Failed to update shortlist");
    const payload = (await response.json()) as { shortlist: SharedShortlist };
    return payload.shortlist;
  } catch {
    const shortlist = localShortlists.get(shortlistId);
    if (!shortlist) throw new Error("Shortlist was not found");
    return shortlist;
  }
};
