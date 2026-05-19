import type {
  AvailabilitySlot,
  BookingIntent,
  BookingIntentRequest,
  Studio,
  StudioAvailability
} from "./types";

const defaultStartTimes = ["09:00", "11:00", "13:00", "15:00"];

const makeId = (parts: string[]) =>
  parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-");

export const getAvailabilityForStudio = (
  studio: Studio,
  date: string,
  durationHours = 2
): StudioAvailability => {
  const slots: AvailabilitySlot[] = studio.rooms.flatMap((room) =>
    defaultStartTimes.map((startTime) => ({
      id: makeId([studio.slug, room.id, date, startTime]),
      studioSlug: studio.slug,
      roomId: room.id,
      roomName: room.name,
      date,
      startTime,
      durationHours,
      bookingMode: room.bookingMode,
      price: room.pricePerHour * durationHours,
      currency: studio.currency,
      available: true
    }))
  );

  return {
    studioSlug: studio.slug,
    date,
    slots
  };
};

export const createBookingIntent = (
  studio: Studio,
  request: BookingIntentRequest
): BookingIntent => {
  const room = studio.rooms.find((candidate) => candidate.id === request.roomId);

  if (!room) {
    throw new Error("Room was not found");
  }

  if (request.durationHours < 1) {
    throw new Error("Duration must be at least 1 hour");
  }

  const status = room.bookingMode === "instant" ? "awaiting_payment" : "pending_owner_approval";

  return {
    id: makeId([studio.slug, room.id, request.date, request.startTime, request.guestEmail]),
    studioSlug: studio.slug,
    studioName: studio.name,
    roomId: room.id,
    roomName: room.name,
    date: request.date,
    startTime: request.startTime,
    durationHours: request.durationHours,
    bookingMode: room.bookingMode,
    status,
    totalPrice: room.pricePerHour * request.durationHours,
    currency: studio.currency,
    guestName: request.guestName,
    guestEmail: request.guestEmail,
    shootType: request.shootType,
    message: request.message
  };
};
