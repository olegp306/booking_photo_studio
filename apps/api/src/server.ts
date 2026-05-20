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
  type OwnerListingUpdate,
  type OwnerBookingDecision,
  type OwnerAvailabilityBlock,
  type SharedShortlist,
  type SharedShortlistItem,
  type ShootType,
  type StudioReview,
  type StudioReviewRequest,
  type StudioSearchFilters
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

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "studio-market-api"
  }));

  app.get("/readiness", async () => getLaunchReadiness(config));

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
