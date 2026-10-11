import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));

function guestHarness(overrides: Record<string, string | undefined> = {}) {
  const env: Record<string, string | undefined> = { NODE_ENV: "production", VERCEL: "1", ...overrides };
  let config: any;
  let creations = 0;
  let unavailable = false;
  const calls: string[] = [];
  const counters = new Map<string, number>();
  function load(file: string, mocks: Record<string, unknown>) {
    const exports: Record<string, any> = {};
    const code = ts.transpileModule(readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, process: { env }, URL, Request, Response, Headers,
      console: { warn() {}, error() {} },
      require: (name: string) => name in mocks ? mocks[name] : requireModule(name),
    });
    return exports;
  }
  const policy = load("lib/security/guest-login.ts", {});
  const rateLimit = {
    async incrementRateLimit(key: string, options: { limit: number }) {
      calls.push(key);
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return { allowed: !unavailable && count <= options.limit, resetAt: Date.now() + 600_000 };
    },
    resetRateLimit() {},
  };
  const helpers = load("lib/security/request-helpers.ts", {});
  const sdkErrors = load("lib/errors.ts", {});
  const shared = {
    "@/lib/security/guest-login": policy,
    "@/lib/security/rate-limit": rateLimit,
    "@/lib/security/request-helpers": helpers,
    "@/lib/errors": sdkErrors,
  };
  load("app/(auth)/auth.ts", {
    ...shared,
    "bcrypt-ts": { compare: async () => false },
    "next-auth": { default: (options: any) => {
      config = options;
      return { handlers: { GET() {}, POST() {} } };
    } },
    "next-auth/providers/credentials": { default: (options: any) => ({ id: "credentials", ...options }) },
    "next-auth/providers/google": { default: () => ({ id: "google" }) },
    "@/lib/constants": {},
    "@/lib/db/auth-queries": { createAuthGuestUser: async () => {
      creations += 1;
      return { id: `guest-${creations}`, role: "regular" };
    } },
    "@/lib/db/queries": {},
    "@/lib/mobile-auth-token": {},
    "@/lib/security/client-info": {},
    "@/lib/utils/async": { withTimeout: (promise: Promise<unknown>) => promise },
    "./auth.config": { authConfig: {} },
    "next/headers": {},
    "@/lib/referrals/rules": {},
  });
  const request = new Request("https://app.example.test/api/auth/callback/guest", {
    headers: { "x-vercel-forwarded-for": "203.0.113.9", "x-forwarded-for": "198.51.100.2" },
  });
  const guest = config.providers.find((provider: any) => provider.id === "guest");
  let authReads = 0;
  const route = load("app/(auth)/api/auth/guest/route.ts", {
    ...shared,
    "next/server": { NextResponse: { json: Response.json, redirect: (url: URL) => Response.redirect(url) } },
    "@/lib/security/safe-redirect": { sanitizeRedirectPath: () => "/chat" },
    "@/app/(auth)/auth": {
      auth: async () => { authReads += 1; return null; },
      signIn: async () => guest?.authorize({}, request),
    },
  });
  return {
    env, config, policy, guest, route, request, calls,
    creations: () => creations, authReads: () => authReads,
    outage: () => { unavailable = true; },
  };
}

test("disabled production guest access registers no provider and rejects the entry before auth or DB work", async () => {
  for (const flag of [undefined, "false", "0", "yes"]) {
    const h = guestHarness({ ENABLE_GUEST_LOGIN: flag, PLAYWRIGHT: "true" });
    expect(h.guest).toBeUndefined();
    const response = await h.route.GET(h.request);
    expect(response.status).toBe(403);
    expect(h.calls).toHaveLength(0);
    expect(h.authReads()).toBe(0);
    expect(h.creations()).toBe(0);
    expect(h.config.providers.map((p: any) => p.id)).toEqual(["credentials", "mobile-token", "impersonate"]);
  }
});

test("explicitly enabled callbacks use the trusted client IP and create only after the quota check", async () => {
  const h = guestHarness({ ENABLE_GUEST_LOGIN: "true" });
  expect(await h.guest.authorize({}, h.request)).toMatchObject({ id: "guest-1", name: "Guest" });
  expect(h.calls).toEqual(["guest:203.0.113.9"]);
  expect(h.creations()).toBe(1);
});

test("a previously registered guest provider rechecks the gate before any counter or user creation", async () => {
  const h = guestHarness({ ENABLE_GUEST_LOGIN: "true" });
  h.env.ENABLE_GUEST_LOGIN = "false";
  expect(await h.guest.authorize({}, h.request)).toBeNull();
  expect(h.calls).toHaveLength(0);
  expect(h.creations()).toBe(0);
});

test("friendly entries and direct callbacks share one creation quota without counting an entry twice", async () => {
  const h = guestHarness({ ENABLE_GUEST_LOGIN: "true" });
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) =>
    i % 2 ? h.guest.authorize({}, h.request) : h.route.GET(h.request)
  ));
  expect(results.filter(Boolean)).toHaveLength(10);
  expect(h.creations()).toBe(10);
  expect(h.calls.filter(key => key.startsWith("guest:"))).toHaveLength(12);
  expect(h.calls.filter(key => key.startsWith("guest-entry:"))).toHaveLength(6);
});

test("an unavailable distributed limiter cannot create guest accounts", async () => {
  const h = guestHarness({ ENABLE_GUEST_LOGIN: "true" });
  h.outage();
  expect(await h.guest.authorize({}, h.request)).toBeNull();
  expect((await h.route.GET(h.request)).status).toBe(429);
  expect(h.creations()).toBe(0);
});

test("development guest sessions and explicitly enabled production OAuth registration remain available", () => {
  expect(guestHarness({ NODE_ENV: "development" }).guest).toBeDefined();
  const h = guestHarness({ ENABLE_GUEST_LOGIN: "TRUE", GOOGLE_CLIENT_ID: "fixture", GOOGLE_CLIENT_SECRET: "fixture" });
  expect(h.config.providers.map((p: any) => p.id)).toEqual(["credentials", "mobile-token", "guest", "impersonate", "google"]);
});
