import { describe, expect, it } from "vitest";
import { getPaymentInstructions, getPaymentMode } from "./paymentMode";

describe("payment mode", () => {
  it("uses direct studio payment copy during soft launch", () => {
    expect(getPaymentMode({ manualPaymentMode: true })).toBe("manual_at_studio");
    expect(getPaymentInstructions("manual_at_studio")).toContain("pay the studio directly");
  });
});
