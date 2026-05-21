export type PaymentMode = "manual_at_studio" | "platform_payment";

export function getPaymentMode(input: { manualPaymentMode: boolean }): PaymentMode {
  return input.manualPaymentMode ? "manual_at_studio" : "platform_payment";
}

export function getPaymentInstructions(mode: PaymentMode): string {
  if (mode === "manual_at_studio") {
    return "No online payment is taken yet; pay the studio directly according to the booking terms.";
  }

  return "Pay online through the marketplace checkout.";
}
