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
  type ListingReviewDecision,
  type ListingReviewItem,
  type OwnerAvailabilityBlock,
  type OwnerMedia,
  type OwnerOnboardingDraft,
  type OwnerListingUpdate,
  type PublishedStudioListing,
  type OwnerBookingDecision,
  type ReferralSummary,
  type ReferralSource,
  type SharedShortlist,
  type SharedShortlistItem,
  type Studio,
  type StudioAvailability,
  type StudioImage,
  type StudioReview,
  type StudioReviewRequest,
  type StudioRoom,
  type StudioSearchFilters,
  type SupportCategory,
  type SupportEvent,
  type SupportTicket,
  type UserRole,
  type UserSession
} from "@studio-market/shared";

const API_BASE = "/api";
export type AiDraftMode = "local-fallback" | "openai";
export type ImportedDraftMode = "local-fallback" | "openai";
export type {
  ListingReviewDecision,
  ListingReviewItem,
  ReferralSource,
  ReferralSummary,
  SupportCategory,
  SupportEvent,
  SupportTicket,
  UserRole,
  UserSession
};

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
  chatId?: number | string;
  transcript: string;
  mode: ImportedDraftMode;
  draft: ListingDraft;
  createdAt: string;
  openEditorUrl?: string;
}

export interface TelegramWebhookSetupResult {
  ok: true;
  webhookUrl: string;
}

export interface MediaSuggestionResult {
  mode: AiDraftMode;
  suggestion: {
    kind: StudioImage["kind"];
    roomId?: string;
    reason: string;
  };
}

export interface SupportTicketRequest {
  category?: SupportCategory;
  priority?: SupportTicket["priority"];
  message: string;
  includeActivity: boolean;
  screen: string;
  userRole?: SupportTicket["userRole"];
  currentView?: string;
  currentStudioId?: string;
  currentDraftId?: string;
  relatedStudioSlug?: string;
  relatedBookingId?: string;
  relatedShortlistId?: string;
  events: SupportEvent[];
  sessionEvents?: SupportEvent[];
  userAgent?: string;
}

const localShortlists = new Map<string, SharedShortlist>();
const localAvailabilityBlocks: OwnerAvailabilityBlock[] = [];
const localSupportTickets: SupportTicket[] = [];
const localOwnerDrafts = new Map<string, OwnerOnboardingDraft>();
let localSession: UserSession = {
  id: "demo-session",
  role: "photographer",
  displayName: "Marta Photographer"
};
let localShortlistCount = 0;
let localAvailabilityBlockCount = 0;
let localOwnerDraftCount = 0;

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

const triageLocalSupportCategory = (message: string): SupportCategory => {
  const normalized = message.toLowerCase();
  if (
    normalized.includes("owner") ||
    normalized.includes("studio profile") ||
    normalized.includes("draft") ||
    normalized.includes("email code") ||
    normalized.includes("photo upload")
  ) {
    return "owner_onboarding";
  }
  if (normalized.includes("payment") || normalized.includes("paid") || normalized.includes("stripe")) return "payment";
  if (normalized.includes("bug") || normalized.includes("broken") || normalized.includes("error")) return "bug_report";
  if (normalized.includes("wrong") || normalized.includes("address") || normalized.includes("photo")) {
    return "listing_quality";
  }
  if (normalized.includes("booking") || normalized.includes("slot") || normalized.includes("confirmed")) {
    return "booking_issue";
  }
  if (normalized.includes("feature") || normalized.includes("add") || normalized.includes("idea")) return "feature_request";
  return "other";
};

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

export const loadSession = async (): Promise<UserSession> => {
  try {
    const response = await fetch(`${API_BASE}/session`);
    if (!response.ok) throw new Error("Failed to load session");
    const payload = (await response.json()) as { session: UserSession };
    localSession = payload.session;
    return payload.session;
  } catch {
    return localSession;
  }
};

export const updateSessionRole = async (role: UserRole): Promise<UserSession> => {
  const fallbackSession: UserSession = {
    ...localSession,
    role,
    displayName:
      role === "studio_owner"
        ? "Studio Lumen Owner"
        : role === "client"
          ? "Anna Client"
          : role === "admin"
            ? "Marketplace Admin"
            : "Marta Photographer"
  };

  try {
    const response = await fetch(`${API_BASE}/session`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(fallbackSession)
    });
    if (!response.ok) throw new Error("Failed to update session role");
    const payload = (await response.json()) as { session: UserSession };
    localSession = payload.session;
    return payload.session;
  } catch {
    localSession = fallbackSession;
    return fallbackSession;
  }
};

