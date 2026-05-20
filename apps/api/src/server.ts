import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  applyStudioReview,
  createBookingIntent,
  decideBookingIntent,
  findStudioBySlug,
  getAvailabilityForStudio,
  markBookingCompleted,
  markBookingPaid,
  searchStudios,
  seedStudios,
  taxonomy,
  type AmenityId,
  type AvailabilitySlot,
  type BookingMode,
  type BookingIntent,
  type BookingIntentRequest,
  type EquipmentId,
  type FeatureId,
  type ListingReviewDecision,
  type ListingReviewItem,
  type OwnerListingUpdate,
  type OwnerBookingDecision,
  type OwnerAvailabilityBlock,
  type PublicApiMetric,
  type SharedShortlist,
  type SharedShortlistItem,
  type ReferralRecord,
  type ReferralSource,
  type ReferralSourceTotals,
  type ShootType,
  type Studio,
  type SupportCategory,
  type SupportEvent,
  type SupportTicket,
  type StudioReview,
  type StudioReviewRequest,
  type StudioSearchFilters,
  type UserRole,
  type UserSession
} from "@studio-market/shared";
import { generateListingDraft, type FetchLike } from "./aiListing";
import { suggestMediaDetails } from "./aiMedia";
import { getLaunchReadiness, loadRuntimeConfig, type RuntimeConfig } from "./env";
import { createJsonResourceStore } from "./jsonResourceStore";
import { createListingDraftStore } from "./listingDraftStore";
import {
  extractTelegramChatId,
  extractTelegramText,
  isTelegramSecretValid,
  registerTelegramListingDraftWebhook,
  sendTelegramListingDraftReply,
} from "./telegram";

const toArray = <T extends string>(value: string | string[] | undefined): T[] | undefined => {
  if (!value) return undefined;
  const values = Array.isArray(value) ? value : value.split(",");
  return values.map((item) => item.trim()).filter(Boolean) as T[];
};

const supportedSessionRoles: UserRole[] = ["client", "photographer", "studio_owner", "admin"];
const defaultSession: UserSession = {
  id: "demo-session",
  role: "photographer",
  displayName: "Marta Photographer"
};

const isUserRole = (role: unknown): role is UserRole =>
  typeof role === "string" && supportedSessionRoles.includes(role as UserRole);

const supportCategories: SupportCategory[] = [
  "booking_issue",
  "studio_info_wrong",
  "payment",
  "owner_listing",
  "idea",
  "bug"
];

const isSupportCategory = (category: unknown): category is SupportCategory =>
  typeof category === "string" && supportCategories.includes(category as SupportCategory);

const referralSources: ReferralSource[] = ["telegram", "photographer", "studio_owner", "direct", "unknown"];
const isReferralSource = (source: unknown): source is ReferralSource =>
  typeof source === "string" && referralSources.includes(source as ReferralSource);

const referralSourceLabels = Object.fromEntries(referralSources.map((source) => [source, 0])) as ReferralSourceTotals;

const triageSupportTicket = (message: string): { category: SupportCategory; triageReason: string } => {
  const normalized = message.toLowerCase();
  if (normalized.includes("payment") || normalized.includes("paid") || normalized.includes("stripe")) {
    return {
      category: "payment",
      triageReason: "Matched payment-related words in the support message."
    };
  }
  if (normalized.includes("bug") || normalized.includes("broken") || normalized.includes("error")) {
    return {
      category: "bug",
      triageReason: "Matched bug or error words in the support message."
    };
  }
  if (normalized.includes("listing") || normalized.includes("owner") || normalized.includes("studio profile")) {
    return {
      category: "owner_listing",
      triageReason: "Matched owner listing words in the support message."
    };
  }
  if (normalized.includes("wrong") || normalized.includes("address") || normalized.includes("photo")) {
    return {
      category: "studio_info_wrong",
      triageReason: "Matched studio information correction words in the support message."
    };
  }
  if (normalized.includes("booking") || normalized.includes("slot") || normalized.includes("confirmed")) {
    return {
      category: "booking_issue",
      triageReason: "Matched booking or slot words in the support message."
    };
  }

  return {
    category: "idea",
    triageReason: "No operational issue keywords matched, so this is treated as product feedback."
  };
};

interface BuildServerOptions {
  config?: Partial<RuntimeConfig>;
  fetch?: FetchLike;
}

