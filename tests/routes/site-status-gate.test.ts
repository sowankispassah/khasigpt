import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { encode } from "next-auth/jwt";
import {
  hasVerifiedAdminSession,
  proxy,
  shouldAllowAdminEntryPassThrough,
  shouldBypassSiteStatusGate,
} from "@/proxy";

test("verified admin navigation does not wait for site availability", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  const previousFetch = globalThis.fetch;
  const secret = "local-admin-navigation-verification";
  process.env.AUTH_SECRET = secret;
  globalThis.fetch = async () => Response.json({ authenticated: true, role: "admin" });
  try {
    for (const secure of [false, true]) {
      const name = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
      const token = await encode({ secret, salt: name, token: { id: "11111111-1111-4111-8111-111111111111", role: "admin" }, maxAge: 600 });
      const request = new NextRequest(`${secure ? "https" : "http"}://localhost/admin/settings`, {
        headers: { cookie: `${name}=${token}`, accept: "text/html" },
      });
      expect(await hasVerifiedAdminSession(request)).toBe(true);
      const started = Date.now();
      expect((await proxy(request)).headers.get("x-middleware-next")).toBe("1");
      expect(Date.now() - started).toBeLessThan(200);
    }
  } finally {
    globalThis.fetch = previousFetch;
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test("regular, expired, forged and missing sessions cannot skip the admin site gate", async () => {
  const previousSecret = process.env.AUTH_SECRET;
  const secret = "local-admin-navigation-verification";
  process.env.AUTH_SECRET = secret;
  try {
    const name = "authjs.session-token";
    const tokens = [
      await encode({ secret, salt: name, token: { role: "regular" }, maxAge: 600 }),
      await encode({ secret, salt: name, token: { role: "admin" }, maxAge: -60 }),
      await encode({ secret: "untrusted-key", salt: name, token: { role: "admin" }, maxAge: 600 }),
      "invalid-session",
      "",
    ];
    for (const token of tokens) {
      const request = new NextRequest("http://localhost/admin/settings", {
        headers: token ? { cookie: `${name}=${token}` } : {},
      });
      expect(await hasVerifiedAdminSession(request)).toBe(false);
    }
  } finally {
    if (previousSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = previousSecret;
  }
});

test.describe("site status gate public routes", () => {
  test("keeps compliance pages outside coming-soon and maintenance redirects", () => {
    expect(shouldBypassSiteStatusGate("/privacy-policy")).toBe(true);
    expect(shouldBypassSiteStatusGate("/terms-of-service")).toBe(true);
    expect(shouldBypassSiteStatusGate("/help/delete-account")).toBe(true);
    expect(shouldBypassSiteStatusGate("/help/delete-account/verify")).toBe(true);
  });

  test("keeps auth pages outside DB-backed site-status redirects", () => {
    for (const pathname of [
      "/login",
      "/register",
      "/forgot-password",
      "/reset-password",
      "/verify-email",
      "/complete-profile",
    ]) {
      expect(shouldBypassSiteStatusGate(pathname)).toBe(true);
    }
  });

  test("keeps ordinary app pages under the site status gate", () => {
    expect(shouldBypassSiteStatusGate("/")).toBe(false);
    expect(shouldBypassSiteStatusGate("/chat")).toBe(false);
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
