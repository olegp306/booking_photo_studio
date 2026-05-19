import { describe, expect, it } from "vitest";
import { createBookingIntent, getAvailabilityForStudio } from "./booking";
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

  it("creates awaiting payment intent for instant-booking rooms", () => {
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

    expect(intent.status).toBe("awaiting_payment");
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
});