export const createSupportTicket = async (request: SupportTicketRequest): Promise<SupportTicket> => {
  try {
    const response = await fetch(`${API_BASE}/support/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) throw new Error("Failed to create support ticket");
    const payload = (await response.json()) as { ticket: SupportTicket };
    return payload.ticket;
  } catch {
    const ticket: SupportTicket = {
      id: `local-support-ticket-${localSupportTickets.length + 1}`,
      ...request,
      category: request.category ?? triageLocalSupportCategory(request.message),
      priority: request.priority ?? "medium",
      triageReason: request.category
        ? "Submitted with an existing internal category."
        : "Local fallback classified the free-text support message.",
      session: localSession,
      userRole: request.userRole ?? localSession.role,
      currentView: request.currentView ?? request.screen,
      currentStudioId: request.currentStudioId ?? request.relatedStudioSlug,
      currentDraftId: request.currentDraftId,
      sessionEvents: request.sessionEvents ?? request.events,
      createdAt: new Date().toISOString()
    };
    localSupportTickets.unshift(ticket);
    return ticket;
  }
};

export const loadSupportTickets = async (): Promise<SupportTicket[]> => {
  try {
    const response = await fetch(`${API_BASE}/support/tickets`);
    if (!response.ok) throw new Error("Failed to load support tickets");
    const payload = (await response.json()) as { tickets: SupportTicket[] };
    return payload.tickets;
  } catch {
    return localSupportTickets;
  }
};

export const trackReferralSource = async (source: ReferralSource, path: string): Promise<void> => {
  try {
    await fetch(`${API_BASE}/referrals`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        source,
        path
      })
    });
  } catch {
    return undefined;
  }
};

export const loadReferralSummary = async (): Promise<ReferralSummary> => {
  try {
    const response = await fetch(`${API_BASE}/referrals/summary`);
    if (!response.ok) throw new Error("Failed to load referral summary");
    return (await response.json()) as ReferralSummary;
  } catch {
    return {
      total: 0,
      bySource: {
        telegram: 0,
        photographer: 0,
        studio_owner: 0,
        direct: 0,
        unknown: 0
      },
      recent: []
    };
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

export const suggestMediaDetails = async (
  caption: string,
  imageUrl: string,
  rooms: Array<Pick<StudioRoom, "id" | "name">>
): Promise<MediaSuggestionResult> => {
  const response = await fetch(`${API_BASE}/ai/media-suggestion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      caption,
      imageUrl,
      rooms
    })
  });

  if (!response.ok) throw new Error("Failed to suggest media details");
  return (await response.json()) as MediaSuggestionResult;
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

export const loadTelegramMiniAppDrafts = async (chatId?: string): Promise<ImportedListingDraft[]> => {
  const params = new URLSearchParams();
  if (chatId) params.set("chatId", chatId);

  try {
    const response = await fetch(`${API_BASE}/integrations/telegram/mini-app/drafts?${params.toString()}`);
    if (!response.ok) throw new Error("Failed to load Telegram Mini App drafts");
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

export async function startOwnerOnboarding(input: { text: string; source: "web" }): Promise<OwnerOnboardingDraft> {
  try {
    const response = await fetch(`${API_BASE}/owner/onboarding/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error("Failed to start owner onboarding");
    const payload = (await response.json()) as { draft: OwnerOnboardingDraft };
    localOwnerDrafts.set(payload.draft.id, payload.draft);
    return payload.draft;
  } catch {
    localOwnerDraftCount += 1;
    const draft: OwnerOnboardingDraft = {
      id: `local-owner-draft-${localOwnerDraftCount}`,
      source: input.source,
      status: "draft_ready",
      ownerSessionToken: `local-owner-token-${localOwnerDraftCount}`,
      rawText: input.text,
      studioName: input.text.toLowerCase().includes("karlin") ? "Loft Karlin" : "New studio draft",
      city: input.text.toLowerCase().includes("prague") || input.text.toLowerCase().includes("karlin") ? "Prague" : undefined,
      description: input.text,
      suggestedAmenities: input.text.toLowerCase().includes("cyclorama") ? ["cyclorama"] : [],
      suggestedRules: [],
      suggestedRooms: [],
      media: [],
      missingFields: ["price"]
    };
    localOwnerDrafts.set(draft.id, draft);
    return draft;
  }
}

export async function sendOwnerOnboardingMessage(
  draftId: string,
  input: { text: string }
): Promise<OwnerOnboardingDraft> {
  try {
    const response = await fetch(`${API_BASE}/owner/onboarding/${draftId}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error("Failed to send owner onboarding message");
    const payload = (await response.json()) as { draft: OwnerOnboardingDraft };
    localOwnerDrafts.set(payload.draft.id, payload.draft);
    return payload.draft;
  } catch {
    const current = localOwnerDrafts.get(draftId);
    if (!current) throw new Error("Owner draft was not found");
    const draft = {
      ...current,
      rawText: `${current.rawText}\n${input.text}`
    };
    localOwnerDrafts.set(draft.id, draft);
    return draft;
  }
}

export async function uploadOwnerMedia(input: {
  draftId: string;
  file: File;
  ownerSessionToken?: string;
}): Promise<OwnerMedia> {
  const form = new FormData();
  form.set("draftId", input.draftId);
  if (input.ownerSessionToken) form.set("ownerSessionToken", input.ownerSessionToken);
  form.set("file", input.file);

  try {
    const response = await fetch(`${API_BASE}/owner/media`, {
      method: "POST",
      body: form
    });
    if (!response.ok) throw new Error("Failed to upload owner media");
    const payload = (await response.json()) as { media: OwnerMedia };
    return payload.media;
  } catch {
    return {
      id: `local-owner-media-${Date.now()}`,
      fileName: input.file.name,
      mimeType: input.file.type,
      publicUrl: URL.createObjectURL(input.file),
      kind: "interior",
      sortOrder: 0
    };
  }
}

export async function requestOwnerEmailCode(input: { draftId: string; email: string }): Promise<{ ok: true; email: string }> {
  const response = await fetch(`${API_BASE}/owner/email-codes`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ownerDraftId: input.draftId, email: input.email })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined) as { message?: string } | undefined;
    throw new Error(payload?.message ?? "Failed to request owner email code");
  }
  return (await response.json()) as { ok: true; email: string };
}

