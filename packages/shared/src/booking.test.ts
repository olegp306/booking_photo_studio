import { describe, expect, it } from "vitest";
import {
  createBookingIntent,
  decideBookingIntent,
  applyStudioReview,
  getAvailabilityForStudio,
  markBookingCompleted,
  markBookingPaid
} from "./booking";
import { seedStudios } from "./seedStudios";

const lumen = seedStudios[0];

describe("booking domain", () => {
  it("returns bookable availability slots for each studio room", () => {
    const availability = getAvailabilityForStudio(lumen, "2026-06-12");

    expect(availability.studioSlug).toBe("studio-lumen-karlin");
    expect(availability.slots).toContainEqual(
      expect.objectContaining({
        roomId: "lumen-main",
        startTime: "09:00",
        durationHours: 2,
        bookingMode: "instant",
        price: 2600
      })
    );
    expect(availability.slots).toContainEqual(
      expect.objectContaining({
        roomId: "lumen-product",
        bookingMode: "request"
      })
    );
  });

  it("creates confirmed direct-payment intent for instant-booking rooms", () => {
    const intent = createBookingIntent(lumen, {
      roomId: "lumen-main",
      date: "2026-06-12",
      startTime: "09:00",
      durationHours: 2,
      guestName: "Olga Photographer",
      guestEmail: "olga@example.com",
      shootType: "portrait",
      message: "Small portrait session"
    });

    expect(intent.status).toBe("confirmed");
    expect(intent.bookingMode).toBe("instant");
    expect(intent.totalPrice).toBe(2600);
  });

  it("creates pending owner approval intent for request-to-book rooms", () => {
    const intent = createBookingIntent(lumen, {
      roomId: "lumen-product",
      date: "2026-06-12",
      startTime: "11:00",
      durationHours: 2,
      guestName: "Marta Client",
      guestEmail: "marta@example.com",
      shootType: "product",
      message: "Need product table"
    });

    expect(intent.status).toBe("pending_owner_approval");
    expect(intent.bookingMode).toBe("request");
    expect(intent.totalPrice).toBe(1400);
  });

  it("rejects booking requests for unknown rooms", () => {
    expect(() =>
      createBookingIntent(lumen, {
        roomId: "missing-room",
        date: "2026-06-12",
        startTime: "09:00",
        durationHours: 2,
        guestName: "Test User",
        guestEmail: "test@example.com",
        shootType: "portrait",
        message: "Test"
      })
    ).toThrow("Room was not found");
  });

  it("moves approved request bookings into direct-payment confirmation", () => {
    const intent = createBookingIntent(lumen, {
      roomId: "lumen-product",
      date: "2026-06-12",
      startTime: "11:00",
      durationHours: 2,
      guestName: "Marta Client",
      guestEmail: "marta@example.com",
      shootType: "product",
      message: "Need product table"
    });

    const approved = decideBookingIntent(intent, "approve");

    expect(approved.status).toBe("confirmed");
  });

  it("declines request bookings with an owner note", () => {
    const intent = createBookingIntent(lumen, {
      roomId: "lumen-product",
      date: "2026-06-12",
      startTime: "11:00",
      durationHours: 2,
      guestName: "Marta Client",
      guestEmail: "marta@example.com",
      shootType: "product",
      message: "Need product table"
    });

    const declined = decideBookingIntent(intent, "decline", "Room is already blocked for a campaign.");

    expect(declined.status).toBe("declined");
    expect(declined.ownerNote).toBe("Room is already blocked for a campaign.");
  });

  it("confirms bookings after payment is captured", () => {
    const intent = createBookingIntent(lumen, {
      roomId: "lumen-main",
      date: "2026-06-12",
      startTime: "09:00",
      durationHours: 2,
      guestName: "Olga Photographer",
      guestEmail: "olga@example.com",
      shootType: "portrait",
      message: "Small portrait session"
    });

    const awaitingPayment = { ...intent, status: "awaiting_payment" as const };
    const confirmed = markBookingPaid(awaitingPayment);

    expect(confirmed.status).toBe("confirmed");
  });

  it("completes confirmed bookings after the shoot", () => {
    const intent = createBookingIntent(lumen, {
      roomId: "lumen-main",
      date: "2026-06-12",
      startTime: "09:00",
      durationHours: 2,
      guestName: "Olga Photographer",
      guestEmail: "olga@example.com",
      shootType: "portrait",
      message: "Small portrait session"
    });
    const completed = markBookingCompleted(intent);

    expect(completed.status).toBe("completed");
  });

  it("updates studio review summary after a completed booking review", () => {
    const reviewed = applyStudioReview(lumen, 3);

    expect(reviewed.reviewCount).toBe(129);
    expect(reviewed.rating).toBe(4.91);
  });
});
