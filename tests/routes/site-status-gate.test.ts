import { expect, test } from "@playwright/test";
import { shouldBypassSiteStatusGate } from "@/proxy";

test.describe("site status gate public routes", () => {
  test("keeps compliance pages outside coming-soon and maintenance redirects", () => {
    expect(shouldBypassSiteStatusGate("/privacy-policy")).toBe(true);
    expect(shouldBypassSiteStatusGate("/terms-of-service")).toBe(true);
    expect(shouldBypassSiteStatusGate("/help/delete-account")).toBe(true);
    expect(shouldBypassSiteStatusGate("/help/delete-account/verify")).toBe(true);
  });

  test("keeps ordinary pages under the site status gate", () => {
    expect(shouldBypassSiteStatusGate("/")).toBe(false);
    expect(shouldBypassSiteStatusGate("/chat")).toBe(false);
    expect(shouldBypassSiteStatusGate("/login")).toBe(false);
    expect(shouldBypassSiteStatusGate("/privacy")).toBe(false);
  });
});
