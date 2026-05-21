import type {
  AvailabilitySlot,
  BookingIntent,
  BookingIntentRequest,
  OwnerBookingDecision,
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

  const status = room.bookingMode === "instant" ? "confirmed" : "pending_owner_approval";

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

export const decideBookingIntent = (
  booking: BookingIntent,
  decision: OwnerBookingDecision,
  ownerNote?: string
): BookingIntent => {
  if (booking.status !== "pending_owner_approval") {
    throw new Error("Only pending owner approval bookings can be decided");
  }

  return {
    ...booking,
    status: decision === "approve" ? "confirmed" : "declined",
    ownerNote
  };
};

export const markBookingPaid = (booking: BookingIntent): BookingIntent => {
  if (booking.status !== "awaiting_payment") {
    throw new Error("Only bookings awaiting payment can be confirmed");
  }

  return {
    ...booking,
    status: "confirmed"
  };
};

export const markBookingCompleted = (booking: BookingIntent): BookingIntent => {
  if (booking.status !== "confirmed") {
    throw new Error("Only confirmed bookings can be completed");
  }

  return {
    ...booking,
    status: "completed"
  };
};

export const applyStudioReview = (studio: Studio, rating: number): Studio => {
  if (rating < 1 || rating > 5) {
    throw new Error("Review rating must be between 1 and 5");
  }

  const reviewCount = studio.reviewCount + 1;
  const ratingTotal = studio.rating * studio.reviewCount + rating;

  return {
    ...studio,
    rating: Number((ratingTotal / reviewCount).toFixed(2)),
    reviewCount
  };
};
