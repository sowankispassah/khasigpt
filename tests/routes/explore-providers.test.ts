import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { z } from "zod";
import { normalizeAppSettingValueForWrite } from "@/lib/db/app-setting-validation";
import { mergeExploreDetails } from "@/lib/explore/details";
import * as geo from "@/lib/explore/geo";
import * as budgetPolicy from "@/lib/explore/google-budget-policy";
import * as providers from "@/lib/explore/providers";
import { parseSerpentPlaces } from "@/lib/explore/serpent-results";
import { exploreSearchInputSchema } from "@/lib/explore/validation";


const mapsStatus = () => Response.json({ success: true, data: { limits: {
  timeout_param: { min: 5 }, endpoints: { "/api/maps/search/quick": { max_seconds: 150 } },
} } });

const location = { id: "test", label: "Shillong, Meghalaya", latitude: 25.57, longitude: 91.88, source: "manual" as const, accuracy: null };
function load(file: string, mocks: Record<string, unknown>, env: Record<string, string> = {}, globals: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, AbortSignal, process: { env }, console: { info: () => {} }, require: (name: string) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, ...globals });
  return exports;
}

test("missing provider preserves OpenStreetMap and invalid saved selections fail explicitly", () => {
  expect(providers.parseExploreProvider(undefined)).toBe("openstreetmap");
  expect(() => providers.parseExploreProvider("other")).toThrow();
  expect(normalizeAppSettingValueForWrite(providers.EXPLORE_PROVIDER_SETTING_KEY, '"google"')).toBe("google");
  expect(() => normalizeAppSettingValueForWrite(providers.EXPLORE_PROVIDER_SETTING_KEY, null)).toThrow();
  expect(providers.exploreProviderConfigured("google", {})).toBe(false);
  expect(providers.exploreProviderConfigured("serper", { SERPER_API_KEY: " " })).toBe(false);
});

test("selected provider failures and empty results never dispatch other paid providers", async () => {
  const calls: string[] = [];
  const handlers = Object.fromEntries(providers.EXPLORE_PROVIDERS.map((provider) => [provider, async () => { calls.push(provider); if (provider === "google") throw new Error("HTTP 429"); return []; }])) as Record<providers.ExploreProvider, () => Promise<never[]>>;
  await expect(providers.dispatchExploreProvider("google", handlers)).rejects.toThrow("HTTP 429");
  expect(calls).toEqual(["google"]);
  expect(await providers.dispatchExploreProvider("serpent", handlers)).toEqual([]);
  expect(calls).toEqual(["google", "serpent"]);
});

test("Serpent keeps nearby core records, safe photos and source attribution while skipping malformed places", () => {
  const place = { place_id: "a", name: "Test restaurant", coordinates: { latitude: 25.57, longitude: 91.88 }, address: { formatted: "Shillong" }, rating: 4.2, review_count: 12, maps_url: "https://www.google.com/maps?cid=1", cover_image: "https://lh3.googleusercontent.com/photo", detail_status: "complete" };
  const results = parseSerpentPlaces({ success: true, places: [place, place, { ...place, place_id: "b", cover_image: "javascript:alert(1)", images: [], detail_status: "core_only" }, { ...place, coordinates: { latitude: 0, longitude: 0 } }, { name: "broken" }, { ...place, coordinates: { latitude: Number.NaN, longitude: 91.88 } }] }, { location, radiusKm: 5 });
  expect(results).toHaveLength(2);
  expect(results[0]).toMatchObject({ name: place.name, address: "Shillong", imageUrl: place.cover_image, rating: 4.2, reviewCount: 12 });
  expect(results[0].attributions[0].uri).toBe(place.maps_url);
  expect(results[1].imageUrl).toBeNull();
  expect(() => parseSerpentPlaces({ success: false, places: [] }, { location, radiusKm: 5 })).toThrow();
});

