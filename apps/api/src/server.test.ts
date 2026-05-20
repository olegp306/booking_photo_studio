import { describe, expect, it } from "vitest";
import { buildServer } from "./server";

describe("studio API", () => {
  it("returns health status", async () => {
    const server = buildServer();
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      ok: true,
      service: "studio-market-api"
    });
  });

  it("searches studios by equipment", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/studios?equipmentIds=smoke-machine"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studios).toHaveLength(1);
    expect(response.json().studios[0].slug).toBe("framehouse-smichov");
  });

  it("returns studio detail by slug", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studio.name).toBe("Studio Lumen Karlin");
  });

  it("returns 404 for missing studio", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/studios/missing"
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("STUDIO_NOT_FOUND");
  });

  it("returns availability slots for a studio", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin/availability?date=2026-06-12"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().availability.slots[0]).toEqual(
      expect.objectContaining({
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00"
      })
    );
  });

  it("lets owners block a slot from public availability", async () => {
    const server = buildServer();
    const block = await server.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        reason: "Maintenance"
      }
    });

    expect(block.statusCode).toBe(201);
    expect(block.json().block).toEqual(
      expect.objectContaining({
        id: "block-1",
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        reason: "Maintenance"
      })
    );

    const availability = await server.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin/availability?date=2026-06-12"
    });

    expect(
      availability
        .json()
        .availability.slots.find((slot: { roomId: string; startTime: string }) => slot.roomId === "lumen-main" && slot.startTime === "09:00")
    ).toEqual(
      expect.objectContaining({
        available: false
      })
    );
  });

  it("lets owners close a room for a full day", async () => {
    const server = buildServer();
    const block = await server.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "full-day",
        reason: "Private production"
      }
    });

    expect(block.statusCode).toBe(201);
    expect(block.json().block).toEqual(
      expect.objectContaining({
        startTime: "full-day",
        reason: "Private production"
      })
    );

    const availability = await server.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin/availability?date=2026-06-12"
    });
    const mainRoomSlots = availability
      .json()
      .availability.slots.filter((slot: { roomId: string }) => slot.roomId === "lumen-main");
    const productRoomSlot = availability
      .json()
      .availability.slots.find((slot: { roomId: string; startTime: string }) => slot.roomId === "lumen-product" && slot.startTime === "09:00");

    expect(mainRoomSlots.every((slot: { available: boolean }) => !slot.available)).toBe(true);
    expect(productRoomSlot).toEqual(
      expect.objectContaining({
        available: true
      })
    );
  });

  it("lets owners open a selected slot over a full-day closure", async () => {
    const server = buildServer();
    await server.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "full-day",
        reason: "Private production"
      }
    });
    const override = await server.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "13:00",
        kind: "open",
        reason: "Public slot added back"
      }
    });

    expect(override.statusCode).toBe(201);
    expect(override.json().block).toEqual(
      expect.objectContaining({
        startTime: "13:00",
        kind: "open"
      })
    );

    const availability = await server.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin/availability?date=2026-06-12"
    });
    const slots = availability.json().availability.slots as Array<{ roomId: string; startTime: string; available: boolean }>;

    expect(slots.find((slot) => slot.roomId === "lumen-main" && slot.startTime === "13:00")).toEqual(
      expect.objectContaining({
        available: true
      })
    );
    expect(slots.find((slot) => slot.roomId === "lumen-main" && slot.startTime === "09:00")).toEqual(
      expect.objectContaining({
        available: false
      })
    );
  });

  it("returns owner availability blocks for a studio", async () => {
    const server = buildServer();
    await server.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        reason: "Maintenance"
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/owner/availability-blocks?studioSlug=studio-lumen-karlin"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().blocks).toEqual([
      expect.objectContaining({
        id: "block-1",
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        startTime: "09:00",
        kind: "hold",
        reason: "Maintenance"
      })
    ]);
  });

  it("lets owners release a blocked availability slot", async () => {
    const server = buildServer();
    await server.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        reason: "Maintenance"
      }
    });

    const released = await server.inject({
      method: "DELETE",
      url: "/owner/availability-blocks/block-1"
    });

    expect(released.statusCode).toBe(200);
    expect(released.json()).toEqual({
      released: true
    });

    const availability = await server.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin/availability?date=2026-06-12"
    });

    expect(
      availability
        .json()
        .availability.slots.find((slot: { roomId: string; startTime: string }) => slot.roomId === "lumen-main" && slot.startTime === "09:00")
    ).toEqual(
      expect.objectContaining({
        available: true
      })
    );
  });

  it("creates booking requests with hybrid status logic", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-product",
        date: "2026-06-12",
        startTime: "11:00",
        durationHours: 2,
        guestName: "Marta Client",
        guestEmail: "marta@example.com",
        shootType: "product",
        message: "Need product table"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().booking).toEqual(
      expect.objectContaining({
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-product",
        status: "pending_owner_approval",
        totalPrice: 1400
      })
    );
  });

  it("lets owners review and approve incoming booking requests", async () => {
    const server = buildServer();
    const created = await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-product",
        date: "2026-06-12",
        startTime: "11:00",
        durationHours: 2,
        guestName: "Marta Client",
        guestEmail: "marta@example.com",
        shootType: "product",
        message: "Need product table"
      }
    });
    const bookingId = created.json().booking.id;

    const inbox = await server.inject({
      method: "GET",
      url: "/owner/bookings?studioSlug=studio-lumen-karlin"
    });
    expect(inbox.statusCode).toBe(200);
    expect(inbox.json().bookings).toHaveLength(1);

    const approved = await server.inject({
      method: "PATCH",
      url: `/owner/bookings/${bookingId}`,
      payload: {
        decision: "approve"
      }
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json().booking.status).toBe("awaiting_payment");
  });

  it("lets owners update listing basics", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/owner/studios/studio-lumen-karlin",
      payload: {
        tagline: "Soft editorial loft for portraits",
        description: "A daylight studio for fashion and product shoots.",
        priceFrom: 1450,
        bookingMode: "request",
        shootTypes: ["fashion", "product"],
        featureIds: ["natural-light", "cyclorama"],
        equipmentIds: ["softboxes"],
        amenityIds: ["makeup-station"],
        rules: ["Minimum booking 2 hours", "No glitter"]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studio).toEqual(
      expect.objectContaining({
        slug: "studio-lumen-karlin",
        tagline: "Soft editorial loft for portraits",
        description: "A daylight studio for fashion and product shoots.",
        priceFrom: 1450,
        bookingMode: "request",
        shootTypes: ["fashion", "product"],
        featureIds: ["natural-light", "cyclorama"],
        equipmentIds: ["softboxes"],
        amenityIds: ["makeup-station"],
        rules: ["Minimum booking 2 hours", "No glitter"]
      })
    );
  });

  it("lets owners update room details and pricing", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/owner/studios/studio-lumen-karlin",
      payload: {
        rooms: [
          {
            id: "lumen-main",
            name: "Main Daylight Room",
            summary: "Updated daylight room for editorial portraits.",
            areaSqm: 72,
            ceilingHeightM: 3.8,
            capacity: 10,
            pricePerHour: 1550,
            bookingMode: "hybrid",
            featureIds: ["natural-light", "cyclorama"],
            equipmentIds: ["strobes", "softboxes", "c-stands"],
            imageIds: ["lumen-room-main"]
          },
          {
            id: "lumen-product",
            name: "Product Corner",
            summary: "Compact tabletop set for product work.",
            areaSqm: 24,
            ceilingHeightM: 3.2,
            capacity: 4,
            pricePerHour: 900,
            bookingMode: "instant",
            featureIds: ["product-table", "paper-backdrops"],
            equipmentIds: ["continuous-lights", "tripods"],
            imageIds: ["lumen-product"]
          }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studio.rooms).toEqual([
      expect.objectContaining({
        id: "lumen-main",
        summary: "Updated daylight room for editorial portraits.",
        pricePerHour: 1550
      }),
      expect.objectContaining({
        id: "lumen-product",
        pricePerHour: 900,
        bookingMode: "instant"
      })
    ]);
  });

  it("returns customer bookings by guest email", async () => {
    const server = buildServer();
    await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-product",
        date: "2026-06-12",
        startTime: "11:00",
        durationHours: 2,
        guestName: "Marta Client",
        guestEmail: "marta@example.com",
        shootType: "product",
        message: "Need product table"
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/bookings?guestEmail=marta@example.com"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().bookings).toHaveLength(1);
    expect(response.json().bookings[0]).toEqual(
      expect.objectContaining({
        guestEmail: "marta@example.com",
        studioName: "Studio Lumen Karlin",
        status: "pending_owner_approval"
      })
    );
  });

  it("confirms a booking after customer payment", async () => {
    const server = buildServer();
    const created = await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        durationHours: 2,
        guestName: "Olga Photographer",
        guestEmail: "olga@example.com",
        shootType: "portrait",
        message: "Small portrait session"
      }
    });
    const bookingId = created.json().booking.id;

    const paid = await server.inject({
      method: "POST",
      url: `/bookings/${bookingId}/payment`
    });

    expect(paid.statusCode).toBe(200);
    expect(paid.json().booking.status).toBe("confirmed");

    const customerBookings = await server.inject({
      method: "GET",
      url: "/bookings?guestEmail=olga@example.com"
    });
    expect(customerBookings.json().bookings[0].status).toBe("confirmed");
  });

  it("lets owners complete confirmed bookings", async () => {
    const server = buildServer();
    const created = await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        durationHours: 2,
        guestName: "Olga Photographer",
        guestEmail: "olga@example.com",
        shootType: "portrait",
        message: "Small portrait session"
      }
    });
    const bookingId = created.json().booking.id;
    await server.inject({
      method: "POST",
      url: `/bookings/${bookingId}/payment`
    });

    const completed = await server.inject({
      method: "POST",
      url: `/owner/bookings/${bookingId}/complete`
    });

    expect(completed.statusCode).toBe(200);
    expect(completed.json().booking.status).toBe("completed");
  });

  it("accepts customer reviews for completed bookings", async () => {
    const server = buildServer();
    const created = await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        durationHours: 2,
        guestName: "Olga Photographer",
        guestEmail: "olga@example.com",
        shootType: "portrait",
        message: "Small portrait session"
      }
    });
    const bookingId = created.json().booking.id;
    await server.inject({ method: "POST", url: `/bookings/${bookingId}/payment` });
    await server.inject({ method: "POST", url: `/owner/bookings/${bookingId}/complete` });

    const reviewed = await server.inject({
      method: "POST",
      url: `/bookings/${bookingId}/review`,
      payload: {
        rating: 3,
        comment: "Good daylight, check-in could be smoother."
      }
    });

    expect(reviewed.statusCode).toBe(201);
    expect(reviewed.json().review).toEqual(
      expect.objectContaining({
        bookingId,
        studioSlug: "studio-lumen-karlin",
        rating: 3,
        comment: "Good daylight, check-in could be smoother."
      })
    );
    expect(reviewed.json().studio).toEqual(
      expect.objectContaining({
        rating: 4.91,
        reviewCount: 129
      })
    );
  });

  it("creates and returns shared shortlists", async () => {
    const server = buildServer();
    const created = await server.inject({
      method: "POST",
      url: "/shortlists",
      payload: {
        studioSlugs: ["studio-lumen-karlin", "atelier-rosa-vinohrady"],
        items: [
          {
            studioSlug: "studio-lumen-karlin",
            decision: "favourite",
            note: "Best daylight for the hero shots."
          },
          {
            studioSlug: "atelier-rosa-vinohrady",
            decision: "backup"
          }
        ]
      }
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().shortlist).toEqual(
      expect.objectContaining({
        id: "shortlist-1",
        studioSlugs: ["studio-lumen-karlin", "atelier-rosa-vinohrady"]
      })
    );

    const loaded = await server.inject({
      method: "GET",
      url: "/shortlists/shortlist-1"
    });

    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().shortlist.items).toEqual([
      {
        studioSlug: "studio-lumen-karlin",
        decision: "favourite",
        note: "Best daylight for the hero shots."
      },
      {
        studioSlug: "atelier-rosa-vinohrady",
        decision: "backup"
      }
    ]);
  });

  it("updates shared shortlist decisions and notes", async () => {
    const server = buildServer();
    await server.inject({
      method: "POST",
      url: "/shortlists",
      payload: {
        studioSlugs: ["studio-lumen-karlin", "atelier-rosa-vinohrady"]
      }
    });

    const updated = await server.inject({
      method: "PATCH",
      url: "/shortlists/shortlist-1",
      payload: {
        items: [
          {
            studioSlug: "studio-lumen-karlin",
            decision: "favourite",
            note: "Client prefers daylight."
          },
          {
            studioSlug: "atelier-rosa-vinohrady",
            decision: "backup"
          }
        ]
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().shortlist.items).toEqual([
      {
        studioSlug: "studio-lumen-karlin",
        decision: "favourite",
        note: "Client prefers daylight."
      },
      {
        studioSlug: "atelier-rosa-vinohrady",
        decision: "backup"
      }
    ]);

    const loaded = await server.inject({
      method: "GET",
      url: "/shortlists/shortlist-1"
    });

    expect(loaded.json().shortlist.items[0].note).toBe("Client prefers daylight.");
  });
});
