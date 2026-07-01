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

  test("does not let the pass unlock app routes without a session", () => {
    expect(
      shouldAllowAdminEntryPassThrough({
        adminAccessEnabled: true,
        allowAuthenticatedAppRoutes: true,
        hasAuthenticatedSession: false,
        hasValidAdminEntryPass: true,
        isConfiguredAdminEntryRoute: false,
        pathname: "/chat",
      })
    ).toBe(false);
  });

  test("lets authenticated pass holders through core app routes when role lookup is unavailable", () => {
    for (const pathname of ["/", "/chat", "/chat/123"]) {
      expect(
        shouldAllowAdminEntryPassThrough({
          adminAccessEnabled: true,
          allowAuthenticatedAppRoutes: true,
          hasAuthenticatedSession: true,
          hasValidAdminEntryPass: true,
          isConfiguredAdminEntryRoute: false,
          pathname,
        })
      ).toBe(true);
    }
  });

  test("keeps app routes closed when role lookup is confirmed non-admin", () => {
    expect(
      shouldAllowAdminEntryPassThrough({
        adminAccessEnabled: true,
        allowAuthenticatedAppRoutes: false,
        hasAuthenticatedSession: true,
        hasValidAdminEntryPass: true,
        isConfiguredAdminEntryRoute: false,
        pathname: "/chat",
      })
    ).toBe(false);
  });
});
