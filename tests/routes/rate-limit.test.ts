import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const compile = (file: string) => ts.transpileModule(readFileSync(file, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function load(file: string, env: Record<string, string | undefined> = {}, mocks: Record<string, unknown> = {}, fetcher?: typeof fetch, clock: { now(): number } = Date) {
  const exports: Record<string, any> = {};
  const context = {
    exports, process: { env: { NODE_ENV: "production", ...env } },
    URL, Headers, Request, Response, AbortController, setTimeout, clearTimeout,
    Date: clock, fetch: fetcher, console: { warn() {}, error() {} },
    require: (name: string) => name in mocks ? mocks[name] : requireModule(name),
  };
  if (file === "lib/security/rate-limit.ts") {
    mocks["@/lib/utils/async"] = load("lib/utils/async.ts", env, {}, fetcher);
  }
  vm.runInNewContext(compile(file), context);
  return exports;
}

function sharedCounter() {
  let now = 100_000;
  const entries = new Map<string, { count: number; reset: number }>();
  const calls: any[][] = [];
  class Clock extends Date { static now() { return now; } }
  const fetcher: typeof fetch = async (_url, init) => {
    const command = JSON.parse(String(init?.body));
    calls.push(command);
    expect(command[0]).toBe("EVAL");
    expect(command[2]).toBe(1);
    const key = command[3];
    let item = entries.get(key);
    if (!item || item.reset <= now) item = { count: 0, reset: now + Number(command[4]) };
    item.count += 1;
    entries.set(key, item);
    return Response.json({ result: [item.count, item.reset - now] });
  };
  return { fetcher, calls, Clock, advance: (ms: number) => { now += ms; } };
}

const restEnv = { UPSTASH_REDIS_REST_URL: "https://redis.example.test", UPSTASH_REDIS_REST_TOKEN: "fixture-token" };

test("REST quotas are shared between instances and a denied request does not extend expiry", async () => {
  const counter = sharedCounter();
  const a = load("lib/security/rate-limit.ts", restEnv, {}, counter.fetcher, counter.Clock);
  const b = load("lib/security/rate-limit.ts", restEnv, {}, counter.fetcher, counter.Clock);
  const results = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? a : b).incrementRateLimit("login:private-email", { limit: 2, windowMs: 1000 })));
  expect(results.filter((r) => r.allowed)).toHaveLength(2);
  expect(results.every((r) => r.resetAt === 101_000)).toBe(true);
  expect(counter.calls.every((c) => !c[3].includes("private-email"))).toBe(true);
  counter.advance(500);
  expect((await a.incrementRateLimit("login:private-email", { limit: 2, windowMs: 1000 })).resetAt).toBe(101_000);
  counter.advance(501);
  expect((await b.incrementRateLimit("login:private-email", { limit: 2, windowMs: 1000 })).allowed).toBe(true);
});

test("malformed REST counters and backend outages cannot allow production authentication", async () => {
  for (const body of [{ result: null }, [{ result: 1 }], { result: [null, 1000] }, { result: [0, 1000] }, { result: [1, -1] }, { result: [1, 1001] }, { result: ["1", 1000] }, { error: "backend error" }]) {
    const limiter = load("lib/security/rate-limit.ts", restEnv, {}, async () => Response.json(body));
    expect(await limiter.incrementRateLimit("login:test", { limit: 2, windowMs: 1000 })).toMatchObject({ allowed: false, reason: "unavailable" });
  }
  for (const env of [{}, { ISOLATED_TEST_RUN: "1", POSTGRES_URL: "postgres://user@production.test/app" }]) {
    expect(await load("lib/security/rate-limit.ts", env).incrementRateLimit("login:test")).toMatchObject({ allowed: false, reason: "unavailable" });
  }
});

test("REST body stalls are bounded and cancelled without opening the quota", async () => {
  let signal: AbortSignal | null | undefined;
  const limiter = load("lib/security/rate-limit.ts", restEnv, {}, async (_url, init) => {
    signal = init?.signal;
    return { ok: true, json: () => new Promise(() => {}) } as unknown as Response;
  });
  const start = Date.now();
  expect(await limiter.incrementRateLimit("login:test")).toMatchObject({ allowed: false, reason: "unavailable" });
  expect(Date.now() - start).toBeLessThan(1800);
  expect(signal?.aborted).toBe(true);
});

test("TCP Redis waits for readiness and shares one connection for concurrent quota checks", async () => {
  let count = 0;
  let connects = 0;
  let options: any;
  const client = {
    isOpen: false, isReady: false, on() {}, destroy() {},
    async connect() { connects += 1; client.isOpen = true; await new Promise((r) => setTimeout(r, 10)); client.isReady = true; },
    async eval() { expect(client.isReady).toBe(true); return [++count, 1000]; },
  };
  const limiter = load("lib/security/rate-limit.ts", { REDIS_URL: "rediss://redis.example.test" }, { redis: { createClient: (input: any) => { options = input; return client; } } });
  const results = await Promise.all(Array.from({ length: 8 }, () => limiter.incrementRateLimit("tcp:test", { limit: 2, windowMs: 1000 })));
  expect(connects).toBe(1);
  expect(results.filter((r) => r.allowed)).toHaveLength(2);
  expect(options.disableOfflineQueue).toBe(true);
  expect(options.socket.reconnectStrategy).toBe(false);
});

