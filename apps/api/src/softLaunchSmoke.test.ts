import { describe, expect, it } from "vitest";
import { createInMemoryOwnerRepository } from "./ownerRepository";
import { buildServer } from "./server";

const multipartBody = (
  fields: Record<string, string>,
  file: { fieldName: string; fileName: string; mimeType: string; bytes: string }
) => {
  const boundary = "----studio-smoke-boundary";
  const chunks = [
    ...Object.entries(fields).map(([name, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
    ),
    `--${boundary}\r\nContent-Disposition: form-data; name="${file.fieldName}"; filename="${file.fileName}"\r\nContent-Type: ${file.mimeType}\r\n\r\n${file.bytes}\r\n`,
    `--${boundary}--\r\n`
  ];

  return {
    body: chunks.join(""),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
};

describe("soft launch smoke", () => {
  it("creates a real owner listing and confirms a verified-email booking without platform payment", async () => {
    const ownerRepository = createInMemoryOwnerRepository();
    const ownerBookingEmails: Array<{ approveUrl: string; to: string }> = [];
    const guestApprovalEmails: Array<{ to: string; bookingUrl: string }> = [];
    const server = buildServer({
      config: {
        publicAppUrl: "https://studio.example.com",
        manualPaymentMode: true,
        openaiApiKey: ""
      },
      services: {
        ownerRepository,
        createOtpCode: () => "123456",
        email: {
          sendOwnerOtp: async () => ({ id: "owner_otp" }),
          sendGuestBookingOtp: async () => ({ id: "guest_otp" }),
          sendOwnerBookingRequest: async (input) => {
            ownerBookingEmails.push({ approveUrl: input.approveUrl, to: input.to });
            return { id: "owner_booking_request" };
          },
          sendGuestBookingApproved: async (input) => {
            guestApprovalEmails.push({ to: input.to, bookingUrl: input.bookingUrl });
            return { id: "guest_booking_approved" };
          }
        },
        storage: {
          uploadOwnerMedia: async (input) => ({
            storageKey: `owners/${input.ownerId}/${input.fileName}`,
            publicUrl: `https://media.example.com/owners/${input.ownerId}/${input.fileName}`
          })
        }
      }
    });

    const started = await server.inject({
      method: "POST",
      url: "/api/owner/onboarding/start",
      payload: {
        source: "web",
        text: "Loft Karlin, Prague daylight studio, 1200 CZK per hour, cyclorama, softboxes, makeup station, wifi. Minimum booking is 2 hours."
      }
    });
    expect(started.statusCode).toBe(200);
    const draft = started.json().draft;
    expect(draft.ownerSessionToken).toEqual(expect.any(String));
    expect(draft.studioName).toBe("Loft Karlin");

    const media = multipartBody(
      { ownerSessionToken: draft.ownerSessionToken, draftId: draft.id },
      { fieldName: "file", fileName: "room.jpg", mimeType: "image/jpeg", bytes: "fake-image" }
    );
    const uploaded = await server.inject({
      method: "POST",
      url: "/api/owner/media",
      headers: { "content-type": media.contentType },
      payload: media.body
    });
    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json().media.publicUrl).toBe("https://media.example.com/owners/owner_1/room.jpg");

    const ownerCode = await server.inject({
      method: "POST",
      url: "/api/owner/email-codes",
      payload: { ownerDraftId: draft.id, email: "Owner@Example.com" }
    });
    expect(ownerCode.statusCode).toBe(200);
    const verifiedOwner = await server.inject({
      method: "POST",
      url: "/api/owner/email-codes/verify",
      payload: { email: "owner@example.com", code: "123456" }
    });
    expect(verifiedOwner.statusCode).toBe(200);

    const published = await server.inject({
      method: "POST",
      url: `/api/owner/onboarding/${draft.id}/publish`,
      payload: { ownerSessionToken: verifiedOwner.json().session.ownerSessionToken }
    });
    expect(published.statusCode).toBe(200);
    const studioSlug = published.json().listing.id;

    const publicStudio = await server.inject({ method: "GET", url: `/api/studios/${studioSlug}` });
    expect(publicStudio.statusCode).toBe(200);
    const publicBody = JSON.stringify(publicStudio.json());
    expect(publicBody).toContain("https://media.example.com/owners/owner_1/room.jpg");
    expect(publicBody).not.toContain("owner@example.com");
    expect(publicBody).not.toContain("telegramUserId");
    expect(publicBody).not.toContain("storageKey");
    expect(publicStudio.json().studio).toEqual(
      expect.objectContaining({
        bookingMode: "request",
        priceFrom: 1200,
        rules: expect.arrayContaining(["Minimum booking is 2 hours"])
      })
    );

    const guestCode = await server.inject({
      method: "POST",
      url: "/api/booking/email-codes",
      payload: { studioSlug, email: "guest@example.com" }
    });
    expect(guestCode.statusCode).toBe(200);
    const verifiedGuest = await server.inject({
      method: "POST",
      url: "/api/booking/email-codes/verify",
      payload: { email: "guest@example.com", code: "123456" }
    });
    expect(verifiedGuest.statusCode).toBe(200);

    const requested = await server.inject({
      method: "POST",
      url: "/booking-requests",
      payload: {
        studioSlug,
        roomId: `${studioSlug}-main`,
        date: "2026-06-15",
        startTime: "10:00",
        durationHours: 2,
        guestName: "Marta Client",
        guestEmail: "guest@example.com",
        guestEmailToken: verifiedGuest.json().guestEmailToken,
        shootType: "portrait",
        message: "Soft launch smoke booking."
      }
    });
    expect(requested.statusCode).toBe(201);
    expect(requested.json().booking).toEqual(
      expect.objectContaining({
        paymentMode: "manual_at_studio",
        paymentInstructions: expect.stringContaining("pay the studio directly"),
        status: "pending_owner_approval"
      })
    );
    expect(ownerBookingEmails).toEqual([
      expect.objectContaining({
        to: "owner@example.com",
        approveUrl: expect.stringContaining("/api/owner/bookings/")
      })
    ]);

    const approveUrl = new URL(ownerBookingEmails[0].approveUrl);
    const approved = await server.inject({ method: "GET", url: `${approveUrl.pathname}${approveUrl.search}` });
    expect(approved.statusCode).toBe(302);
    expect(guestApprovalEmails).toEqual([
      expect.objectContaining({
        to: "guest@example.com",
        bookingUrl: "https://studio.example.com/#bookings"
      })
    ]);

    const bookings = await server.inject({ method: "GET", url: "/bookings?guestEmail=guest@example.com" });
    expect(bookings.json().bookings[0]).toEqual(
      expect.objectContaining({
        status: "confirmed",
        paymentMode: "manual_at_studio"
      })
    );
  });
});
