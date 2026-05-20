import {
  applyStudioReview,
  createBookingIntent,
  decideBookingIntent,
  draftListingFromTranscript,
  findStudioBySlug,
  getAvailabilityForStudio,
  markBookingCompleted,
  markBookingPaid,
  searchStudios,
  seedStudios,
  type AvailabilitySlot,
  type BookingIntent,
  type BookingIntentRequest,
  type ListingDraft,
  type OwnerAvailabilityBlock,
  type OwnerListingUpdate,
  type OwnerBookingDecision,
  type SharedShortlist,
  type SharedShortlistItem,
  type Studio,
  type StudioAvailability,
  type StudioReview,
  type StudioReviewRequest,
  type StudioSearchFilters
} from "@studio-market/shared";

const API_BASE = "/api";
export type AiDraftMode = "local-fallback" | "openai";
export type ImportedDraftMode = "local-fallback" | "openai";

export interface LaunchServiceReadiness {
  configured: boolean;
  env: string;
  label: string;
  missingLabel: string;
  readyLabel: string;
}

export interface LaunchReadiness {
  ok: true;
  envFile: string;
  services: {
    openai: LaunchServiceReadiness;
    telegram: LaunchServiceReadiness;
    publicAppUrl: LaunchServiceReadiness;
    stripe: LaunchServiceReadiness;
  };
  nextSteps: string[];
}

export interface ImportedListingDraft {
  id: string;
  source: "telegram";
  transcript: string;
  mode: ImportedDraftMode;
  draft: ListingDraft;
  createdAt: string;
}

export interface TelegramWebhookSetupResult {
  ok: true;
  webhookUrl: string;
}

const localShortlists = new Map<string, SharedShortlist>();
const localAvailabilityBlocks: OwnerAvailabilityBlock[] = [];
let localShortlistCount = 0;
let localAvailabilityBlockCount = 0;

const isBlockedSlot = (block: OwnerAvailabilityBlock, slot: AvailabilitySlot) =>
  (block.kind ?? "hold") === "hold" &&
  block.studioSlug === slot.studioSlug &&
  block.roomId === slot.roomId &&
  block.date === slot.date &&
  (block.startTime === slot.startTime || block.startTime === "full-day");
const isOpenOverrideSlot = (block: OwnerAvailabilityBlock, slot: AvailabilitySlot) =>
  block.kind === "open" &&
  block.studioSlug === slot.studioSlug &&
  block.roomId === slot.roomId &&
  block.date === slot.date &&
  block.startTime === slot.startTime;

export const fallbackLaunchReadiness: LaunchReadiness = {
  ok: true,
  envFile: ".env.local",
  services: {
    openai: {
      configured: false,
      env: "OPENAI_API_KEY",
      label: "OpenAI listing assistant",
      missingLabel: "Missing OPENAI_API_KEY",
      readyLabel: "OPENAI_API_KEY configured"
    },
    telegram: {
      configured: false,
      env: "TELEGRAM_BOT_TOKEN",
      label: "Telegram owner bot",
      missingLabel: "Missing TELEGRAM_BOT_TOKEN",
      readyLabel: "TELEGRAM_BOT_TOKEN configured"
    },
    publicAppUrl: {
      configured: false,
      env: "PUBLIC_APP_URL",
      label: "Public app URL",
      missingLabel: "Missing PUBLIC_APP_URL",
      readyLabel: "PUBLIC_APP_URL configured"
    },
    stripe: {
      configured: false,
      env: "STRIPE_SECRET_KEY",
      label: "Stripe payments",
      missingLabel: "Missing STRIPE_SECRET_KEY",
      readyLabel: "STRIPE_SECRET_KEY configured"
    }
  },
  nextSteps: [
    "Fill OPENAI_API_KEY to switch listing drafts from local fallback to AI generation.",
    "Fill TELEGRAM_BOT_TOKEN before wiring the owner onboarding bot.",
    "Fill PUBLIC_APP_URL so Telegram links can open the web app.",
    "Fill STRIPE_SECRET_KEY before replacing simulated payment capture."
  ]
};

export const loadLaunchReadiness = async (): Promise<LaunchReadiness> => {
  try {
    const response = await fetch(`${API_BASE}/readiness`);
    if (!response.ok) throw new Error("Failed to load launch readiness");
    return (await response.json()) as LaunchReadiness;
  } catch {
    return fallbackLaunchReadiness;
  }
};

export const generateListingDraft = async (
  transcript: string
): Promise<{ mode: AiDraftMode; draft: ListingDraft }> => {
  try {
    const response = await fetch(`${API_BASE}/ai/listing-draft`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transcript
      })
    });
    if (!response.ok) throw new Error("Failed to generate listing draft");
    return (await response.json()) as { mode: AiDraftMode; draft: ListingDraft };
  } catch {
    return {
      mode: "local-fallback",
      draft: draftListingFromTranscript(transcript)
    };
  }
};

export const loadOwnerListingDrafts = async (): Promise<ImportedListingDraft[]> => {
  try {
    const response = await fetch(`${API_BASE}/owner/listing-drafts`);
    if (!response.ok) throw new Error("Failed to load imported listing drafts");
    const payload = (await response.json()) as { drafts: ImportedListingDraft[] };
    return payload.drafts;
  } catch {
    return [];
  }
};