test("local fallback has fixed expiry, bounded memory, and recovers expired buckets", async () => {
  const counter = sharedCounter();
  const limiter = load("lib/security/rate-limit.ts", {}, {}, undefined, counter.Clock);
  const policy = { limit: 2, windowMs: 1000, failureMode: "local" };
  expect((await limiter.incrementRateLimit("read:a", policy)).allowed).toBe(true);
  counter.advance(500);
  expect((await limiter.incrementRateLimit("read:a", policy)).allowed).toBe(true);
  expect(await limiter.incrementRateLimit("read:a", policy)).toMatchObject({ allowed: false, resetAt: 101_000 });
  for (let i = 1; i < 10_000; i++) await limiter.incrementRateLimit(`read:${i}`, policy);
  expect(await limiter.incrementRateLimit("read:overflow", policy)).toMatchObject({ allowed: false, reason: "unavailable" });
  counter.advance(1001);
  expect((await limiter.incrementRateLimit("read:overflow", policy)).allowed).toBe(true);
});

test("client keys prefer the platform IP, validate input, and handle missing forwarding headers", () => {
  const production = load("lib/security/request-helpers.ts", { VERCEL: "1" });
  expect(production.getClientKeyFromHeaders(new Headers({ "x-vercel-forwarded-for": "192.0.2.1", "x-forwarded-for": "192.0.2.2" }))).toBe("192.0.2.1");
  expect(production.getClientKeyFromHeaders(new Headers({ "x-forwarded-for": "arbitrary-key", "x-real-ip": "192.0.2.3" }))).toBe("unknown");
  const local = load("lib/security/request-helpers.ts");
  expect(local.getClientKeyFromHeaders(new Headers({ "x-real-ip": "192.0.2.3" }))).toBe("192.0.2.3");
  expect(local.getClientKeyFromHeaders(new Headers({ "x-forwarded-for": "2001:DB8::1, 192.0.2.1" }))).toBe("2001:db8::1");
});

function proxyHarness(result: object) {
  const calls: Array<{ key: string; options: any }> = [];
  let dbReads = 0;
  const route = load("proxy.ts", { CANONICAL_HOST: "example.test", CORS_ALLOWED_ORIGINS: "https://example.test" }, {
    "next/server": { NextResponse: { json: Response.json, next: () => new Response(null, { headers: { "x-next": "1" } }), redirect: () => new Response(null, { status: 308 }) } },
    "next-auth/jwt": { getToken: async () => null },
    "@/lib/constants": {},
    "@/lib/security/admin-entry-pass": {},
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "192.0.2.1" },
    "@/lib/security/rate-limit": { incrementRateLimit: async (key: string, options: any) => { calls.push({ key, options }); return { resetAt: Date.now() + 10_000, ...result }; } },
    "@/lib/settings/admin-entry": { DEFAULT_ADMIN_ENTRY_PATH: "/admin-entry" },
    "@/lib/settings/site-availability-reader": { readSiteAvailability: () => { dbReads++; throw new Error("Unexpected DB read"); } },
    "@/lib/utils/async": load("lib/utils/async.ts"),
  });
  const request = (path: string, method = "GET") => Object.assign(new Request(`https://example.test${path}`, { method, headers: { host: "example.test", origin: "https://example.test" } }), { nextUrl: new URL(`https://example.test${path}`), cookies: { get: () => null, getAll: () => [] } });
  return { route, calls, request, dbReads: () => dbReads };
}

test("proxy applies shared limits to APIs, metadata reads and Server Actions before route work", async () => {
  for (const [path, method] of [["/api/chat", "POST"], ["/api/public/session-role", "GET"], ["/login", "POST"]]) {
    const h = proxyHarness({ allowed: false });
    const response = await h.route.proxy(h.request(path, method));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(h.calls).toHaveLength(1);
    expect(h.dbReads()).toBe(0);
    if (path.startsWith("/api/")) expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.test");
  }
  const h = proxyHarness({ allowed: false, reason: "unavailable" });
  expect((await h.route.proxy(h.request("/api/chat", "POST"))).status).toBe(503);
  expect(h.calls[0].options.failureMode).toBeUndefined();
  const preflight = proxyHarness({ allowed: false });
  expect((await preflight.route.proxy(preflight.request("/api/chat", "OPTIONS"))).status).toBe(204);
  expect(preflight.calls).toHaveLength(0);
});
