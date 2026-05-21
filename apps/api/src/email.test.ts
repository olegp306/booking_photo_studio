import { describe, expect, it } from "vitest";
import { createEmailService } from "./email";

describe("email service", () => {
  it("sends a friendly backup access email code", async () => {
    const sent: Array<{ to: string; subject: string; html: string }> = [];
    const email = createEmailService({
      send: async (message) => {
        sent.push(message);
        return { id: "email_1" };
      }
    });

    await email.sendOwnerOtp({
      to: "owner@example.com",
      code: "123456",
      studioName: "Studio Lumen"
    });

    expect(sent[0].subject).toContain("123456");
    expect(sent[0].html).toContain("so you do not lose access");
  });
});