export const setupTelegramWebhook = async (): Promise<TelegramWebhookSetupResult> => {
  const response = await fetch(`${API_BASE}/integrations/telegram/webhook`, {
    method: "POST"
  });
  const payload = await response.json();

  if (!response.ok) {
    const missing = Array.isArray(payload.missing) ? payload.missing.join(", ") : "Telegram launch env";
    throw new Error(`Add ${missing} before registering the webhook.`);
  }

  return payload as TelegramWebhookSetupResult;
};

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
    const availability = getAvailabilityForStudio(studio, date);
    return {
      ...availability,
      slots: availability.slots.map((slot) => ({
        ...slot,
        available:
          localAvailabilityBlocks.some((block) => isOpenOverrideSlot(block, slot)) ||
          (slot.available && !localAvailabilityBlocks.some((block) => isBlockedSlot(block, slot)))
      }))
    };
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

export const confirmBookingPayment = async (booking: BookingIntent): Promise<BookingIntent> => {
  try {
    const response = await fetch(`${API_BASE}/bookings/${booking.id}/payment`, {
      method: "POST"
    });
    if (!response.ok) throw new Error("Failed to confirm booking payment");
    const payload = (await response.json()) as { booking: BookingIntent };
    return payload.booking;
  } catch {
    return markBookingPaid(booking);
  }
};

export const completeOwnerBooking = async (booking: BookingIntent): Promise<BookingIntent> => {
  try {
    const response = await fetch(`${API_BASE}/owner/bookings/${booking.id}/complete`, {
      method: "POST"
    });
    if (!response.ok) throw new Error("Failed to complete booking");
    const payload = (await response.json()) as { booking: BookingIntent };
    return payload.booking;
  } catch {
    return markBookingCompleted(booking);
  }
};

export const submitBookingReview = async (
  booking: BookingIntent,
  request: StudioReviewRequest,
  studio: Studio
): Promise<{ review: StudioReview; studio: Studio }> => {
  try {
    const response = await fetch(`${API_BASE}/bookings/${booking.id}/review`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Failed to submit review");
    return (await response.json()) as { review: StudioReview; studio: Studio };
  } catch {
    return {
      review: {
        id: `review-${booking.id}`,
        bookingId: booking.id,
        studioSlug: booking.studioSlug,
        guestName: booking.guestName,
        rating: request.rating,
        comment: request.comment,
        createdAt: new Date().toISOString()
      },
      studio: applyStudioReview(studio, request.rating)
    };
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
      images: updates.images ?? studio.images,
      rooms: updates.rooms ?? studio.rooms,
      props: updates.props ?? studio.props,
      accessNotes: updates.accessNotes ?? studio.accessNotes,
      cancellationPolicy: updates.cancellationPolicy ?? studio.cancellationPolicy,
      listingStatus: updates.listingStatus ?? studio.listingStatus
    };
  }
};

export const createOwnerAvailabilityBlock = async (
  block: Omit<OwnerAvailabilityBlock, "id">
): Promise<OwnerAvailabilityBlock> => {
  try {
    const response = await fetch(`${API_BASE}/owner/availability-blocks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(block)
    });
    if (!response.ok) throw new Error("Failed to block availability");
    const payload = (await response.json()) as { block: OwnerAvailabilityBlock };
    return payload.block;
  } catch {
    localAvailabilityBlockCount += 1;
    const blocked: OwnerAvailabilityBlock = {
      id: `block-${localAvailabilityBlockCount}`,
      ...block
    };
    localAvailabilityBlocks.push(blocked);
    return blocked;
  }
};

export const loadOwnerAvailabilityBlocks = async (studioSlug?: string): Promise<OwnerAvailabilityBlock[]> => {
  const params = new URLSearchParams();
  if (studioSlug) params.set("studioSlug", studioSlug);

  try {
    const response = await fetch(`${API_BASE}/owner/availability-blocks?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to load availability blocks");
    const payload = (await response.json()) as { blocks: OwnerAvailabilityBlock[] };
    return payload.blocks;
  } catch {
    return studioSlug
      ? localAvailabilityBlocks.filter((block) => block.studioSlug === studioSlug)
      : localAvailabilityBlocks;
  }
};

export const releaseOwnerAvailabilityBlock = async (blockId: string): Promise<void> => {
  const localBlockIndex = localAvailabilityBlocks.findIndex((block) => block.id === blockId);
  if (localBlockIndex !== -1) {
    localAvailabilityBlocks.splice(localBlockIndex, 1);
  }

  try {
    const response = await fetch(`${API_BASE}/owner/availability-blocks/${blockId}`, {
      method: "DELETE"
    });
    if (!response.ok) throw new Error("Failed to release availability block");
  } catch (error) {
    if (localBlockIndex === -1) throw error;
  }
};

export const resetLocalApiStateForTests = () => {
  localShortlists.clear();
  localAvailabilityBlocks.splice(0, localAvailabilityBlocks.length);
  localShortlistCount = 0;
  localAvailabilityBlockCount = 0;
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
