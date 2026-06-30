import { expect, test } from "@playwright/test";
import {
  shouldAllowAdminEntryPassThrough,
  shouldBypassSiteStatusGate,
} from "@/proxy";

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

test.describe("admin entry pass launch gate", () => {
  test("allows the hidden entry path without an existing pass", () => {
    expect(
      shouldAllowAdminEntryPassThrough({
        adminAccessEnabled: true,
        hasValidAdminEntryPass: false,
        isConfiguredAdminEntryRoute: true,
        pathname: "/soowankis",
      })
    ).toBe(true);
  });

  test("allows pass holders through login and admin routes", () => {
    for (const pathname of ["/login", "/admin", "/admin/settings"]) {
      expect(
        shouldAllowAdminEntryPassThrough({
          adminAccessEnabled: true,
          hasValidAdminEntryPass: true,
          isConfiguredAdminEntryRoute: false,
          pathname,
        })
      ).toBe(true);
    }
  });

  test("does not let the pass unlock ordinary app routes", () => {
    expect(
      shouldAllowAdminEntryPassThrough({
        adminAccessEnabled: true,
        hasValidAdminEntryPass: true,
        isConfiguredAdminEntryRoute: false,
        pathname: "/chat",
      })
    ).toBe(false);
  });
});