export const buildServer = (options: BuildServerOptions = {}) => {
  const config = loadRuntimeConfig(options.config);
  const fetchImpl = options.fetch ?? fetch;
  const app = Fastify({ logger: false });
  const studios = seedStudios.map((studio) => ({
    ...studio,
    rooms: studio.rooms.map((room) => ({ ...room })),
    images: studio.images.map((image) => ({ ...image })),
    moodTags: [...studio.moodTags],
    shootTypes: [...studio.shootTypes],
    featureIds: [...studio.featureIds],
    equipmentIds: [...studio.equipmentIds],
    amenityIds: [...studio.amenityIds],
    props: [...studio.props],
    rules: [...studio.rules]
  }));
  const bookingIntentStore = createJsonResourceStore<BookingIntent>(config.localDataDir, "booking-intents.json");
  const shortlistStore = createJsonResourceStore<SharedShortlist>(config.localDataDir, "shared-shortlists.json");
  const availabilityBlockStore = createJsonResourceStore<OwnerAvailabilityBlock>(config.localDataDir, "availability-blocks.json");
  const sessionStore = createJsonResourceStore<UserSession>(config.localDataDir, "sessions.json");
  const supportTicketStore = createJsonResourceStore<SupportTicket>(config.localDataDir, "support-tickets.json");
  const referralStore = createJsonResourceStore<ReferralRecord>(config.localDataDir, "referrals.json");
  const publicMetricStore = createJsonResourceStore<PublicApiMetric>(config.localDataDir, "public-api-metrics.json");
  const listingDraftStore = createListingDraftStore(config.localDataDir);
  const reviews: StudioReview[] = [];
  let reviewCount = 0;
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
  const toPublicStudio = (studio: Studio) => ({
    id: studio.id,
    slug: studio.slug,
    name: studio.name,
    city: studio.city,
    district: studio.district,
    addressHint: studio.addressHint,
    latitude: studio.latitude,
    longitude: studio.longitude,
    rating: studio.rating,
    reviewCount: studio.reviewCount,
    priceFrom: studio.priceFrom,
    currency: studio.currency,
    bookingMode: studio.bookingMode,
    tagline: studio.tagline,
    description: studio.description,
    moodTags: studio.moodTags,
    shootTypes: studio.shootTypes,
    featureIds: studio.featureIds,
    equipmentIds: studio.equipmentIds,
    amenityIds: studio.amenityIds,
    images: studio.images,
    rooms: studio.rooms,
    props: studio.props,
    rules: studio.rules
  });
  const recordPublicMetric = async (path: string) => {
    const metrics = await publicMetricStore.list();
    const existing = metrics.find((metric) => metric.path === path);
    const nextMetric: PublicApiMetric = {
      path,
      count: (existing?.count ?? 0) + 1,
      lastSeenAt: new Date().toISOString()
    };
    await publicMetricStore.setAll([
      nextMetric,
      ...metrics.filter((metric) => metric.path !== path)
    ]);
  };
  const currentSession = async () => (await sessionStore.list())[0] ?? defaultSession;
  const requireAdmin = async (reply: { code: (statusCode: number) => { send: (payload: unknown) => unknown } }) => {
    const session = await currentSession();
    if (session.role === "admin") return false;

    return reply.code(403).send({
      error: "ADMIN_ROLE_REQUIRED",
      message: "Admin role is required for listing moderation"
    });
  };
  const toListingReviewItem = (studio: Studio): ListingReviewItem => ({
    studioSlug: studio.slug,
    studioName: studio.name,
    ownerName: studio.ownerName,
    district: studio.district,
    tagline: studio.tagline,
    listingStatus: studio.listingStatus
  });

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "studio-market-api"
  }));

  app.get("/readiness", async () => getLaunchReadiness(config));

  app.get("/session", async () => ({
    session: (await sessionStore.list())[0] ?? defaultSession
  }));

  app.patch<{
    Body: {
      role?: unknown;
      displayName?: string;
    };
  }>("/session", async (request, reply) => {
    if (!isUserRole(request.body.role)) {
      return reply.code(400).send({
        error: "INVALID_SESSION_ROLE",
        message: "Session role must be client, photographer, studio_owner, or admin"
      });
    }

    const current = (await sessionStore.list())[0] ?? defaultSession;
    const session: UserSession = {
      ...current,
      role: request.body.role,
      displayName: request.body.displayName?.trim() || current.displayName
    };
    await sessionStore.setAll([session]);

    return {
      session
    };
  });

  app.post<{
    Body: {
      category?: unknown;
      message?: string;
      includeActivity?: boolean;
      screen?: string;
      relatedStudioSlug?: string;
      relatedBookingId?: string;
      relatedShortlistId?: string;
      events?: SupportEvent[];
      userAgent?: string;
    };
  }>("/support/tickets", async (request, reply) => {
    if (request.body.category !== undefined && !isSupportCategory(request.body.category)) {
      return reply.code(400).send({
        error: "INVALID_SUPPORT_CATEGORY",
        message: "Support category is required"
      });
    }

    const message = request.body.message?.trim();
    if (!message) {
      return reply.code(400).send({
        error: "INVALID_SUPPORT_MESSAGE",
        message: "Support message is required"
      });
    }

    const tickets = await supportTicketStore.list();
    const triage = request.body.category
      ? { category: request.body.category, triageReason: "Submitted with an existing internal category." }
      : triageSupportTicket(message);
    const ticket: SupportTicket = {
      id: `support-ticket-${tickets.length + 1}`,
      category: triage.category,
      triageReason: triage.triageReason,
      message,
      includeActivity: request.body.includeActivity ?? true,
      session: (await sessionStore.list())[0] ?? defaultSession,
      screen: request.body.screen?.trim() || "unknown",
      relatedStudioSlug: request.body.relatedStudioSlug,
      relatedBookingId: request.body.relatedBookingId,
      relatedShortlistId: request.body.relatedShortlistId,
      events: request.body.includeActivity === false ? [] : request.body.events ?? [],
      userAgent: request.body.userAgent,
      createdAt: new Date().toISOString()
    };
    await supportTicketStore.setAll([ticket, ...tickets]);

    return reply.code(201).send({
      ticket
    });
  });

  app.get("/support/tickets", async () => ({
    tickets: await supportTicketStore.list()
  }));

  app.post<{
    Body: {
      source?: unknown;
      path?: string;
    };
  }>("/referrals", async (request, reply) => {
    const referrals = await referralStore.list();
    const referral: ReferralRecord = {
      id: `referral-${referrals.length + 1}`,
      source: isReferralSource(request.body.source) ? request.body.source : "unknown",
      path: request.body.path?.trim() || "unknown",
      session: (await sessionStore.list())[0] ?? defaultSession,
      createdAt: new Date().toISOString()
    };
    await referralStore.setAll([referral, ...referrals]);

    return reply.code(201).send({
      referral
    });
  });

  app.get("/referrals/summary", async () => {
    const referrals = await referralStore.list();
    const bySource = referrals.reduce<ReferralSourceTotals>(
      (totals, referral) => ({
        ...totals,
        [referral.source]: totals[referral.source] + 1
      }),
      { ...referralSourceLabels }
    );

    return {
      total: referrals.length,
      bySource,
      recent: referrals.slice(0, 6)
    };
  });

  app.post<{
    Body: {
      transcript?: string;
    };
  }>("/ai/listing-draft", async (request, reply) => {
    const transcript = request.body.transcript?.trim();

    if (!transcript) {
      return reply.code(400).send({
        error: "INVALID_LISTING_DRAFT",
        message: "Transcript is required"
      });
    }

    return generateListingDraft(transcript, config, fetchImpl);
  });

  app.post<{
    Body: {
      caption?: string;
      imageUrl?: string;
      rooms?: Array<{ id: string; name: string }>;
    };
  }>("/ai/media-suggestion", async (request, reply) => {
    const caption = request.body.caption?.trim();
    const imageUrl = request.body.imageUrl?.trim();

    if (!caption && !imageUrl) {
      return reply.code(400).send({
        error: "INVALID_MEDIA_SUGGESTION",
        message: "Caption or imageUrl is required"
      });
    }

    return suggestMediaDetails(
      {
        caption,
        imageUrl,
        rooms: request.body.rooms ?? []
      },
      config,
      fetchImpl
    );
  });

  app.post<{
    Headers: {
      "x-telegram-bot-api-secret-token"?: string;
    };
    Body: unknown;
  }>("/integrations/telegram/listing-draft", async (request, reply) => {
    if (!isTelegramSecretValid(config.telegramWebhookSecret, request.headers["x-telegram-bot-api-secret-token"])) {
      return reply.code(401).send({
        error: "INVALID_TELEGRAM_SECRET",
        message: "Telegram webhook secret token did not match"
      });
    }

    const transcript = extractTelegramText(request.body).trim();

    if (!transcript) {
      return {
        ok: true,
        ignored: true,
        reason: "No text or caption was found in the Telegram update."
      };
    }

    const { draft, mode } = await generateListingDraft(transcript, config, fetchImpl);
    const chatId = extractTelegramChatId(request.body);
    const record = await listingDraftStore.add({
      source: "telegram",
      chatId,
      transcript,
      mode,
      draft,
      createdAt: new Date().toISOString()
    });
    const sentMessage = await sendTelegramListingDraftReply(chatId, record, config, fetchImpl);

    return {
      ok: true,
      draftId: record.id,
      mode,
      reply: "Listing draft ready. Open the owner dashboard to review and publish it.",
      webAppUrl: config.publicAppUrl || "http://localhost:5173",
      sentMessage,
      draft
    };
  });

  app.get("/owner/listing-drafts", async () => ({
    drafts: await listingDraftStore.list()
  }));

  app.get<{
    Querystring: {
      chatId?: string;
    };
  }>("/integrations/telegram/mini-app/drafts", async (request) => {
    const publicAppUrl = (config.publicAppUrl || "http://localhost:5173").replace(/\/$/, "");
    const drafts = await listingDraftStore.list();
    const chatDrafts = request.query.chatId
      ? drafts.filter((draft) => String(draft.chatId) === request.query.chatId)
      : drafts;

    return {
      ok: true,
      webAppUrl: `${publicAppUrl}/#telegram-drafts`,
      editorUrl: `${publicAppUrl}/#profile`,
      drafts: chatDrafts.map((draft) => ({
        ...draft,
        openEditorUrl: `${publicAppUrl}/#profile`
      }))
    };
  });

  app.post("/integrations/telegram/webhook", async (_request, reply) => {
    const missing = [
      !config.telegramBotToken?.trim() && "TELEGRAM_BOT_TOKEN",
      !config.publicAppUrl?.trim() && "PUBLIC_APP_URL"
    ].filter(Boolean) as string[];

    if (missing.length) {
      return reply.code(400).send({
        error: "TELEGRAM_SETUP_NOT_READY",
        missing,
        message: `Fill ${missing.join(" and ")} before registering the Telegram webhook.`
      });
    }

    try {
      return await registerTelegramListingDraftWebhook(config, fetchImpl);
    } catch (error) {
      return reply.code(502).send({
        error: "TELEGRAM_WEBHOOK_SETUP_FAILED",
        message: error instanceof Error ? error.message : "Telegram webhook setup failed"
      });
    }
  });

  app.get<{
    Querystring: {
      cityId?: string;
      query?: string;
      maxPrice?: string;
      shootType?: ShootType;
      featureIds?: string;
      equipmentIds?: string;
      amenityIds?: string;
      bookingMode?: BookingMode;
    };
  }>("/studios", async (request) => {
    const filters: StudioSearchFilters = {
      cityId: request.query.cityId,
      query: request.query.query,
      maxPrice: request.query.maxPrice ? Number(request.query.maxPrice) : undefined,
      shootType: request.query.shootType,
      featureIds: toArray<FeatureId>(request.query.featureIds),
      equipmentIds: toArray<EquipmentId>(request.query.equipmentIds),
      amenityIds: toArray<AmenityId>(request.query.amenityIds),
      bookingMode: request.query.bookingMode
    };

    return {
      studios: searchStudios(studios, filters),
      total: searchStudios(studios, filters).length
    };
  });

  app.get<{ Params: { slug: string } }>("/studios/:slug", async (request, reply) => {
    const studio = findStudioBySlug(studios, request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    return { studio };
  });

  app.get<{ Params: { slug: string } }>("/public/studios/:slug", async (request, reply) => {
    const studio = findStudioBySlug(studios, request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    await recordPublicMetric(`/public/studios/${request.params.slug}`);

    return { studio: toPublicStudio(studio) };
  });

  app.get("/internal/public-metrics", async () => ({
    metrics: await publicMetricStore.list()
  }));

  app.get<{
    Params: { slug: string };
    Querystring: { date?: string; durationHours?: string };
  }>("/studios/:slug/availability", async (request, reply) => {
    const studio = findStudioBySlug(studios, request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const date = request.query.date ?? new Date().toISOString().slice(0, 10);
    const durationHours = request.query.durationHours ? Number(request.query.durationHours) : 2;

    const availability = getAvailabilityForStudio(studio, date, durationHours);
    const availabilityBlocks = await availabilityBlockStore.list();

    return {
      availability: {
        ...availability,
        slots: availability.slots.map((slot) => ({
          ...slot,
          available:
            availabilityBlocks.some((block) => isOpenOverrideSlot(block, slot)) ||
            (slot.available && !availabilityBlocks.some((block) => isBlockedSlot(block, slot)))
        }))
      }
    };
  });

  app.get<{
    Querystring: { studioSlug?: string };
  }>("/owner/availability-blocks", async (request) => {
    const availabilityBlocks = await availabilityBlockStore.list();

    return {
      blocks: request.query.studioSlug
        ? availabilityBlocks.filter((block) => block.studioSlug === request.query.studioSlug)
        : availabilityBlocks
    };
  });

  app.post<{
    Body: Omit<OwnerAvailabilityBlock, "id">;
  }>("/owner/availability-blocks", async (request, reply) => {
    const studio = findStudioBySlug(studios, request.body.studioSlug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const room = studio.rooms.find((candidate) => candidate.id === request.body.roomId);
    if (!room) {
      return reply.code(400).send({
        error: "INVALID_AVAILABILITY_BLOCK",
        message: "Room was not found"
      });
    }

    const availabilityBlocks = await availabilityBlockStore.list();
    const block: OwnerAvailabilityBlock = {
      id: `block-${availabilityBlocks.length + 1}`,
      studioSlug: request.body.studioSlug,
      roomId: request.body.roomId,
      date: request.body.date,
      startTime: request.body.startTime,
      kind: request.body.kind ?? "hold",
      reason: request.body.reason
    };
    await availabilityBlockStore.setAll([...availabilityBlocks, block]);

    return reply.code(201).send({
      block
    });
  });

  app.delete<{ Params: { blockId: string } }>("/owner/availability-blocks/:blockId", async (request, reply) => {
    const availabilityBlocks = await availabilityBlockStore.list();
    const blockIndex = availabilityBlocks.findIndex((block) => block.id === request.params.blockId);

    if (blockIndex === -1) {
      return reply.code(404).send({
        error: "AVAILABILITY_BLOCK_NOT_FOUND",
        message: "Availability block was not found"
      });
    }

    await availabilityBlockStore.setAll(availabilityBlocks.filter((_, index) => index !== blockIndex));

    return {
      released: true
    };
  });

  app.post<{
    Body: BookingIntentRequest & { studioSlug: string };
  }>("/booking-requests", async (request, reply) => {
    const studio = findStudioBySlug(studios, request.body.studioSlug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    try {
      const booking = createBookingIntent(studio, request.body);
      const bookingIntents = await bookingIntentStore.list();
      await bookingIntentStore.setAll([...bookingIntents, booking]);

      return reply.code(201).send({
        booking
      });
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_BOOKING_REQUEST",
        message: error instanceof Error ? error.message : "Booking request is invalid"
      });
    }
  });

  app.get<{
    Querystring: {
      guestEmail?: string;
    };
  }>("/bookings", async (request) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookings = request.query.guestEmail
      ? bookingIntents.filter((booking) => booking.guestEmail === request.query.guestEmail)
      : bookingIntents;

    return {
      bookings
    };
  });

  app.post<{
    Params: { bookingId: string };
    Body: StudioReviewRequest;
  }>("/bookings/:bookingId/review", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const booking = bookingIntents.find((candidate) => candidate.id === request.params.bookingId);

    if (!booking) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    if (booking.status !== "completed") {
      return reply.code(400).send({
        error: "BOOKING_NOT_COMPLETED",
        message: "Only completed bookings can be reviewed"
      });
    }

    if (reviews.some((review) => review.bookingId === booking.id)) {
      return reply.code(409).send({
        error: "REVIEW_ALREADY_EXISTS",
        message: "This booking already has a review"
      });
    }

    const studioIndex = studios.findIndex((studio) => studio.slug === booking.studioSlug);
    if (studioIndex === -1) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    try {
      const studio = applyStudioReview(studios[studioIndex], request.body.rating);
      studios[studioIndex] = studio;
      reviewCount += 1;
      const review: StudioReview = {
        id: `review-${reviewCount}`,
        bookingId: booking.id,
        studioSlug: booking.studioSlug,
        guestName: booking.guestName,
        rating: request.body.rating,
        comment: request.body.comment.trim(),
        createdAt: new Date().toISOString()
      };
      reviews.push(review);

      return reply.code(201).send({
        review,
        studio
      });
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_REVIEW",
        message: error instanceof Error ? error.message : "Review is invalid"
      });
    }
  });

  app.post<{
    Params: { bookingId: string };
  }>("/bookings/:bookingId/payment", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookingIndex = bookingIntents.findIndex((booking) => booking.id === request.params.bookingId);

    if (bookingIndex === -1) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    try {
      const booking = markBookingPaid(bookingIntents[bookingIndex]);
      bookingIntents[bookingIndex] = booking;
      await bookingIntentStore.setAll(bookingIntents);

      return {
        booking
      };
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_PAYMENT_STATE",
        message: error instanceof Error ? error.message : "Booking cannot be paid"
      });
    }
  });

  app.get<{
    Querystring: {
      studioSlug?: string;
    };
  }>("/owner/bookings", async (request) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookings = request.query.studioSlug
      ? bookingIntents.filter((booking) => booking.studioSlug === request.query.studioSlug)
      : bookingIntents;

    return {
      bookings
    };
  });

  app.patch<{
    Params: { bookingId: string };
    Body: { decision: OwnerBookingDecision; ownerNote?: string };
  }>("/owner/bookings/:bookingId", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookingIndex = bookingIntents.findIndex((booking) => booking.id === request.params.bookingId);

    if (bookingIndex === -1) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    try {
      const booking = decideBookingIntent(
        bookingIntents[bookingIndex],
        request.body.decision,
        request.body.ownerNote
      );
      bookingIntents[bookingIndex] = booking;
      await bookingIntentStore.setAll(bookingIntents);

      return {
        booking
      };
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_BOOKING_DECISION",
        message: error instanceof Error ? error.message : "Booking decision is invalid"
      });
    }
  });

  app.post<{
    Params: { bookingId: string };
  }>("/owner/bookings/:bookingId/complete", async (request, reply) => {
    const bookingIntents = await bookingIntentStore.list();
    const bookingIndex = bookingIntents.findIndex((booking) => booking.id === request.params.bookingId);

    if (bookingIndex === -1) {
      return reply.code(404).send({
        error: "BOOKING_NOT_FOUND",
        message: "Booking request was not found"
      });
    }

    try {
      const booking = markBookingCompleted(bookingIntents[bookingIndex]);
      bookingIntents[bookingIndex] = booking;
      await bookingIntentStore.setAll(bookingIntents);

      return {
        booking
      };
    } catch (error) {
      return reply.code(400).send({
        error: "INVALID_BOOKING_COMPLETION",
        message: error instanceof Error ? error.message : "Booking cannot be completed"
      });
    }
  });

  app.patch<{
    Params: { slug: string };
    Body: OwnerListingUpdate;
  }>("/owner/studios/:slug", async (request, reply) => {
    const studioIndex = studios.findIndex((studio) => studio.slug === request.params.slug);

    if (studioIndex === -1) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    if (request.body.priceFrom !== undefined && request.body.priceFrom <= 0) {
      return reply.code(400).send({
        error: "INVALID_LISTING_UPDATE",
        message: "Price must be greater than zero"
      });
    }

    if (request.body.rooms?.some((room) => room.pricePerHour <= 0)) {
      return reply.code(400).send({
        error: "INVALID_LISTING_UPDATE",
        message: "Room price must be greater than zero"
      });
    }

    const current = studios[studioIndex];
    const updated = {
      ...current,
      tagline: request.body.tagline ?? current.tagline,
      description: request.body.description ?? current.description,
      priceFrom: request.body.priceFrom ?? current.priceFrom,
      bookingMode: request.body.bookingMode ?? current.bookingMode,
      shootTypes: request.body.shootTypes ?? current.shootTypes,
      featureIds: request.body.featureIds ?? current.featureIds,
      equipmentIds: request.body.equipmentIds ?? current.equipmentIds,
      amenityIds: request.body.amenityIds ?? current.amenityIds,
      rules: request.body.rules ?? current.rules,
      images: request.body.images ?? current.images,
      rooms: request.body.rooms ?? current.rooms,
      props: request.body.props ?? current.props,
      accessNotes: request.body.accessNotes ?? current.accessNotes,
      cancellationPolicy: request.body.cancellationPolicy ?? current.cancellationPolicy,
      listingStatus: request.body.listingStatus ?? current.listingStatus
    };
    studios[studioIndex] = updated;

    return {
      studio: updated
    };
  });

  app.get("/admin/listing-reviews", async (_request, reply) => {
    const forbidden = await requireAdmin(reply);
    if (forbidden) return forbidden;

    return {
      reviews: studios
        .filter((studio) => studio.listingStatus === "in_review")
        .map(toListingReviewItem)
    };
  });

  app.patch<{
    Params: { slug: string };
    Body: { decision?: ListingReviewDecision };
  }>("/admin/studios/:slug/review", async (request, reply) => {
    const forbidden = await requireAdmin(reply);
    if (forbidden) return forbidden;

    if (request.body.decision !== "approve" && request.body.decision !== "reject") {
      return reply.code(400).send({
        error: "INVALID_LISTING_REVIEW_DECISION",
        message: "Review decision must be approve or reject"
      });
    }

    const studioIndex = studios.findIndex((studio) => studio.slug === request.params.slug);
    if (studioIndex === -1) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const updated = {
      ...studios[studioIndex],
      listingStatus: request.body.decision === "approve" ? "published" as const : "draft" as const
    };
    studios[studioIndex] = updated;

    return {
      studio: updated
    };
  });

  app.get("/taxonomy", async () => ({
    taxonomy
  }));

  app.post<{
    Body: {
      studioSlugs: string[];
      items?: SharedShortlistItem[];
    };
  }>("/shortlists", async (request, reply) => {
    const studioSlugs = Array.from(new Set(request.body.studioSlugs ?? []));

    if (!studioSlugs.length) {
      return reply.code(400).send({
        error: "INVALID_SHORTLIST",
        message: "Shortlist must include at least one studio"
      });
    }

    const missingSlug = studioSlugs.find((slug) => !findStudioBySlug(studios, slug));
    if (missingSlug) {
      return reply.code(400).send({
        error: "INVALID_SHORTLIST",
        message: `Studio ${missingSlug} was not found`
      });
    }

    const items = studioSlugs.map((studioSlug) => ({
      studioSlug,
      ...request.body.items?.find((item) => item.studioSlug === studioSlug)
    }));
    const shortlists = await shortlistStore.list();
    const shortlist: SharedShortlist = {
      id: `shortlist-${shortlists.length + 1}`,
      studioSlugs,
      items,
      createdAt: new Date().toISOString()
    };
    await shortlistStore.setAll([...shortlists, shortlist]);

    return reply.code(201).send({
      shortlist
    });
  });

  app.get<{ Params: { shortlistId: string } }>("/shortlists/:shortlistId", async (request, reply) => {
    const shortlists = await shortlistStore.list();
    const shortlist = shortlists.find((item) => item.id === request.params.shortlistId);

    if (!shortlist) {
      return reply.code(404).send({
        error: "SHORTLIST_NOT_FOUND",
        message: "Shortlist was not found"
      });
    }

    return {
      shortlist
    };
  });

  app.patch<{
    Params: { shortlistId: string };
    Body: {
      items: SharedShortlistItem[];
    };
  }>("/shortlists/:shortlistId", async (request, reply) => {
    const shortlists = await shortlistStore.list();
    const shortlistIndex = shortlists.findIndex((item) => item.id === request.params.shortlistId);

    if (shortlistIndex === -1) {
      return reply.code(404).send({
        error: "SHORTLIST_NOT_FOUND",
        message: "Shortlist was not found"
      });
    }

    const shortlist = shortlists[shortlistIndex];
    const invalidItem = request.body.items.find((item) => !shortlist.studioSlugs.includes(item.studioSlug));
    if (invalidItem) {
      return reply.code(400).send({
        error: "INVALID_SHORTLIST",
        message: `Studio ${invalidItem.studioSlug} is not part of this shortlist`
      });
    }

    const updated: SharedShortlist = {
      ...shortlist,
      items: shortlist.studioSlugs.map((studioSlug) => ({
        studioSlug,
        ...request.body.items.find((item) => item.studioSlug === studioSlug)
      }))
    };
    shortlists[shortlistIndex] = updated;
    await shortlistStore.setAll(shortlists);

    return {
      shortlist: updated
    };
  });

  return app;
};
