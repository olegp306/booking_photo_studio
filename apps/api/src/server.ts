import cors from "@fastify/cors";
import Fastify from "fastify";
import {
  createBookingIntent,
  decideBookingIntent,
  findStudioBySlug,
  getAvailabilityForStudio,
  searchStudios,
  seedStudios,
  taxonomy,
  type AmenityId,
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
  type StudioSearchFilters
} from "@studio-market/shared";

const toArray = <T extends string>(value: string | string[] | undefined): T[] | undefined => {
  if (!value) return undefined;
  const values = Array.isArray(value) ? value : value.split(",");
  return values.map((item) => item.trim()).filter(Boolean) as T[];
};

export const buildServer = () => {
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
    rules: [...studio.rules]
  }));
  const bookingIntents: BookingIntent[] = [];
  const shortlists: SharedShortlist[] = [];
  const availabilityBlocks: OwnerAvailabilityBlock[] = [];

  app.register(cors, {
    origin: true
  });

  app.get("/health", async () => ({
    ok: true,
    service: "studio-market-api"
  }));

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

    return {
      availability: {
        ...availability,
        slots: availability.slots.map((slot) => ({
          ...slot,
          available:
            slot.available &&
            !availabilityBlocks.some(
              (block) =>
                block.studioSlug === slot.studioSlug &&
                block.roomId === slot.roomId &&
                block.date === slot.date &&
                block.startTime === slot.startTime
            )
        }))
      }
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

    const block: OwnerAvailabilityBlock = {
      id: `block-${availabilityBlocks.length + 1}`,
      studioSlug: request.body.studioSlug,
      roomId: request.body.roomId,
      date: request.body.date,
      startTime: request.body.startTime,
      reason: request.body.reason
    };
    availabilityBlocks.push(block);

    return reply.code(201).send({
      block
    });
  });

  app.delete<{ Params: { blockId: string } }>("/owner/availability-blocks/:blockId", async (request, reply) => {
    const blockIndex = availabilityBlocks.findIndex((block) => block.id === request.params.blockId);

    if (blockIndex === -1) {
      return reply.code(404).send({
        error: "AVAILABILITY_BLOCK_NOT_FOUND",
        message: "Availability block was not found"
      });
    }

    availabilityBlocks.splice(blockIndex, 1);

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
      bookingIntents.push(booking);

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
    const bookings = request.query.guestEmail
      ? bookingIntents.filter((booking) => booking.guestEmail === request.query.guestEmail)
      : bookingIntents;

    return {
      bookings
    };
  });

  app.get<{
    Querystring: {
      studioSlug?: string;
    };
  }>("/owner/bookings", async (request) => {
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
      images: request.body.images ?? current.images
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
    const shortlist: SharedShortlist = {
      id: `shortlist-${shortlists.length + 1}`,
      studioSlugs,
      items,
      createdAt: new Date().toISOString()
    };
    shortlists.push(shortlist);

    return reply.code(201).send({
      shortlist
    });
  });

  app.get<{ Params: { shortlistId: string } }>("/shortlists/:shortlistId", async (request, reply) => {
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

    return {
      shortlist: updated
    };
  });

  return app;
};
