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
});
