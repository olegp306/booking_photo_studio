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
  type OwnerBookingDecision,
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
  const bookingIntents: BookingIntent[] = [];

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
      studios: searchStudios(seedStudios, filters),
      total: searchStudios(seedStudios, filters).length
    };
  });

  app.get<{ Params: { slug: string } }>("/studios/:slug", async (request, reply) => {
    const studio = findStudioBySlug(seedStudios, request.params.slug);

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
    const studio = findStudioBySlug(seedStudios, request.params.slug);

    if (!studio) {
      return reply.code(404).send({
        error: "STUDIO_NOT_FOUND",
        message: "Studio was not found"
      });
    }

    const date = request.query.date ?? new Date().toISOString().slice(0, 10);
    const durationHours = request.query.durationHours ? Number(request.query.durationHours) : 2;

    return {
      availability: getAvailabilityForStudio(studio, date, durationHours)
    };
  });

  app.post<{
    Body: BookingIntentRequest & { studioSlug: string };
  }>("/booking-requests", async (request, reply) => {
    const studio = findStudioBySlug(seedStudios, request.body.studioSlug);

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

  app.get("/taxonomy", async () => ({
    taxonomy
  }));

  return app;
};