function adminHarness(admin: boolean, env: Record<string, string> = {}) {
  let writes = 0; let reads = 0; const invalidations: unknown[] = [];
  const route = load("app/api/admin/explore/provider/route.ts", {
    "next/cache": { revalidateTag: (...args: unknown[]) => invalidations.push(args) },
    "next/server": { NextResponse: Response }, zod: { z },
    "@/lib/db/queries": { setAppSetting: async () => { writes++; } },
    "@/lib/explore/provider-config": { EXPLORE_PROVIDER_CACHE_TAG: "explore-provider", readExploreProvider: async () => { reads++; return "openstreetmap"; } },
    "@/lib/explore/providers": providers,
    "@/lib/explore/google-budget-policy": budgetPolicy,
    "@/lib/explore/google-budget": { readGoogleBudget: async () => budgetPolicy.parseGoogleBudget(undefined), saveGoogleBudgetAndProvider: async () => { writes++; return budgetPolicy.parseGoogleBudget(undefined); } },
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => admin ? { id: "admin" } : null },
  }, env);
  return { route, writes: () => writes, reads: () => reads, invalidations };
}
const request = (provider: unknown) => new Request("https://example.com/api/admin/explore/provider", { method: "POST", body: JSON.stringify({ provider }) });

test("provider settings enforce server admin authorization before reads or writes", async () => {
  const h = adminHarness(false);
  expect((await h.route.GET(request("google"))).status).toBe(403);
  expect((await h.route.POST(request("google"))).status).toBe(403);
  expect(h.reads()).toBe(0); expect(h.writes()).toBe(0);
});
test("unconfigured and invalid providers cannot replace the active provider", async () => {
  const h = adminHarness(true);
  expect((await h.route.POST(request("google"))).status).toBe(409);
  expect((await h.route.POST(request("unknown"))).status).toBe(400);
  expect(h.writes()).toBe(0); expect(h.invalidations).toEqual([]);
});
test("automatic fallback requires a configured selected fallback and validates usage inputs", async () => {
  const h = adminHarness(true, { GOOGLE_MAPS_API_KEY: "private-test-key" });
  const budget = { ...budgetPolicy.parseGoogleBudget(undefined), enabled: true };
  const { searchUsed: _searchUsed, photoUsed: _photoUsed, ...googleBudget } = budget;
  const post = (value: unknown) => new Request("https://example.com/api/admin/explore/provider", { method: "POST", body: JSON.stringify(value) });
  expect((await h.route.POST(post({ provider: "google", googleBudget }))).status).toBe(409);
  expect((await h.route.POST(post({ provider: "google", googleBudget: { ...googleBudget, searchLimit: -1 } }))).status).toBe(400);
  expect(h.writes()).toBe(0);
  expect((await h.route.POST(post({ provider: "google", googleBudget: { ...googleBudget, fallbackProvider: "openstreetmap" } }))).status).toBe(200);
  expect(h.writes()).toBe(1);
});
test("saving invalidates only the provider cache immediately and never returns secrets", async () => {
  const h = adminHarness(true, { GOOGLE_MAPS_API_KEY: "private-test-key" });
  const response = await h.route.POST(request("google"));
  expect(response.status).toBe(200); expect(h.writes()).toBe(1);
  expect(h.invalidations).toEqual([["explore-provider", { expire: 0 }]]);
  expect(await response.text()).not.toContain("private-test-key");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

test("Google retrieves photos beyond the first six, avoids out-of-radius charges and isolates photo failures", async () => {
  const photoCalls: string[] = [];
  let searches = 0;
  const service = load("lib/explore/places-service.ts", {
    "server-only": {}, "node:crypto": { createHash },
    "@/lib/explore/geo": geo,
    "@/lib/explore/wikimedia-images": {},
    "./provider-config": { getExploreProvider: async () => "google" },
    "./providers": providers,
    "./google-budget-policy": budgetPolicy,
    "./google-fallback": { runGoogleWithFallback: (google: () => Promise<unknown>) => google() },
    "./serper-places": { searchSerperPlaces: () => { throw new Error("Unexpected paid fallback"); } },
    "./serpent-places": { searchSerpentPlaces: () => { throw new Error("Unexpected paid fallback"); } },
    "./place-images": { addExplorePlaceImages: () => { throw new Error("Unexpected image service"); } },
  }, { GOOGLE_MAPS_API_KEY: "private-test-key" }, {
    fetch: async (endpoint: string | URL) => {
      const url = String(endpoint);
      if (url.includes(":searchText")) {
        searches++;
        return Response.json({ places: Array.from({ length: 9 }, (_, index) => ({ id: `p${index}`, displayName: { text: `Place ${index}` }, location: index === 8 ? { latitude: 0, longitude: 0 } : location, googleMapsUri: `https://www.google.com/maps?cid=${index}`, photos: [{ name: `places/p${index}/photos/photo${index}` }] })) });
      }
      photoCalls.push(url);
      if (url.includes("photo0")) throw new Error("Photo unavailable");
      return Response.json({ photoUri: "https://lh3.googleusercontent.com/photo" });
    },
  });
  const results = (await service.searchExplorePlaces({ categoryQuery: null, location, query: "restaurants", radiusKm: 5 })).results;
  expect(searches).toBe(1); expect(photoCalls).toHaveLength(8);
  expect(results).toHaveLength(8); expect(results[0].imageUrl).toBeNull();
  expect(results[7].imageUrl).toBe("https://lh3.googleusercontent.com/photo");
});

test("Serpent sends server credentials and coordinates to its documented Maps endpoint", async () => {
  let requested: URL | null = null;
  let headers: Record<string, string> = {};
  let status = 200;
  const adapter = load("lib/explore/serpent-places.ts", {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./serpent-results": { parseSerpentPlaces },
  }, { SERPENT_API_KEY: "private-test-key" }, {
    fetch: async (url: URL, init: { headers: Record<string, string> }) => { if (String(url).endsWith("/api/status")) return mapsStatus(); requested = url; headers = init.headers; return Response.json({ success: true, places: [] }, { status }); },
  });
  const input = { categoryQuery: null, location, query: "restaurants", radiusKm: 5 };
  expect(await adapter.searchSerpentPlaces(input)).toEqual([]);
  expect(String(requested)).toContain("https://api.apiserpent.com/api/maps/search/quick?");
  expect(String(requested)).toContain("lat=25.57");
  expect(new URL(String(requested)).searchParams.get("timeout")).toBe("40");
  expect(new URL(String(requested)).searchParams.get("zoom")).toBe("9");
  expect(new URL(String(requested)).searchParams.get("q")).toBe("restaurants near shillong, meghalaya");
  expect(headers).toEqual({ "X-API-Key": "private-test-key" });
  expect(String(requested)).not.toContain("private-test-key");
  status = 402;
  await expect(adapter.searchSerpentPlaces(input)).rejects.toThrow("HTTP 402");
});

test("Serpent incomplete empty responses fail explicitly and remain retryable", async () => {
  let calls = 0;
  const adapter = load("lib/explore/serpent-places.ts", {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./serpent-results": { parseSerpentPlaces },
  }, { SERPENT_API_KEY: "test" }, {
    fetch: async (url: URL) => { if (String(url).endsWith("/api/status")) return mapsStatus(); calls++; return Response.json({ success: true, meta: { partial: true }, places: [] }); },
  });
  const input = { categoryQuery: null, location, query: "rice", radiusKm: 50 };
  await expect(adapter.searchSerpentPlaces(input)).rejects.toThrow("place_search_incomplete");
  await expect(adapter.searchSerpentPlaces(input)).rejects.toThrow("place_search_incomplete");
  expect(calls).toBe(2);
});


test("Serpent coalesces concurrent radius requests and keeps partial core results nearest first", async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const adapter = load("lib/explore/serpent-places.ts", {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./serpent-results": { parseSerpentPlaces },
  }, { SERPENT_API_KEY: "test" }, {
    fetch: async (url: URL) => {
      if (String(url).endsWith("/api/status")) return mapsStatus();
      calls++;
      await gate;
      return Response.json({ success: true, meta: { partial: true }, places: [
        { place_id: "far", name: "Far", coordinates: { latitude:25.7, longitude:91.88 }, detail_status:"core_only" },
        { place_id: "near", name: "Near", coordinates:location, detail_status:"core_only" },
      ] });
    },
  });
  const input = { categoryQuery: null, location, query:"rice", radiusKm:50 };
  const broad = adapter.searchSerpentPlaces(input);
  const narrow = adapter.searchSerpentPlaces({ ...input, radiusKm:1 });
  release();
  expect((await broad).map((p: any) => p.name)).toEqual(["Near", "Far"]);
  expect((await narrow).map((p: any) => p.name)).toEqual(["Near"]);
  expect(calls).toBe(1);
});


test("unavailable Maps limits do not block searches and preserve a bounded request", async () => {
  let budget: string | null = null;
  const adapter = load("lib/explore/serpent-places.ts", {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./serpent-results": { parseSerpentPlaces },
  }, { SERPENT_API_KEY: "test" }, {
    fetch: async (url: URL) => {
      if (String(url).endsWith("/api/status")) return new Response("Unavailable", { status: 503 });
      budget = new URL(String(url)).searchParams.get("timeout");
      return Response.json({ success: true, places: [] });
    },
  });
  expect(await adapter.searchSerpentPlaces({ categoryQuery:null, location, query:"rice", radiusKm:50 })).toEqual([]);
  expect(budget).toBe("40");
});

test("Maps list ignores broken profile avatars and retains business photo fallbacks", () => {
  const avatar = "https://lh3.googleusercontent.com/-Fj79CJkpzFU/AAAAAAAAAAI/AAAAAAAAAAA/yFkYUQ_-dSU/s44-p-k-no-ns-nd/photo.jpg";
  const businessPhoto = "https://lh3.googleusercontent.com/gps-cs-s/business=w86-h114-k-no";
  const core = { name: "Restaurant", coordinates: location, thumbnail: { url: avatar } };
  const results = parseSerpentPlaces({ success: true, places: [
    { ...core, place_id: "avatar" },
    { ...core, place_id: "business", cover_image: avatar, images: [{ url: businessPhoto }] },
  ] }, { location, radiusKm: 50 });
  expect(results[0].imageUrl).toBeNull();
  expect(results[1].imageUrl).toBe(businessPhoto);
});

for (const [maximum, expected] of [[45, "40"], [20, "20"]] as const) {
  test(`Maps discovery budget respects the published ${maximum}s ceiling`, async () => {
    let requested: URL | null = null;
    const adapter = load("lib/explore/serpent-places.ts", {
      "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
      "./serpent-results": { parseSerpentPlaces },
    }, { SERPENT_API_KEY: "test" }, {
      fetch: async (url: URL) => {
        if (String(url).endsWith("/api/status")) return Response.json({ data: { limits: {
          timeout_param: { min: 5 }, endpoints: { "/api/maps/search/quick": { max_seconds: maximum } },
        } } });
        requested = url;
        return Response.json({ success: true, places: [] });
      },
    });
    await adapter.searchSerpentPlaces({ categoryQuery: null, location, query: "rice", radiusKm: 50 });
    expect(new URL(String(requested)).searchParams.get("timeout")).toBe(expected);
  });
}

test("fast Maps list requests skip all detail pages and preserve safe list thumbnails", async () => {
  const urls: URL[] = [];
  const adapter = load("lib/explore/serpent-places.ts", {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./serpent-results": { parseSerpentPlaces },
  }, { SERPENT_API_KEY: "test" }, {
    fetch: async (url: URL) => {
      if (String(url).endsWith("/api/status")) return mapsStatus();
      urls.push(url);
      return Response.json({ success: true, places: [{
        place_id: "near", name: "Cafe", coordinates: location,
        thumbnail: { url: "https://lh3.googleusercontent.com/photo" }, detail_status: "core_only",
      }] });
    },
  });
  const input = { categoryQuery: null, location, query: "restaurant", radiusKm: 50 };
  const list = await adapter.searchSerpentPlaces({ ...input, detailMode: "list" });
  expect(urls[0].pathname).toBe("/api/maps/search");
  expect(urls[0].searchParams.get("detail")).toBe("0");
  expect(urls[0].searchParams.get("limit")).toBe("20");
  expect(list[0].imageUrl).toBe("https://lh3.googleusercontent.com/photo");
  await adapter.searchSerpentPlaces(input);
  expect(urls[1].pathname).toBe("/api/maps/search/quick");
});

test("legacy clients retain full detail mode; background details preserve list membership and distance", () => {
  const input = { query: "rice", location, radiusKm: 50, clientRequestId: "test" };
  expect(exploreSearchInputSchema.parse(input).detailMode).toBe("full");
  expect(exploreSearchInputSchema.parse({ ...input, detailMode: "list" }).detailMode).toBe("list");
  const list = parseSerpentPlaces({ success: true, places: [{ place_id: "a", name: "Cafe", coordinates: location }] }, { location, radiusKm: 50 });
  const full = [{ ...list[0], distanceKm: 200, name: "Changed", imageUrl: "https://lh3.googleusercontent.com/photo" }, { ...list[0], id: "extra" }];
  const merged = mergeExploreDetails(list, full);
  expect(merged).toHaveLength(1);
  expect(merged[0]).toMatchObject({ id: list[0].id, name: "Cafe", distanceKm: 0, imageUrl: full[0].imageUrl });
});

test("fast list API response preserves auth and returns before summaries, billing or detail hydration", async () => {
  let authenticated = true;
  let chats = 0;
  const calls: string[] = [];
  const forbiddenOptionalCall = () => { throw new Error("Optional work blocked the list"); };
  const route = load("app/api/explore/search/route.ts", {
    "node:crypto": { createHash }, "next/server": { NextResponse: Response }, zod: { z },
    "@/lib/ai/model-registry": { getModelRegistry: forbiddenOptionalCall },
    "@/lib/api/auth": { getAuthenticatedUser: async () => authenticated ? { user: { id: "user", role: "admin" } } : null },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/billing/search-budget": {}, "@/lib/chat/free-daily-limit": {}, "@/lib/constants": {},
    "@/lib/db/queries": {
      saveChat: async () => { chats++; },
      getChatById: async ({ id }: { id: string }) => ({ id, userId: "user" }),
      saveMessages: forbiddenOptionalCall, recordTokenUsage: forbiddenOptionalCall,
    },
    "@/lib/errors": { ChatSDKError: class extends Error {} },
    "@/lib/explore/config": { isExploreMeghalayaEnabledForRole: async () => true },
    "@/lib/explore/places-service": { searchExplorePlaces: async (input: { detailMode: string }) => {
      calls.push(input.detailMode);
      return { results: [{ id: "a", name: "Cafe", distanceKm: 1 }], detailsPending: input.detailMode === "list" };
    } },
    "@/lib/explore/service": { getEnabledExploreSelection: async () => ({ category: null, subcategory: null }) },
    "@/lib/explore/types": { shouldEnrichExploreSearch: (mode: string) => mode === "enriched" },
    "@/lib/explore/validation": { exploreSearchInputSchema },
    "@/lib/free-messages": {},
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "client" },
    "@/lib/settings/user-feature-access": {},
    "@/lib/utils": { generateUUID: () => "1ae3affc-d65e-44c9-a5de-fb9570945740" },
    "@/lib/web-search/config": { loadWebSearchConfig: forbiddenOptionalCall },
    "@/lib/web-search/google-allowance-policy": {}, "@/lib/web-search/service": {},
  });
  const input = { query: "restaurant", location, radiusKm: 50, clientRequestId: "test", detailMode: "list", searchMode: "enriched" };
  const post = (body: unknown) => new Request("https://example.com/api/explore/search", { method: "POST", body: JSON.stringify(body) });
  const response = await route.POST(post(input));
  expect(response.status).toBe(200);
  const list = await response.json();
  expect(list.detailsPending).toBe(true);
  expect(list.results[0].name).toBe("Cafe");
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  const full = await route.POST(post({ ...input, searchMode: "places_only", detailMode: "full", chatId: list.chatId, locationContextKey: list.locationContextKey }));
  expect(full.status).toBe(200);
  expect(chats).toBe(1);
  authenticated = false;
  expect((await route.POST(post(input))).status).toBe(401);
  expect(calls).toEqual(["list", "full"]);
});
