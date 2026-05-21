import { describe, expect, it } from "vitest";
import { createSixDigitCode, hashOtpCode, verifyOtpCode } from "./auth";

describe("owner auth", () => {
  it("generates numeric 6 digit codes", () => {
    expect(createSixDigitCode()).toMatch(/^\d{6}$/);
  });

  it("verifies a code against its hash and rejects a different code", async () => {
    const hash = await hashOtpCode("123456");
    await expect(verifyOtpCode("123456", hash)).resolves.toBe(true);
    await expect(verifyOtpCode("654321", hash)).resolves.toBe(false);
  });
});
