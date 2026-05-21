import { describe, expect, it } from "vitest";
import { rewriteApiProxyPath } from "./apiProxy";

describe("dev API proxy", () => {
  it("keeps owner onboarding API routes under the backend /api namespace", () => {
    expect(rewriteApiProxyPath("/api/owner/email-codes")).toBe("/api/owner/email-codes");
    expect(rewriteApiProxyPath("/api/telegram/webhook")).toBe("/api/telegram/webhook");
    expect(rewriteApiProxyPath("/api/readiness")).toBe("/api/readiness");
  });

  it("keeps legacy app API calls compatible with unprefixed backend routes", () => {
    expect(rewriteApiProxyPath("/api/studios")).toBe("/studios");
    expect(rewriteApiProxyPath("/api/support/tickets")).toBe("/support/tickets");
  });
});
