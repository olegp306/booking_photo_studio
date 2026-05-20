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
