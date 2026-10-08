import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const compile = (file: string) =>
  ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

function load(file: string, mocks: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(compile(file), {
    exports,
    process: { env: { NODE_ENV: "production" } },
    Response,
    console: { warn() {}, error() {} },
    require: (name: string) =>
      name in mocks ? mocks[name] : requireModule(name),
  });
  return exports;
}

// In-memory stand-in for the shared counter: every call counts, and a call is
// allowed while the key is within its limit (the real Lua script behaves so).
function memoryRateLimit() {
  const counts = new Map<string, number>();
  return {
    counts,
    incrementRateLimit: async (key: string, { limit }: { limit: number }) => {
      const count = (counts.get(key) ?? 0) + 1;
      counts.set(key, count);
      return { allowed: count <= limit, remaining: 0, resetAt: Date.now() };
    },
  };
}

function loadAuthEmailLimits() {
  const counter = memoryRateLimit();
  const module = load("lib/security/auth-email-rate-limit.ts", {
    "@/lib/security/rate-limit": counter,
  });
  return { counter, allow: module.allowAuthEmailAttempt };
}

test("caps signup emails per recipient per hour", async () => {
  const { allow } = loadAuthEmailLimits();
  const attempt = (clientKey: string) =>
    allow({ clientKey, email: "victim@example.com", kind: "register" });

  expect(await attempt("1.1.1.1")).toBe(true);
  expect(await attempt("2.2.2.2")).toBe(true);
  expect(await attempt("3.3.3.3")).toBe(true);
  // A fourth signup email to the same inbox is refused even from a new network.
  expect(await attempt("4.4.4.4")).toBe(false);
});

test("treats differently cased addresses as the same recipient", async () => {
  const { allow } = loadAuthEmailLimits();
  for (const email of ["User@Example.com", " user@example.com", "USER@EXAMPLE.COM"]) {
    expect(await allow({ clientKey: "1.1.1.1", email, kind: "register" })).toBe(true);
  }
  expect(
    await allow({ clientKey: "9.9.9.9", email: "user@example.com", kind: "register" })
  ).toBe(false);
});

test("shares the daily recipient budget between signup and password reset", async () => {
  const { allow } = loadAuthEmailLimits();
  const email = "person@example.com";
  for (let index = 0; index < 3; index += 1) {
    expect(await allow({ clientKey: `10.0.0.${index}`, email, kind: "register" })).toBe(true);
  }
  for (let index = 0; index < 3; index += 1) {
    expect(
      await allow({ clientKey: `10.0.1.${index}`, email, kind: "password-reset" })
    ).toBe(true);
  }
  // Six emails reached this inbox today, so a seventh of either kind is refused.
  expect(
    await allow({ clientKey: "10.0.2.1", email, kind: "password-reset" })
  ).toBe(false);
});

test("caps how many auth emails one network can trigger", async () => {
  const { allow } = loadAuthEmailLimits();
  for (let index = 0; index < 5; index += 1) {
    expect(
      await allow({ clientKey: "5.5.5.5", email: `user${index}@example.com`, kind: "register" })
    ).toBe(true);
  }
  expect(
    await allow({ clientKey: "5.5.5.5", email: "user9@example.com", kind: "register" })
  ).toBe(false);
});

test("signup and password reset both use the shared auth email limits", () => {
  const signup = readFileSync("app/(auth)/actions.ts", "utf8");
  const reset = readFileSync("app/(auth)/password-reset/actions.ts", "utf8");
  const mobileSignup = readFileSync("app/api/mobile/auth/register/route.ts", "utf8");

  expect(signup).toContain('kind: "register"');
  expect(reset).toContain('kind: "password-reset"');
  // The app's signup reuses the web action, so it inherits the same limits.
  expect(mobileSignup).toContain('import { register } from "@/app/(auth)/actions"');
});

test("forum writes return 429 once a user exceeds the cap", async () => {
  const counter = memoryRateLimit();
  const errors = load("lib/errors.ts");
  const helpers = load("lib/forum/api-helpers.ts", {
    "next/server": { NextResponse: Response },
    zod: { ZodError: class ZodError extends Error {} },
    "@/lib/errors": errors,
    "@/lib/security/rate-limit": counter,
  });

  for (let index = 0; index < 5; index += 1) {
    expect(await helpers.forumWriteRateLimitResponse("user-1", "thread")).toBeNull();
  }
  const limited = await helpers.forumWriteRateLimitResponse("user-1", "thread");
  expect(limited.status).toBe(429);
  expect(await limited.json()).toEqual({
    code: "rate_limit:forum",
    message: "You are posting too quickly. Please wait a few minutes and try again.",
  });
  // Another user and another action keep their own budgets.
  expect(await helpers.forumWriteRateLimitResponse("user-2", "thread")).toBeNull();
  expect(await helpers.forumWriteRateLimitResponse("user-1", "reply")).toBeNull();
});

test("every forum write route checks the rate limit", () => {
  const routes = {
    thread: "app/api/forum/threads/route.ts",
    reply: "app/api/forum/threads/[slug]/posts/route.ts",
    reaction: "app/api/forum/posts/[postId]/reactions/route.ts",
  };
  for (const [action, file] of Object.entries(routes)) {
    const source = readFileSync(file, "utf8");
    expect(source).toContain("forumWriteRateLimitResponse(");
    expect(source).toContain(`"${action}"`);
  }
});

test("the public launch status never reveals the admin entry", async () => {
  const availability = {
    webLaunched: true,
    mobileAppLaunched: true,
    underMaintenance: false,
    inviteOnlyPrelaunch: false,
    adminAccessEnabled: true,
    adminEntryPath: "/hidden-admin",
  };
  const route = load("app/api/public/site-launch/route.ts", {
    "next/cache": { unstable_cache: (fn: () => unknown) => fn },
    "next/server": { NextResponse: Response },
    "@/lib/db/app-settings-lite": {
      appSettingCacheTagForKey: (key: string) => key,
      getLiteAppSettingsByKeysUncached: async () => [],
    },
    "@/lib/settings/site-availability": {
      SITE_LAUNCH_SETTING_KEYS: [],
      parseSiteAvailability: () => ({ ...availability }),
      getSafeSiteAvailability: () => ({ ...availability }),
    },
    "@/lib/utils/async": { withTimeout: (promise: Promise<unknown>) => promise },
  });

  const response: Response = await route.GET();
  const body = await response.json();
  expect(body).not.toHaveProperty("adminEntryPath");
  expect(body).not.toHaveProperty("adminAccessEnabled");
  expect(body).toMatchObject({
    webLaunched: true,
    mobileAppLaunched: true,
    publicLaunched: true,
    confirmed: true,
  });
});