export async function verifyOwnerEmailCode(input: { email: string; code: string }): Promise<{ emailVerified: boolean; ownerSessionToken: string }> {
  const response = await fetch(`${API_BASE}/owner/email-codes/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
  if (!response.ok) throw new Error("Failed to verify owner email code");
  const payload = (await response.json()) as { session: { emailVerified: boolean; ownerSessionToken: string } };
  return payload.session;
}

export async function publishOwnerDraft(input: {
  draftId: string;
  ownerSessionToken: string;
}): Promise<PublishedStudioListing> {
  const response = await fetch(`${API_BASE}/owner/onboarding/${input.draftId}/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ ownerSessionToken: input.ownerSessionToken })
  });
  if (!response.ok) throw new Error("Failed to publish owner draft");
  const payload = (await response.json()) as { listing: PublishedStudioListing };
  return payload.listing;
}

export const loadListingReviews = async (): Promise<ListingReviewItem[]> => {
  try {
    const response = await fetch(`${API_BASE}/admin/listing-reviews`);
    if (!response.ok) throw new Error("Failed to load listing reviews");
    const payload = (await response.json()) as { reviews: ListingReviewItem[] };
    return payload.reviews;
  } catch {
    return [];
  }
};

export const decideListingReview = async (
  studioSlug: string,
  decision: ListingReviewDecision
): Promise<Pick<Studio, "slug" | "listingStatus">> => {
  const response = await fetch(`${API_BASE}/admin/studios/${studioSlug}/review`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ decision })
  });
  if (!response.ok) throw new Error("Failed to update listing review");
  const payload = (await response.json()) as { studio: Studio };
  return {
    slug: payload.studio.slug,
    listingStatus: payload.studio.listingStatus
  };
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
  request: BookingIntentRequest & { guestEmailToken?: string }
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

export async function requestBookingEmailCode(input: { studioSlug: string; email: string }): Promise<{ ok: true; email: string }> {
  try {
    const response = await fetch(`${API_BASE}/booking/email-codes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error("Failed to request booking email code");
    return (await response.json()) as { ok: true; email: string };
  } catch {
    return { ok: true, email: input.email.trim().toLowerCase() };
  }
}

export async function verifyBookingEmailCode(input: { email: string; code: string }): Promise<{ emailVerified: true; guestEmailToken: string }> {
  try {
    const response = await fetch(`${API_BASE}/booking/email-codes/verify`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(input)
    });
    if (!response.ok) throw new Error("Failed to verify booking email code");
    return (await response.json()) as { emailVerified: true; guestEmailToken: string };
  } catch {
    return {
      emailVerified: true,
      guestEmailToken: `local-guest-email-token-${input.email.trim().toLowerCase()}`
    };
  }
}

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
  localSupportTickets.splice(0, localSupportTickets.length);
  localOwnerDrafts.clear();
  localSession = {
    id: "demo-session",
    role: "photographer",
    displayName: "Marta Photographer"
  };
  localShortlistCount = 0;
  localAvailabilityBlockCount = 0;
  localOwnerDraftCount = 0;
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
