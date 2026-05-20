import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  it("reports launch readiness without exposing secrets", async () => {
    const server = buildServer({
      config: {
        openaiApiKey: "",
        telegramBotToken: "",
        publicAppUrl: "",
        stripeSecretKey: ""
      }
    });
    const response = await server.inject({ method: "GET", url: "/readiness" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        envFile: ".env.local",
        services: expect.objectContaining({
          openai: expect.objectContaining({
            configured: false,
            env: "OPENAI_API_KEY"
          }),
          telegram: expect.objectContaining({
            configured: false,
            env: "TELEGRAM_BOT_TOKEN"
          }),
          publicAppUrl: expect.objectContaining({
            configured: false,
            env: "PUBLIC_APP_URL"
          }),
          stripe: expect.objectContaining({
            configured: false,
            env: "STRIPE_SECRET_KEY"
          })
        }),
        nextSteps: expect.arrayContaining([
          "Fill OPENAI_API_KEY to switch listing drafts from local fallback to AI generation.",
          "Fill TELEGRAM_BOT_TOKEN before wiring the owner onboarding bot."
        ])
      })
    );
    expect(JSON.stringify(response.json())).not.toContain("sk-");
  });

  it("creates listing drafts through the AI endpoint with a local fallback", async () => {
    const server = buildServer({
      config: {
        openaiApiKey: ""
      }
    });
    const response = await server.inject({
      method: "POST",
      url: "/ai/listing-draft",
      payload: {
        transcript:
          "Soft daylight studio for fashion and product shoots with cyclorama, softboxes, c-stands, makeup station, dressing room, wifi, and product table."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        mode: "local-fallback",
        draft: expect.objectContaining({
          tagline: "Soft daylight studio for fashion and product shoots.",
          shootTypes: ["fashion", "product"],
          featureIds: expect.arrayContaining(["natural-light", "cyclorama"]),
          equipmentIds: expect.arrayContaining(["softboxes", "c-stands"]),
          amenityIds: expect.arrayContaining(["makeup-station", "dressing-room", "wifi"])
        })
      })
    );
  });

  it("uses OpenAI for listing drafts when an API key is configured", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const server = buildServer({
      config: {
        openaiApiKey: "sk-test-openai",
        openaiListingModel: "gpt-test-listing"
      },
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              tagline: "AI-crafted daylight loft for campaign shoots.",
              description: "AI structured description",
              shootTypes: ["fashion", "product"],
              featureIds: ["natural-light", "cyclorama"],
              equipmentIds: ["softboxes"],
              amenityIds: ["makeup-station"],
              rules: ["Minimum booking is 2 hours."]
            })
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/ai/listing-draft",
      payload: {
        transcript: "Daylight studio for campaign shoots"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        mode: "openai",
        draft: expect.objectContaining({
          tagline: "AI-crafted daylight loft for campaign shoots.",
          shootTypes: ["fashion", "product"],
          featureIds: ["natural-light", "cyclorama"]
        })
      })
    );
    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe("https://api.openai.com/v1/responses");
    expect(requests[0].init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer sk-test-openai"
      })
    );
    expect(JSON.parse(String(requests[0].init?.body))).toEqual(
      expect.objectContaining({
        model: "gpt-test-listing"
      })
    );
  });

  it("suggests media details with a local fallback", async () => {
    const server = buildServer({
      config: {
        openaiApiKey: ""
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/ai/media-suggestion",
      payload: {
        caption: "Main Daylight Room cyclorama angle with softboxes",
        imageUrl: "data:image/jpeg;base64,Y3ljbG9yYW1h",
        rooms: [
          { id: "lumen-main", name: "Main Daylight Room" },
          { id: "lumen-product", name: "Product Corner" }
        ]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        mode: "local-fallback",
        suggestion: expect.objectContaining({
          kind: "room",
          roomId: "lumen-main",
          reason: "Matched the media notes to Main Daylight Room."
        })
      })
    );
  });

  it("prioritizes equipment cues over generic image hostnames in media fallback", async () => {
    const server = buildServer({
      config: {
        openaiApiKey: ""
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/ai/media-suggestion",
      payload: {
        caption: "Lighting kit detail with softbox and stands",
        imageUrl: "https://example.com/softbox-kit.jpg",
        rooms: [{ id: "lumen-main", name: "Main Daylight Room" }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        mode: "local-fallback",
        suggestion: expect.objectContaining({
          kind: "equipment"
        })
      })
    );
  });

  it("uses OpenAI vision for media suggestions when configured", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const server = buildServer({
      config: {
        openaiApiKey: "sk-test-openai",
        openaiListingModel: "gpt-test-media"
      },
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              kind: "equipment",
              roomId: null,
              reason: "Softboxes and grip gear are the main subject."
            })
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/ai/media-suggestion",
      payload: {
        caption: "Lighting kit detail",
        imageUrl: "https://example.com/softboxes.jpg",
        rooms: [{ id: "lumen-main", name: "Main Daylight Room" }]
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        mode: "openai",
        suggestion: expect.objectContaining({
          kind: "equipment",
          reason: "Softboxes and grip gear are the main subject."
        })
      })
    );
    expect(requests[0].url).toBe("https://api.openai.com/v1/responses");
    expect(requests[0].init?.headers).toEqual(
      expect.objectContaining({
        Authorization: "Bearer sk-test-openai"
      })
    );
    expect(JSON.parse(String(requests[0].init?.body))).toEqual(
      expect.objectContaining({
        model: "gpt-test-media"
      })
    );
  });

  it("accepts Telegram owner bot listing draft webhooks", async () => {
    const telegramRequests: Array<{ url: string; init?: RequestInit }> = [];
    const server = buildServer({
      config: {
        telegramBotToken: "telegram-test-token",
        publicAppUrl: "https://studio.example.com"
      },
      fetch: async (url, init) => {
        telegramRequests.push({ url: String(url), init });
        return new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });
    const response = await server.inject({
      method: "POST",
      url: "/integrations/telegram/listing-draft",
      payload: {
        message: {
          chat: { id: 123 },
          text: "Soft daylight studio for fashion shoots with cyclorama and softboxes"
        }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        draftId: "telegram-draft-1",
        mode: "local-fallback",
        reply: expect.stringContaining("Listing draft ready"),
        webAppUrl: "https://studio.example.com",
        sentMessage: true,
        draft: expect.objectContaining({
          shootTypes: ["fashion"],
          featureIds: expect.arrayContaining(["natural-light", "cyclorama"])
        })
      })
    );
    expect(telegramRequests[0].url).toBe("https://api.telegram.org/bottelegram-test-token/sendMessage");
    expect(JSON.parse(String(telegramRequests[0].init?.body))).toEqual(
      expect.objectContaining({
        chat_id: 123,
        text: expect.stringContaining("https://studio.example.com/#telegram-drafts")
      })
    );

    const drafts = await server.inject({
      method: "GET",
      url: "/owner/listing-drafts"
    });

    expect(drafts.statusCode).toBe(200);
    expect(drafts.json().drafts).toEqual([
      expect.objectContaining({
        id: "telegram-draft-1",
        source: "telegram",
        transcript: "Soft daylight studio for fashion shoots with cyclorama and softboxes"
      })
    ]);
  });

  it("returns Telegram Mini App drafts for the owner chat", async () => {
    const server = buildServer({
      config: {
        publicAppUrl: "https://studio.example.com"
      }
    });
    await server.inject({
      method: "POST",
      url: "/integrations/telegram/listing-draft",
      payload: {
        message: {
          chat: { id: 789 },
          text: "Warm portrait studio with paper backdrops, makeup station, and wifi"
        }
      }
    });
    await server.inject({
      method: "POST",
      url: "/integrations/telegram/listing-draft",
      payload: {
        message: {
          chat: { id: 999 },
          text: "Different owner studio"
        }
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/integrations/telegram/mini-app/drafts?chatId=789"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        webAppUrl: "https://studio.example.com/#telegram-drafts",
        editorUrl: "https://studio.example.com/#profile",
        drafts: [
          expect.objectContaining({
            id: "telegram-draft-1",
            chatId: 789,
            transcript: "Warm portrait studio with paper backdrops, makeup station, and wifi",
            openEditorUrl: "https://studio.example.com/#profile"
          })
        ]
      })
    );
  });

  it("persists imported Telegram listing drafts across API restarts", async () => {
    const localDataDir = mkdtempSync(join(tmpdir(), "studio-drafts-"));
    const server = buildServer({
      config: {
        localDataDir
      }
    });

    await server.inject({
      method: "POST",
      url: "/integrations/telegram/listing-draft",
      payload: {
        message: {
          chat: { id: 456 },
          text: "Industrial daylight studio for portraits with makeup station and softboxes"
        }
      }
    });

    const restartedServer = buildServer({
      config: {
        localDataDir
      }
    });
    const drafts = await restartedServer.inject({
      method: "GET",
      url: "/owner/listing-drafts"
    });

    expect(drafts.statusCode).toBe(200);
    expect(drafts.json().drafts).toEqual([
      expect.objectContaining({
        id: "telegram-draft-1",
        source: "telegram",
        chatId: 456,
        transcript: "Industrial daylight studio for portraits with makeup station and softboxes"
      })
    ]);
  });

  it("returns and updates the current role-aware session", async () => {
    const server = buildServer();

    const current = await server.inject({
      method: "GET",
      url: "/session"
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().session).toEqual(
      expect.objectContaining({
        role: "photographer",
        displayName: "Marta Photographer"
      })
    );

    const updated = await server.inject({
      method: "PATCH",
      url: "/session",
      payload: {
        role: "studio_owner",
        displayName: "Studio Lumen Owner"
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().session).toEqual(
      expect.objectContaining({
        role: "studio_owner",
        displayName: "Studio Lumen Owner"
      })
    );
  });

  it("persists role-aware sessions across API restarts", async () => {
    const localDataDir = mkdtempSync(join(tmpdir(), "studio-session-"));
    const server = buildServer({
      config: {
        localDataDir
      }
    });
    await server.inject({
      method: "PATCH",
      url: "/session",
      payload: {
        role: "client",
        displayName: "Anna Client"
      }
    });

    const restartedServer = buildServer({
      config: {
        localDataDir
      }
    });
    const current = await restartedServer.inject({
      method: "GET",
      url: "/session"
    });

    expect(current.statusCode).toBe(200);
    expect(current.json().session).toEqual(
      expect.objectContaining({
        role: "client",
        displayName: "Anna Client"
      })
    );
  });

  it("rejects unsupported session roles", async () => {
    const server = buildServer();

    const response = await server.inject({
      method: "PATCH",
      url: "/session",
      payload: {
        role: "admin-owner"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("INVALID_SESSION_ROLE");
  });

  it("creates support tickets with session and recent activity context", async () => {
    const server = buildServer();

    const response = await server.inject({
      method: "POST",
      url: "/support/tickets",
      payload: {
        category: "idea",
        message: "I cannot tell whether the slot is confirmed.",
        includeActivity: true,
        screen: "#studio/studio-lumen-karlin",
        relatedStudioSlug: "studio-lumen-karlin",
        events: [
          {
            id: "event-1",
            type: "open_studio",
            label: "Opened Studio Lumen Karlin",
            createdAt: "2026-05-20T10:00:00.000Z",
            metadata: {
              studioSlug: "studio-lumen-karlin"
            }
          }
        ],
        userAgent: "vitest"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().ticket).toEqual(
      expect.objectContaining({
        id: "support-ticket-1",
        category: "idea",
        message: "I cannot tell whether the slot is confirmed.",
        includeActivity: true,
        screen: "#studio/studio-lumen-karlin",
        relatedStudioSlug: "studio-lumen-karlin",
        session: expect.objectContaining({
          role: "photographer"
        }),
        events: expect.arrayContaining([
          expect.objectContaining({
            type: "open_studio"
          })
        ])
      })
    );
  });

  it("triages free-text support tickets without a submitted category", async () => {
    const server = buildServer();

    const response = await server.inject({
      method: "POST",
      url: "/support/tickets",
      payload: {
        message: "Payment failed after I clicked continue to payment.",
        includeActivity: true,
        screen: "#bookings",
        events: []
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().ticket).toEqual(
      expect.objectContaining({
        id: "support-ticket-1",
        category: "payment",
        triageReason: expect.stringContaining("payment"),
        message: "Payment failed after I clicked continue to payment."
      })
    );
  });

  it("persists support tickets across API restarts", async () => {
    const localDataDir = mkdtempSync(join(tmpdir(), "studio-support-"));
    const server = buildServer({
      config: {
        localDataDir
      }
    });

    await server.inject({
      method: "POST",
      url: "/support/tickets",
      payload: {
        category: "idea",
        message: "Let photographers save a shortlist template.",
        includeActivity: false,
        screen: "#saved",
        events: []
      }
    });

    const restartedServer = buildServer({
      config: {
        localDataDir
      }
    });
    const response = await restartedServer.inject({
      method: "GET",
      url: "/support/tickets"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().tickets).toEqual([
      expect.objectContaining({
        id: "support-ticket-1",
        category: "idea",
        message: "Let photographers save a shortlist template."
      })
    ]);
  });

  it("captures referral source visits", async () => {
    const server = buildServer();

    const response = await server.inject({
      method: "POST",
      url: "/referrals",
      payload: {
        source: "photographer",
        path: "#studio/studio-lumen-karlin"
      }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().referral).toEqual(
      expect.objectContaining({
        id: "referral-1",
        source: "photographer",
        path: "#studio/studio-lumen-karlin",
        session: expect.objectContaining({
          role: "photographer"
        })
      })
    );
  });

  it("summarizes referral sources for growth tracking", async () => {
    const server = buildServer();

    await server.inject({
      method: "POST",
      url: "/referrals",
      payload: {
        source: "photographer",
        path: "#studio/studio-lumen-karlin"
      }
    });
    await server.inject({
      method: "POST",
      url: "/referrals",
      payload: {
        source: "telegram",
        path: "#telegram-drafts"
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/referrals/summary"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        total: 2,
        bySource: expect.objectContaining({
          photographer: 1,
          telegram: 1,
          studio_owner: 0,
          direct: 0,
          unknown: 0
        }),
        recent: expect.arrayContaining([
          expect.objectContaining({
            source: "telegram",
            path: "#telegram-drafts"
          })
        ])
      })
    );
  });

  it("registers a Telegram listing draft webhook when launch config is ready", async () => {
    const telegramRequests: Array<{ url: string; init?: RequestInit }> = [];
    const server = buildServer({
      config: {
        publicAppUrl: "https://studio.example.com",
        telegramBotToken: "telegram-test-token",
        telegramWebhookSecret: "expected-secret"
      },
      fetch: async (url, init) => {
        telegramRequests.push({ url: String(url), init });
        return new Response(JSON.stringify({ ok: true, result: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/integrations/telegram/webhook"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        ok: true,
        webhookUrl: "https://studio.example.com/api/integrations/telegram/listing-draft"
      })
    );
    expect(telegramRequests[0].url).toBe("https://api.telegram.org/bottelegram-test-token/setWebhook");
    expect(JSON.parse(String(telegramRequests[0].init?.body))).toEqual({
      url: "https://studio.example.com/api/integrations/telegram/listing-draft",
      secret_token: "expected-secret",
      allowed_updates: ["message"]
    });
  });

  it("reports missing Telegram webhook setup configuration", async () => {
    const server = buildServer({
      config: {
        publicAppUrl: "",
        telegramBotToken: ""
      }
    });

    const response = await server.inject({
      method: "POST",
      url: "/integrations/telegram/webhook"
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual(
      expect.objectContaining({
        error: "TELEGRAM_SETUP_NOT_READY",
        missing: ["TELEGRAM_BOT_TOKEN", "PUBLIC_APP_URL"]
      })
    );
  });

  it("rejects Telegram webhooks with a mismatched secret token", async () => {
    const server = buildServer({
      config: {
        telegramWebhookSecret: "expected-secret"
      }
    });
    const response = await server.inject({
      method: "POST",
      url: "/integrations/telegram/listing-draft",
      headers: {
        "x-telegram-bot-api-secret-token": "wrong-secret"
      },
      payload: {
        message: {
          chat: { id: 123 },
          text: "Soft daylight studio"
        }
      }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("INVALID_TELEGRAM_SECRET");
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

  it("returns a public-safe studio detail payload", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "GET",
      url: "/public/studios/studio-lumen-karlin"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studio).toEqual(
      expect.objectContaining({
        slug: "studio-lumen-karlin",
        name: "Studio Lumen Karlin",
        rooms: expect.arrayContaining([
          expect.objectContaining({
            id: "lumen-main",
            name: "Main Daylight Room"
          })
        ])
      })
    );
    expect(JSON.stringify(response.json().studio)).not.toContain("ownerName");
    expect(JSON.stringify(response.json().studio)).not.toContain("accessNotes");
    expect(JSON.stringify(response.json().studio)).not.toContain("cancellationPolicy");
    expect(JSON.stringify(response.json().studio)).not.toContain("listingStatus");
  });

  it("tracks public studio detail access metrics", async () => {
    const server = buildServer();

    await server.inject({
      method: "GET",
      url: "/public/studios/studio-lumen-karlin"
    });
    await server.inject({
      method: "GET",
      url: "/public/studios/studio-lumen-karlin"
    });

    const response = await server.inject({
      method: "GET",
      url: "/internal/public-metrics"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().metrics).toEqual([
      expect.objectContaining({
        path: "/public/studios/studio-lumen-karlin",
        count: 2
      })
    ]);
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

  it("persists owner availability blocks across API restarts", async () => {
    const localDataDir = mkdtempSync(join(tmpdir(), "studio-state-availability-"));
    const firstServer = buildServer({
      config: {
        localDataDir
      }
    });

    const block = await firstServer.inject({
      method: "POST",
      url: "/owner/availability-blocks",
      payload: {
        studioSlug: "studio-lumen-karlin",
        roomId: "lumen-main",
        date: "2026-06-12",
        startTime: "09:00",
        reason: "Private client hold"
      }
    });
    expect(block.statusCode).toBe(201);

    const restartedServer = buildServer({
      config: {
        localDataDir
      }
    });
    const blocks = await restartedServer.inject({
      method: "GET",
      url: "/owner/availability-blocks?studioSlug=studio-lumen-karlin"
    });
    const availability = await restartedServer.inject({
      method: "GET",
      url: "/studios/studio-lumen-karlin/availability?date=2026-06-12"
    });

    expect(blocks.json().blocks).toEqual([
      expect.objectContaining({
        id: "block-1",
        reason: "Private client hold"
      })
    ]);
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

  it("persists booking requests and status updates across API restarts", async () => {
    const localDataDir = mkdtempSync(join(tmpdir(), "studio-state-bookings-"));
    const firstServer = buildServer({
      config: {
        localDataDir
      }
    });
    const created = await firstServer.inject({
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
    await firstServer.inject({
      method: "PATCH",
      url: `/owner/bookings/${bookingId}`,
      payload: {
        decision: "approve",
        ownerNote: "Approved for the product corner."
      }
    });

    const restartedServer = buildServer({
      config: {
        localDataDir
      }
    });
    const loaded = await restartedServer.inject({
      method: "GET",
      url: "/owner/bookings?studioSlug=studio-lumen-karlin"
    });

    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().bookings).toEqual([
      expect.objectContaining({
        id: bookingId,
        status: "awaiting_payment",
        ownerNote: "Approved for the product corner."
      })
    ]);
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

  it("lets owners update props, access notes, and cancellation policy", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/owner/studios/studio-lumen-karlin",
      payload: {
        props: ["linen sofa", "white plinths", "paper plants"],
        accessNotes: "Use the freight lift from Pobrezni street after 19:00.",
        cancellationPolicy: "Free cancellation until 48 hours before the booking."
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studio).toEqual(
      expect.objectContaining({
        props: ["linen sofa", "white plinths", "paper plants"],
        accessNotes: "Use the freight lift from Pobrezni street after 19:00.",
        cancellationPolicy: "Free cancellation until 48 hours before the booking."
      })
    );
  });

  it("lets owners submit a listing for review", async () => {
    const server = buildServer();
    const response = await server.inject({
      method: "PATCH",
      url: "/owner/studios/studio-lumen-karlin",
      payload: {
        listingStatus: "in_review"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().studio).toEqual(
      expect.objectContaining({
        listingStatus: "in_review"
      })
    );
  });

  it("returns submitted listings in the admin review queue", async () => {
    const server = buildServer();
    await server.inject({
      method: "PATCH",
      url: "/owner/studios/studio-lumen-karlin",
      payload: {
        listingStatus: "in_review"
      }
    });
    await server.inject({
      method: "PATCH",
      url: "/session",
      payload: {
        role: "admin",
        displayName: "Marketplace Admin"
      }
    });

    const response = await server.inject({
      method: "GET",
      url: "/admin/listing-reviews"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().reviews).toEqual([
      expect.objectContaining({
        studioSlug: "studio-lumen-karlin",
        studioName: "Studio Lumen Karlin",
        ownerName: "Lumen Studios",
        listingStatus: "in_review"
      })
    ]);
  });

  it("requires admin role to approve listing reviews", async () => {
    const server = buildServer();
    await server.inject({
      method: "PATCH",
      url: "/owner/studios/studio-lumen-karlin",
      payload: {
        listingStatus: "in_review"
      }
    });

    const forbidden = await server.inject({
      method: "PATCH",
      url: "/admin/studios/studio-lumen-karlin/review",
      payload: {
        decision: "approve"
      }
    });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json().error).toBe("ADMIN_ROLE_REQUIRED");

    await server.inject({
      method: "PATCH",
      url: "/session",
      payload: {
        role: "admin",
        displayName: "Marketplace Admin"
      }
    });
    const approved = await server.inject({
      method: "PATCH",
      url: "/admin/studios/studio-lumen-karlin/review",
      payload: {
        decision: "approve"
      }
    });

    expect(approved.statusCode).toBe(200);
    expect(approved.json().studio).toEqual(
      expect.objectContaining({
        slug: "studio-lumen-karlin",
        listingStatus: "published"
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

  it("persists shared shortlist updates across API restarts", async () => {
    const localDataDir = mkdtempSync(join(tmpdir(), "studio-state-shortlists-"));
    const firstServer = buildServer({
      config: {
        localDataDir
      }
    });
    const created = await firstServer.inject({
      method: "POST",
      url: "/shortlists",
      payload: {
        studioSlugs: ["studio-lumen-karlin", "atelier-rosa-vinohrady"]
      }
    });
    const shortlistId = created.json().shortlist.id;
    await firstServer.inject({
      method: "PATCH",
      url: `/shortlists/${shortlistId}`,
      payload: {
        items: [
          {
            studioSlug: "studio-lumen-karlin",
            decision: "favourite",
            note: "Client likes the clean daylight room."
          }
        ]
      }
    });

    const restartedServer = buildServer({
      config: {
        localDataDir
      }
    });
    const loaded = await restartedServer.inject({
      method: "GET",
      url: `/shortlists/${shortlistId}`
    });

    expect(loaded.statusCode).toBe(200);
    expect(loaded.json().shortlist.items).toEqual([
      {
        studioSlug: "studio-lumen-karlin",
        decision: "favourite",
        note: "Client likes the clean daylight room."
      },
      {
        studioSlug: "atelier-rosa-vinohrady"
      }
    ]);
  });
});
