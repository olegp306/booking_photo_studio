import { describe, expect, it } from "vitest";
import { createStorageService } from "./storage";

describe("owner media storage", () => {
  it("creates stable public urls for uploaded owner media", async () => {
    const uploads: Array<{ key: string; contentType: string }> = [];
    const storage = createStorageService({
      publicBaseUrl: "https://media.example.com",
      putObject: async (object) => {
        uploads.push({ key: object.key, contentType: object.contentType });
      }
    });

    const uploaded = await storage.uploadOwnerMedia({
      ownerId: "owner_1",
      fileName: "Room 1.JPG",
      mimeType: "image/jpeg",
      bytes: Buffer.from("image")
    });

    expect(uploaded.publicUrl).toMatch(/^https:\/\/media\.example\.com\/owners\/owner_1\//);
    expect(uploaded.storageKey).toContain("room-1");
    expect(uploads[0].contentType).toBe("image/jpeg");
  });
});
