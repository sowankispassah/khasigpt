import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { z } from "zod";
import { normalizeAppSettingValueForWrite } from "@/lib/db/app-setting-validation";
import * as policy from "@/lib/explore/photo-cache-policy";

function load(file: string, mocks: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: any = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, AbortSignal, console: { info() {}, warn() {} }, require: (name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, ...globals });
  return exports;
}
function harness() {
  let now = Date.UTC(2026, 9, 5); let configuration = policy.parsePhotoCachePolicy(undefined);
  let photo: any = { imageUrl: "https://lh3.googleusercontent.com/photo", title: "Cafe", sourceUrl: "https://www.google.com/maps?cid=1" };
  let status = 200; let fail = false; let calls = 0; let probes = 0;
  const entries = new Map<string, { tags: string[]; value: Promise<unknown> }>();
  const module = load("lib/explore/photo-cache.ts", {
    "server-only": {}, "node:crypto": { createHash }, "./photo-cache-policy": policy,
    "./photo-cache-settings": { getPhotoCachePolicy: async () => configuration },
    "next/cache": {
      unstable_cache: (fn: any, keys: string[], options: any) => (...args: unknown[]) => {
        const key = JSON.stringify([keys, args]);
        if (!entries.has(key)) entries.set(key, { tags: options.tags, value: fn(...args).catch((error: unknown) => { entries.delete(key); throw error; }) });
        return entries.get(key)?.value;
      },
      revalidateTag: (tag: string) => { for (const [key, entry] of entries) if (entry.tags.includes(tag)) entries.delete(key); },
    },
  }, { Date: { now: () => now }, fetch: async (_url: URL, options: RequestInit) => { probes++; expect(options.method).toBe("HEAD"); expect(options.redirect).toBe("manual"); return new Response(null, { status }); } });
  const lookup = module.createSharedPhotoLookup("listing", async () => { calls++; if (fail) throw new Error("upstream_failed"); return photo; });
  return { lookup, calls: () => calls, probes: () => probes, advance: (seconds: number) => { now += seconds * 1000; },
    setPhoto: (value: any) => { photo = value; }, setStatus: (value: number) => { status = value; }, failure: (value: boolean) => { fail = value; },
    duration: (seconds: number) => { configuration = { ...configuration, successTtlSeconds: seconds }; },
    reset: () => { configuration = { ...configuration, generation: `${configuration.generation}-new` }; },
  };
}
test("photo policy bounds, missing settings and strict generic writer validation", () => {
  expect(policy.parsePhotoCachePolicy(undefined).successTtlSeconds).toBe(7 * 86_400);
  for (const seconds of [0, 3599, 365 * 86_400 + 1, 1.5, "86400"]) expect(policy.photoCacheDurationSchema.safeParse(seconds).success).toBe(false);
  expect(policy.photoCacheDurationSchema.safeParse(365 * 86_400).success).toBe(true);
  expect(() => normalizeAppSettingValueForWrite(policy.PHOTO_CACHE_SETTING_KEY, { successTtlSeconds: 0 })).toThrow();
});
test("successful lookups coalesce across users, honor changed expiry and reset without clearing duration", async () => {
  const h = harness(); const input = { placeId: "same-place" };
  const results = await Promise.all([h.lookup(input), h.lookup(input)]); expect(results[0]).toEqual(results[1]); expect(h.calls()).toBe(1);
  h.advance(2 * 86_400); await h.lookup(input); expect(h.calls()).toBe(1); expect(h.probes()).toBe(2);
  h.duration(86_400); await h.lookup(input); expect(h.calls()).toBe(2);
  h.duration(365 * 86_400); h.advance(200 * 86_400); await h.lookup(input); expect(h.calls()).toBe(2);
  h.reset(); await h.lookup(input); expect(h.calls()).toBe(3);
  h.advance(2 * 86_400); await h.lookup(input); expect(h.calls()).toBe(3);
});
test("missing photos expire at 24 hours despite annual success expiry, failures never cache", async () => {
  const h = harness(); h.duration(365 * 86_400); h.setPhoto(null);
  await h.lookup("missing"); h.advance(86_399); await h.lookup("missing"); expect(h.calls()).toBe(1);
  h.advance(1); await h.lookup("missing"); expect(h.calls()).toBe(2);
  h.failure(true); await expect(h.lookup("failed")).rejects.toThrow("upstream_failed");
  h.failure(false); await h.lookup("failed"); expect(h.calls()).toBe(4);
});
test("confirmed broken photos refresh, ambiguous HEAD failures preserve cache, unsafe hosts are never probed", async () => {
  const h = harness(); await h.lookup("place");
  h.setStatus(405); h.advance(86_400); await h.lookup("place"); expect(h.calls()).toBe(1);
  h.setStatus(404); h.setPhoto({ imageUrl: "https://lh3.googleusercontent.com/replacement", title: "Cafe", sourceUrl: "https://www.google.com/maps?cid=1" });
  h.advance(86_400); expect(await h.lookup("place")).toBeNull(); expect(h.calls()).toBe(2);
  // A replacement still broken is retained as a missing-photo result, not repeatedly charged.
  await h.lookup("place"); expect(h.calls()).toBe(2);
  h.setPhoto({ imageUrl: "https://attacker.test/image", title: "Cafe", sourceUrl: "https://example.com" });
  const before = h.probes(); expect(await h.lookup("unsafe")).toBeNull(); expect(h.probes()).toBe(before);
});
test("reset generation prevents a lookup started before reset from supplying the new cache", async () => {
  const h = harness(); const old = h.lookup("place"); h.reset(); await old; await h.lookup("place"); expect(h.calls()).toBe(2);
});
test("admin cache API rejects non-admins, invalid input and excess resets; failures remain retryable", async () => {
  let authorized = false; let allowed = true; let failed = false; const writes: unknown[] = [];
  const route = load("app/api/admin/explore/photo-cache/route.ts", {
    "next/server": { NextResponse: Response }, zod: { z }, "@/lib/explore/photo-cache-policy": policy,
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => authorized ? { id: "admin" } : null },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed }) },
    "@/lib/explore/photo-cache-settings": { readPhotoCachePolicy: async () => policy.parsePhotoCachePolicy(undefined), updatePhotoCachePolicy: async (input: any) => { if (failed) throw new Error("write_failed"); writes.push(input); return policy.parsePhotoCachePolicy(undefined); } },
  });
  const request = (value: unknown) => new Request("https://example.com/api/admin/explore/photo-cache", { method: "POST", body: JSON.stringify(value) });
  expect((await route.GET(request({}))).status).toBe(403); expect((await route.POST(request({ action: "reset" }))).status).toBe(403);
  authorized = true;
  expect((await route.POST(request({ action: "save", successTtlSeconds: 0 }))).status).toBe(400);
  expect((await route.POST(request({ action: "reset", generation: "fake" }))).status).toBe(400);
  allowed = false; expect((await route.POST(request({ action: "reset" }))).status).toBe(429);
  allowed = true; failed = true; expect((await route.POST(request({ action: "reset" }))).status).toBe(503);
  failed = false; const response = await route.POST(request({ action: "reset" })); expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(writes).toEqual([{ reset: true }]);
  expect((await route.POST(request({ action: "save", successTtlSeconds: 365 * 86_400 }))).status).toBe(200);
  expect(writes[1]).toEqual({ successTtlSeconds: 365 * 86_400 });
});
