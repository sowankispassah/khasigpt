import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { z } from "zod";
import { normalizeAppSettingValueForWrite } from "@/lib/db/app-setting-validation";
import { mergeExploreDetails } from "@/lib/explore/details";
import * as discovery from "@/lib/explore/discovery";
import * as geo from "@/lib/explore/geo";
import * as budgetPolicy from "@/lib/explore/google-budget-policy";
import * as googleIntent from "@/lib/explore/google-search-intent";
import * as imageMatching from "@/lib/explore/image-matching";
import * as presets from "@/lib/explore/preset-search";
import * as providers from "@/lib/explore/providers";
import * as serpentPolicy from "@/lib/explore/serpent-policy";
import { parseSerpentPlaces, placePhoto } from "@/lib/explore/serpent-results";
import { exploreSearchInputSchema } from "@/lib/explore/validation";


const mapsStatus = () => Response.json({ success: true, data: { limits: {
  timeout_param: { min: 5 }, endpoints: { "/api/maps/search/quick": { max_seconds: 150 } },
} } });

const location = { id: "test", label: "Shillong, Meghalaya", latitude: 25.57, longitude: 91.88, source: "manual" as const, accuracy: null };
function photoCacheMock() {
  return { createSharedPhotoLookup: (_namespace: string, fn: any) => {
    const cache = new Map();
    return (input: any) => {
      const key = JSON.stringify(input);
      if (!cache.has(key)) cache.set(key, fn(input).catch((error: unknown) => { cache.delete(key); throw error; }));
      return cache.get(key);
    };
  } };
}
function load(file: string, mocks: Record<string, unknown>, env: Record<string, string> = {}, globals: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, URL, AbortSignal, process: { env }, console: { info: () => {}, warn: () => {} }, require: (name: string) => {
    if (name === "./discovery") return discovery;
    if (name === "./google-search-intent") return googleIntent;
    if (name === "@/lib/explore/preset-search") return presets;
    if (!(name in mocks)) throw new Error(`Unexpected dependency ${name}`);
    return mocks[name];
  }, ...globals });
  return exports;
}

test("visible photo lookups leave capacity for category search and release slots on failure", async () => {
  const started: string[] = [];
  const releases: Array<(response: Response) => void> = [];
  const client = load("lib/explore/photo-client.ts", {}, {}, {
    fetch: async (_url: string, init: { body: string }) => {
      started.push(JSON.parse(init.body).token);
      return new Promise<Response>((resolve) => releases.push(resolve));
    },
  });
  const first = client.loadExplorePhoto("first");
  const failed = client.loadExplorePhoto("failed");
  const queued = client.loadExplorePhoto("queued");
  expect(client.loadExplorePhoto("first")).toBe(first);
  await Promise.resolve();
  // A three-slot account can accept a category search during photo loading.
  expect(started).toEqual(["first", "failed"]);
  expect(started.length + 1).toBeLessThanOrEqual(3);
  const rejection = expect(failed).rejects.toThrow("photo_unavailable");
  releases[1](new Response(null, { status: 503 }));
  await rejection;
  expect(started).toEqual(["first", "failed", "queued"]);
  releases[0](Response.json({ photo: null }));
  releases[2](Response.json({ photo: null }));
  expect(await Promise.all([first, queued])).toEqual([null, null]);
  const retry = client.loadExplorePhoto("failed");
  await Promise.resolve();
  expect(started).toEqual(["first", "failed", "queued", "failed"]);
  releases[3](Response.json({ photo: null }));
  expect(await retry).toBeNull();
});

function discoveryHarness() {
  const calls: string[] = [];
  const failures = new Set<string>();
  const restaurant = { id: "serpent-cafe", name: "Langbang Cafe", latitude: 25.57, longitude: 91.88, distanceKm: 0.3, imageUrl: null };
  const shop = { ...restaurant, id: "serpent-shop", name: "Local shop", distanceKm: 0.1 };
  const falls = { ...restaurant, id: "serpent-falls", name: "Waterfall", distanceKm: 1.2 };
  const service = load("lib/explore/places-service.ts", {
    "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
    "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
    "./provider-config": { getExploreProvider: async () => "serpent", getSerpentMapsQuickEnabled: async () => true, getSerpentPhotoSource: async () => "maps_place" },
    "./providers": providers, "./serpent-policy": serpentPolicy, "./google-fallback": {},
    "./serpent-places": { searchSerpentPlaces: async (input: any) => {
      calls.push(input.query);
      if (failures.has(input.query)) throw new Error("lookup_unavailable");
      return input.query === "restaurant" ? [restaurant] : input.query === "shops and services" ? [shop, restaurant] : [falls];
    } }, "./serper-places": {}, "./place-images": {},
  }, { SERPENT_API_KEY: "test" });
  return { service, calls, failures };
}

test("initial discovery includes food, shops and attractions, deduplicates and sorts nearest first without bulk photo enrichment", async () => {
  const h = discoveryHarness();
  const result = await h.service.searchExplorePlaces({ location, radiusKm: 50, query: discovery.DISCOVERY_QUERY, categoryQuery: null, detailMode: "list" });
  expect(h.calls).toEqual([...discovery.DISCOVERY_TERMS]);
  expect(result.results.map((place: any) => place.name)).toEqual(["Local shop", "Langbang Cafe", "Waterfall"]);
  expect(result).toMatchObject({ partial: false, imageSearch: true, photoLookupSource: "maps_place", detailsPending: false });
  h.calls.length = 0;
  await h.service.searchExplorePlaces({ location, radiusKm: 50, query: "restaurant", categoryQuery: null });
  expect(h.calls).toEqual(["restaurant"]);
});

test("discovery preserves available places with explicit partial state; total failures remain retryable errors", async () => {
  const h = discoveryHarness();
  const input = { location, radiusKm: 50, query: discovery.DISCOVERY_QUERY, categoryQuery: null };
  h.failures.add("shops and services");
  expect(await h.service.searchExplorePlaces(input)).toMatchObject({ partial: true, results: [{ name: "Langbang Cafe" }, { name: "Waterfall" }] });
  for (const query of discovery.DISCOVERY_TERMS) h.failures.add(query);
  await expect(h.service.searchExplorePlaces(input)).rejects.toThrow("lookup_unavailable");
  h.failures.clear();
  expect((await h.service.searchExplorePlaces(input)).partial).toBe(false);
});

test("discovery deduplicates names and coordinates without collapsing separate branches or specific category searches", () => {
  const place = { id: "a", name: "Cafe", latitude: 25.57, longitude: 91.88, distanceKm: 0.1 } as any;
  expect(discovery.mergeDiscoveryResults([[place], [{ ...place, id: "b", name: " cafe " }, { ...place, id: "c", latitude: 25.58, distanceKm: 1 }]])).toHaveLength(2);
  expect(discovery.isGeneralDiscovery({ query: discovery.DISCOVERY_QUERY, categoryQuery: "hotels" })).toBe(false);
});

test("Google initial discovery and food presets use coordinate searches; named searches stay textual", async () => {
  let admissions = 0;
  const calls: Array<{ url: string; body: any }> = [];
  const service = load("lib/explore/places-service.ts", {
    "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
    "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
    "./provider-config": { getExploreProvider: async () => "google" },
    "./providers": providers, "./serpent-policy": serpentPolicy,
    "./google-fallback": { runGoogleWithFallback: async (google: () => Promise<unknown>) => { admissions++; return google(); } },
    "./serpent-places": {}, "./serper-places": {}, "./place-images": {},
  }, { GOOGLE_MAPS_API_KEY: "test" }, {
    fetch: async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return Response.json({ places: [
        { id: "cafe", displayName: { text: "Langbang Cafe" }, location: { latitude: 25.576, longitude: 91.88 }, googleMapsUri: "https://maps.google.com/?cid=2" },
        { id: "gaming", displayName: { text: "NXGS Gaming Studio" }, location: { latitude: 25.5701, longitude: 91.88 }, googleMapsUri: "https://maps.google.com/?cid=1" },
        { id: "far", displayName: { text: "Outside radius" }, location: { latitude: 26.57, longitude: 91.88 }, googleMapsUri: "https://maps.google.com/?cid=3" },
        { id: "invalid", displayName: { text: "Invalid coordinates" }, location: { latitude: 999, longitude: 91.88 }, googleMapsUri: "https://maps.google.com/?cid=4" },
      ] });
    },
  });
  const input = { location, radiusKm: 50, query: discovery.DISCOVERY_QUERY, categoryQuery: null };
  const result = await service.searchExplorePlaces(input);
  expect(admissions).toBe(3);
  expect(calls).toEqual([["restaurant", "cafe"], undefined, ["tourist_attraction", "park", "hotel"]].map((types) => ({ url: "https://places.googleapis.com/v1/places:searchNearby", body: {
    maxResultCount: 20, rankPreference: "DISTANCE",
    ...(types ? { includedTypes: types } : {}),
    locationRestriction: { circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: 50_000 } },
  } })));
  expect(result.results.map((place: any) => place.name)).toEqual(["NXGS Gaming Studio", "Langbang Cafe"]);
  await service.searchExplorePlaces({ ...input, query: "nxgs" });
  await service.searchExplorePlaces({ ...input, query: "restaurant, food, drinks" });
  expect(admissions).toBe(7);
  expect(calls[3].url).toBe("https://places.googleapis.com/v1/places:searchText");
  expect(calls[3].body.textQuery).toBe("nxgs");
  expect(calls.slice(4)).toEqual([["restaurant", "cafe"], ["restaurant", "cafe"], ["bar", "cafe", "coffee_shop"]].map((includedTypes) => ({ url: "https://places.googleapis.com/v1/places:searchNearby", body: {
    maxResultCount: 20, rankPreference: "DISTANCE", includedTypes,
    locationRestriction: { circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: 50_000 } },
  } })));
  expect(calls[3].body.locationRestriction.rectangle).toEqual(geo.getRadiusBoundingBox(location, 50));
  const restaurantResults = await service.searchExplorePlaces({ ...input, query: "restaurant" });
  expect(calls[7].body.includedTypes).toEqual(["restaurant", "cafe"]);
  expect(restaurantResults.results.map((place: any) => place.name)).toContain("Langbang Cafe");
});

test("comma keywords are independent alternatives, with duplicates removed and multiword constraints preserved", () => {
  expect(discovery.expandExploreKeywords({ query: " restaurant, food, drinks, RESTAURANT, , fast food ", categoryQuery: null }))
    .toEqual(["RESTAURANT", "food", "drinks", "fast food"].map(query => ({ query, categoryQuery: null })));
  expect(discovery.expandExploreKeywords({ query: "vegetarian", categoryQuery: "restaurant, cafe" }))
    .toEqual([{ query: "vegetarian", categoryQuery: "restaurant" }, { query: "vegetarian", categoryQuery: "cafe" }]);
  expect(discovery.expandExploreKeywords({ query: "Langbang Cafe", categoryQuery: null }))
    .toEqual([{ query: "Langbang Cafe", categoryQuery: null }]);
  expect(() => discovery.expandExploreKeywords({ query: "a,b,c,d,e,f,g,h,i", categoryQuery: null })).toThrow("invalid_explore_keywords");
});

test("Serpent keyword searches merge any matching place, preserve photo policy, and tolerate one failed keyword", async () => {
  const h = discoveryHarness();
  const input = { location, radiusKm: 50, query: "restaurant, shops and services, places to visit, RESTAURANT", categoryQuery: null, detailMode: "list" };
  const result = await h.service.searchExplorePlaces(input);
  expect(h.calls).toEqual(["RESTAURANT", "shops and services", "places to visit"]);
  expect(result.results.map((place: any) => place.name)).toEqual(["Local shop", "Langbang Cafe", "Waterfall"]);
  expect(result).toMatchObject({ partial: false, imageSearch: true, photoLookupSource: "maps_place" });
  h.failures.add("shops and services");
  expect(await h.service.searchExplorePlaces(input)).toMatchObject({ partial: true });
  h.failures.add("RESTAURANT"); h.failures.add("places to visit");
  await expect(h.service.searchExplorePlaces(input)).rejects.toThrow("lookup_unavailable");
});

test("Serper receives separate keyword phrases and preserves a user's refinement for each category alternative", async () => {
  const calls: any[] = [];
  const service = load("lib/explore/places-service.ts", {
    "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
    "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
    "./provider-config": { getExploreProvider: async () => "serper" },
    "./providers": providers, "./serpent-policy": serpentPolicy, "./google-fallback": {},
    "./serpent-places": {}, "./serper-places": { searchSerperPlaces: async (input: any) => { calls.push(input); return []; } },
    "./place-images": { addExplorePlaceImages: async (places: any[]) => places },
  }, { SERPER_API_KEY: "test" });
  await service.searchExplorePlaces({ location, radiusKm: 50, query: "restaurant, food, drinks", categoryQuery: null });
  expect(calls.map(({ query, categoryQuery }) => ({ query, categoryQuery }))).toEqual(["restaurant", "food", "drinks"].map(query => ({ query, categoryQuery: null })));
  calls.length = 0;
  await service.searchExplorePlaces({ location, radiusKm: 50, query: "vegetarian", categoryQuery: "restaurant, cafe" });
  expect(calls.map(({ query, categoryQuery }) => ({ query, categoryQuery }))).toEqual([{ query: "vegetarian", categoryQuery: "restaurant" }, { query: "vegetarian", categoryQuery: "cafe" }]);
});

test("Google food intent includes cafes without discarding names, locations or user constraints", () => {
  const types = (query: string, categoryQuery: string | null = null) => googleIntent.googleNearbyFoodTypes({ query, categoryQuery });
  expect(types("restaurants")).toEqual(["restaurant", "cafe"]);
  expect(types(" Restaurant, FOOD, drinks ", "restaurant")).toEqual(["restaurant", "cafe", "bar", "coffee_shop"]);
  expect(types("cafes near me")).toEqual(["cafe", "coffee_shop"]);
  expect(types("restaurant and cafe nearby")).toEqual(["restaurant", "cafe", "coffee_shop"]);
  for (const query of ["Langbang Cafe", "nxgs", "vegetarian", "restaurant under 500", "restaurants in Jowai", "food delivery", "__proto__", ""]) {
    expect(types(query)).toBeUndefined();
  }
  expect(types("Langbang", "restaurant, food, drinks")).toBeUndefined();
});

test("Google initial discovery preserves the admin-selected fallback's full discovery and photo policy", async () => {
  const queries: string[] = [];
  const service = load("lib/explore/places-service.ts", {
    "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
    "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
    "./provider-config": { getExploreProvider: async () => "google", getSerpentMapsQuickEnabled: async () => true, getSerpentPhotoSource: async () => "maps_place" },
    "./providers": providers, "./serpent-policy": serpentPolicy,
    "./google-fallback": { runGoogleWithFallback: async (_google: unknown, alternatives: any) => alternatives.serpent() },
    "./serpent-places": { searchSerpentPlaces: async (input: any) => {
      queries.push(input.query);
      return [{ id: input.query, name: input.query, latitude: 25.57, longitude: 91.88, distanceKm: 0.1 }];
    } }, "./serper-places": {}, "./place-images": {},
  }, { GOOGLE_MAPS_API_KEY: "test", SERPENT_API_KEY: "test" });
  const result = await service.searchExplorePlaces({ location, radiusKm: 50, query: discovery.DISCOVERY_QUERY, categoryQuery: null, detailMode: "list" });
  expect(queries).toEqual([...discovery.DISCOVERY_TERMS]);
  expect(result).toMatchObject({ source: "google_maps", partial: false, imageSearch: true, photoLookupSource: "maps_place", detailsPending: false });
  expect(result.results).toHaveLength(3);
  queries.length = 0;
  await service.searchExplorePlaces({ location, radiusKm: 50, query: "restaurant, food, drinks", categoryQuery: null, detailMode: "list" });
  expect(queries).toEqual(["restaurant", "food", "drinks"]);
});

test("missing provider preserves OpenStreetMap and invalid saved selections fail explicitly", () => {
  expect(providers.parseExploreProvider(undefined)).toBe("openstreetmap");
  expect(() => providers.parseExploreProvider("other")).toThrow();
  expect(normalizeAppSettingValueForWrite(providers.EXPLORE_PROVIDER_SETTING_KEY, '"google"')).toBe("google");
  expect(() => normalizeAppSettingValueForWrite(providers.EXPLORE_PROVIDER_SETTING_KEY, null)).toThrow();
  expect(providers.exploreProviderConfigured("google", {})).toBe(false);
  expect(providers.exploreProviderConfigured("serper", { SERPER_API_KEY: " " })).toBe(false);
});

test("Serpent Maps Quick defaults and validation", () => {
  expect(serpentPolicy.parseSerpentMapsQuickEnabled(undefined)).toBe(true);
  expect(serpentPolicy.parseSerpentMapsQuickEnabled(false)).toBe(false);
  expect(() => serpentPolicy.parseSerpentMapsQuickEnabled("false")).toThrow();
  expect(normalizeAppSettingValueForWrite(serpentPolicy.SERPENT_MAPS_QUICK_SETTING_KEY, false)).toBe(false);
  expect(() => normalizeAppSettingValueForWrite(serpentPolicy.SERPENT_MAPS_QUICK_SETTING_KEY, null)).toThrow();
});

for (const fallback of [false, true]) {
  for (const enabled of [false, true]) {
    test(`Serpent ${fallback ? "fallback" : "primary"} enforces Maps Quick ${enabled ? "enabled" : "disabled"}`, async () => {
      const calls: string[] = [];
      const service = load("lib/explore/places-service.ts", {
        "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
        "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
        "./provider-config": { getExploreProvider: async () => fallback ? "google" : "serpent", getSerpentMapsQuickEnabled: async () => enabled, getSerpentPhotoSource: async () => "maps_quick" },
        "./providers": providers, "./serpent-policy": serpentPolicy,
        "./google-fallback": { runGoogleWithFallback: (_google: unknown, alternatives: any) => alternatives.serpent() },
        "./serpent-places": { searchSerpentPlaces: async (input: any) => { calls.push(input.detailMode); return [{ id: "nearby" }]; } },
        "./serper-places": {}, "./place-images": {},
      }, { SERPENT_API_KEY: "test", GOOGLE_MAPS_API_KEY: "test" });
      const input = { location, radiusKm: 50, query: "restaurant", categoryQuery: null };
      expect(await service.searchExplorePlaces({ ...input, detailMode: "list" })).toMatchObject({ detailsPending: enabled });
      expect(await service.searchExplorePlaces({ ...input, detailMode: "full" })).toMatchObject({ detailsPending: false });
      expect(calls).toEqual(enabled ? ["list", "full"] : ["list", "list"]);
    });
  }
}

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
  const savedQuick: unknown[] = [];
  let writes = 0; let reads = 0; const invalidations: unknown[] = [];
  const route = load("app/api/admin/explore/provider/route.ts", {
    "next/cache": { revalidateTag: (...args: unknown[]) => invalidations.push(args) },
    "next/server": { NextResponse: Response }, zod: { z },
    "@/lib/db/queries": { setAppSetting: async () => { writes++; } },
    "@/lib/explore/provider-config": { EXPLORE_PROVIDER_CACHE_TAG: "explore-provider", readExploreProvider: async () => { reads++; return "openstreetmap"; }, readSerpentMapsQuickEnabled: async () => true, readSerpentPhotoSource: async () => "maps_quick" },
    "@/lib/explore/providers": providers,
    "@/lib/explore/serpent-policy": serpentPolicy,
    "@/lib/explore/google-budget-policy": budgetPolicy,
    "@/lib/explore/google-budget": { readGoogleBudget: async () => budgetPolicy.parseGoogleBudget(undefined), saveGoogleBudgetAndProvider: async (_provider: unknown, _budget: unknown, quick: unknown) => { writes++; savedQuick.push(quick); return budgetPolicy.parseGoogleBudget(undefined); } },
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => admin ? { id: "admin" } : null },
  }, env);
  return { route, writes: () => writes, reads: () => reads, invalidations, savedQuick };
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

test("admin saves Maps Quick disabled and rejects non-booleans", async () => {
  const h = adminHarness(true, { SERPENT_API_KEY: "private-test-key" });
  const post = (quick: unknown) => new Request("https://example.com/api/admin/explore/provider", { method: "POST", body: JSON.stringify({ provider: "serpent", serpentMapsQuickEnabled: quick }) });
  expect((await h.route.POST(post("false"))).status).toBe(400);
  expect(h.writes()).toBe(0);
  const response = await h.route.POST(post(false));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "serpent", serpentMapsQuickEnabled: false });
  expect(h.savedQuick).toEqual([false]);
  expect(h.invalidations).toEqual([["explore-provider", { expire: 0 }]]);
});

test("Google retrieves photos beyond the first six, avoids out-of-radius charges and isolates photo failures", async () => {
  const photoCalls: string[] = [];
  let searches = 0;
  const service = load("lib/explore/places-service.ts", {
    "server-only": {}, "node:crypto": { createHash },
    "@/lib/explore/geo": geo,
    "@/lib/explore/wikimedia-images": {},
    "./provider-config": { getExploreProvider: async () => "google" },
    "./serpent-policy": serpentPolicy,
    "./providers": providers,
    "./google-budget-policy": budgetPolicy,
    "./google-fallback": { runGoogleWithFallback: (google: () => Promise<unknown>) => google() },
    "./serper-places": { searchSerperPlaces: () => { throw new Error("Unexpected paid fallback"); } },
    "./serpent-places": { searchSerpentPlaces: () => { throw new Error("Unexpected paid fallback"); } },
    "./place-images": { addExplorePlaceImages: () => { throw new Error("Unexpected image service"); } },
  }, { GOOGLE_MAPS_API_KEY: "private-test-key" }, {
    fetch: async (endpoint: string | URL) => {
      const url = String(endpoint);
      if (url.includes(":searchNearby")) {
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
  let selectedCategory: any = null;
  const placeInputs: any[] = [];
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
    "@/lib/explore/photo-token": { createPhotoLookupToken: forbiddenOptionalCall },
    "@/lib/explore/places-service": { searchExplorePlaces: async (input: { detailMode: string }) => {
      calls.push(input.detailMode);
      placeInputs.push(input);
      return { results: [{ id: "a", name: "Cafe", distanceKm: 1 }], detailsPending: input.detailMode === "list" };
    } },
    "@/lib/explore/service": { getEnabledExploreSelection: async () => ({ category: selectedCategory, subcategory: null }) },
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
  expect(chats).toBe(0);
  selectedCategory = { id: "1ae3affc-d65e-44c9-a5de-fb9570945740", name: "Eat Nearby", searchQuery: "restaurant", resultType: "standard", searchType: "local" };
  const preset = await route.POST(post({ ...input, categoryId: selectedCategory.id, query: "Eat Nearby", detailMode: "full" }));
  expect(preset.status).toBe(200);
  expect(await preset.json()).toMatchObject({ searchMode: "places_only" });
  expect(placeInputs.at(-1)).toMatchObject({ query: "restaurant", categoryQuery: null });
  authenticated = false;
  expect((await route.POST(post(input))).status).toBe(401);
  expect(calls).toEqual(["list", "full", "full"]);
  expect(chats).toBe(0);
});


test("enriched discovery records usage without creating any sidebar conversation", async () => {
  const tokens: any[] = [], searches: any[] = [];
  const unexpectedChatWrite = () => { throw new Error("Discovery must not save a chat"); };
  const route = load("app/api/explore/search/route.ts", {
    "node:crypto": { createHash }, "next/server": { NextResponse: Response }, zod: { z },
    "@/lib/api/auth": { getAuthenticatedUser: async () => ({ user: { id: "user", role: "admin" } }) },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/ai/model-registry": { getModelRegistry: async () => ({ configs: [{ id: "model", providerModelId: "model" }] }) },
    "@/lib/billing/search-budget": {},
    "@/lib/chat/free-daily-limit": { hasUsableChatCredits: () => false, isFreeDailyChatLimitBypassedForTest: () => true, requiresPaidWebSearchCredits: () => false },
    "@/lib/constants": { DEFAULT_FREE_MESSAGES_PER_DAY: 5 },
    "@/lib/db/queries": {
      getChatById: async () => null, saveChat: unexpectedChatWrite, saveMessages: unexpectedChatWrite,
      getActiveSubscriptionForUser: async () => null, getMessageCountByUserId: async () => 0,
      recordTokenUsage: async (input: any) => tokens.push(input), recordWebSearchUsage: async (input: any) => searches.push(input),
    },
    "@/lib/errors": { ChatSDKError: class extends Error {} },
    "@/lib/explore/config": { isExploreMeghalayaEnabledForRole: async () => true },
    "@/lib/explore/photo-token": {},
    "@/lib/explore/places-service": { searchExplorePlaces: async () => ({ results: [{ name: "Cafe", distanceKm: 1 }] }) },
    "@/lib/explore/service": { getEnabledExploreSelection: async () => ({ category: null, subcategory: null }) },
    "@/lib/explore/types": { shouldEnrichExploreSearch: (mode: string) => mode === "enriched" },
    "@/lib/explore/validation": { exploreSearchInputSchema },
    "@/lib/free-messages": { loadFreeMessageSettings: async () => ({ mode: "global", globalLimit: 5 }) },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "client" },
    "@/lib/settings/user-feature-access": { loadUserFeatureAccessOverride: async () => null },
    "@/lib/utils": { generateUUID: () => "1ae3affc-d65e-44c9-a5de-fb9570945740" },
    "@/lib/web-search/config": { loadWebSearchConfig: async () => ({ provider: "serper", providerCostPerCallUsd: { serper: 0.001 }, providerMarkupMultiplier: { serper: 3 } }), getWebSearchPlatform: () => "web", isWebSearchAllowedForUser: () => true, hasWebSearchProviderPricing: () => true },
    "@/lib/web-search/google-allowance-policy": {},
    "@/lib/web-search/service": { webSearchService: { answerWithSearch: async () => ({ answer: '{"summary":"A cafe nearby"}', provider: "serper", usage: { inputTokens: 10, outputTokens: 10 }, searchCallCount: 1, providerBillingUnitCount: 1, sources: [], searchQueries: [] }) } },
  }, {}, { performance, console });
  const response = await route.POST(new Request("https://example.com/api/explore/search", { method: "POST", body: JSON.stringify({ query: "cafe", location, radiusKm: 50, clientRequestId: "test", detailMode: "full", searchMode: "enriched" }) }));
  expect(response.status).toBe(200);
  expect((await response.json()).answer).toBe("A cafe nearby");
  expect(tokens).toHaveLength(1); expect(tokens[0].chatId).toBeNull();
  expect(tokens[0].additionalCharges[0]).toMatchObject({ category: "web_search", providerKey: "serper", unitCount: 1, markupMultiplier: 3 });
  expect(searches).toHaveLength(1); expect(searches[0].chatId).toBeNull();
});

test("image mode clamps full requests to list for primary and Google fallback", async () => {
  for (const fallback of [false, true]) {
    const calls: string[] = [];
    const service = load("lib/explore/places-service.ts", {
      "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
      "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
      "./provider-config": { getExploreProvider: async () => fallback ? "google" : "serpent", getSerpentMapsQuickEnabled: async () => true, getSerpentPhotoSource: async () => "image_search" },
      "./providers": providers, "./serpent-policy": serpentPolicy,
      "./google-fallback": { runGoogleWithFallback: (_google: unknown, alternatives: any) => alternatives.serpent() },
      "./serpent-places": { searchSerpentPlaces: async (input: any) => { calls.push(input.detailMode); return [{ id: "nearby" }]; } },
      "./serper-places": {}, "./place-images": {},
    }, { SERPENT_API_KEY: "test", GOOGLE_MAPS_API_KEY: "test" });
    const result = await service.searchExplorePlaces({ location, radiusKm: 50, query: "restaurant", categoryQuery: null, detailMode: "full" });
    expect(result).toMatchObject({ detailsPending: false, imageSearch: true }); expect(calls).toEqual(["list"]);
  }
  expect(normalizeAppSettingValueForWrite(serpentPolicy.SERPENT_PHOTO_SOURCE_SETTING_KEY, "image_search")).toBe("image_search");
  expect(() => normalizeAppSettingValueForWrite(serpentPolicy.SERPENT_PHOTO_SOURCE_SETTING_KEY, "other")).toThrow();
  expect(serpentPolicy.parseSerpentPhotoSource(undefined)).toBe("maps_quick");
});

const samplePhotoPlace = { id: "serpent-1", name: "Langbang Cafe", address: "Shangpung, Meghalaya", latitude: 25.48, longitude: 92.36, website: null };
function photoTokens() {
  return load("lib/explore/photo-token.ts", { "server-only": {}, "node:crypto": { createHmac, timingSafeEqual }, zod: { z } }, { AUTH_SECRET: "test-secret" }, { Buffer });
}
test("photo tickets reject tampering, expired tickets and another user's ticket", () => {
  const tokens = photoTokens();
  const token = tokens.createPhotoLookupToken(samplePhotoPlace, "owner", 1000);
  expect(tokens.readPhotoLookupToken(token, "owner", 1001)).toEqual(samplePhotoPlace);
  expect(tokens.readPhotoLookupToken(token, "other", 1001)).toBeNull();
  expect(tokens.readPhotoLookupToken(token, "owner", 1000 + 7200000)).toBeNull();
  expect(tokens.readPhotoLookupToken(`X${token}`, "owner", 1001)).toBeNull();
});

test("image lookups coalesce, cache matches and no matches, and reject unverified images", async () => {
  let calls = 0;
  const cache = new Map();
  const service = load("lib/explore/serpent-images.ts", {
    "server-only": {}, "node:crypto": { createHash }, "./image-matching": imageMatching,
    "./photo-cache": photoCacheMock(),
    "next/cache": { unstable_cache: (fn: any) => (place: any) => { const key = JSON.stringify(place); if (!cache.has(key)) cache.set(key, fn(place).catch((error: unknown) => { cache.delete(key); throw error; })); return cache.get(key); } },
  }, { SERPENT_API_KEY: "private" }, { fetch: async () => { calls++; return Response.json({ success: true, results: { images: [{ title: "Langbang Cafe Shangpung Meghalaya", pageUrl: "https://example.com/langbang-cafe-shangpung", original: "https://images.example.com/photo.jpg", thumbnail: "https://encrypted-tbn0.gstatic.com/photo" }] } }); } });
  const photos = await Promise.all([service.lookupSerpentPlacePhoto(samplePhotoPlace), service.lookupSerpentPlacePhoto(samplePhotoPlace)]);
  expect(calls).toBe(1); expect(photos[0]?.imageUrl).toBe("https://encrypted-tbn0.gstatic.com/photo");
  await service.lookupSerpentPlacePhoto(samplePhotoPlace); expect(calls).toBe(1);
  expect(await service.lookupSerpentPlacePhoto({ ...samplePhotoPlace, name: "Another Business" })).toBeNull();
  await service.lookupSerpentPlacePhoto({ ...samplePhotoPlace, name: "Another Business" }); expect(calls).toBe(2);
});

test("photo API enforces auth, access, signed scope and saved mode before a paid call", async () => {
  const tokens = photoTokens(); let calls = 0; let authenticated = true; let access = true; let source = "image_search";
  const route = load("app/api/explore/photo/route.ts", {
    "next/server": { NextResponse: Response }, zod: { z },
    "@/lib/api/auth": { getAuthenticatedUser: async () => authenticated ? { user: { id: "owner", role: "admin" } } : null },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "private, no-store" }) },
    "@/lib/explore/config": { isExploreMeghalayaEnabledForRole: async () => access },
    "@/lib/explore/photo-token": tokens,
    "@/lib/explore/provider-config": { getSerpentMapsQuickEnabled: async () => true, getSerpentPhotoSource: async () => source },
    "@/lib/explore/serpent-images": { lookupSerpentPlacePhoto: async () => { calls++; return null; } },
    "@/lib/explore/serpent-place-photo": { lookupSerpentListingPhoto: async () => { calls++; return null; } },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
  });
  const post = (token: string) => new Request("https://example.com/api/explore/photo", { method: "POST", body: JSON.stringify({ token }) });
  const token = tokens.createPhotoLookupToken(samplePhotoPlace, "owner");
  authenticated = false; expect((await route.POST(post(token))).status).toBe(401);
  authenticated = true; access = false; expect((await route.POST(post(token))).status).toBe(404);
  access = true; expect((await route.POST(post("tampered"))).status).toBe(400);
  source = "maps_quick"; expect((await route.POST(post(token))).status).toBe(409); expect(calls).toBe(0);
  source = "image_search"; const response = await route.POST(post(token)); expect(response.status).toBe(200); expect(calls).toBe(1);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  source = "maps_place";
  expect((await route.POST(post(token))).status).toBe(409); expect(calls).toBe(1);
  const listingToken = tokens.createPhotoLookupToken({ ...samplePhotoPlace, lookupMode: "listing", mapsUrl: "https://www.google.com/maps?cid=123" }, "owner");
  expect((await route.POST(post(listingToken))).status).toBe(200); expect(calls).toBe(2);
  source = "image_search";
  expect((await route.POST(post(listingToken))).status).toBe(409); expect(calls).toBe(2);
});

test("listing mode preserves Maps List for primary and fallback, and photos disabled prevents lazy lookups", async () => {
  expect(normalizeAppSettingValueForWrite(serpentPolicy.SERPENT_PHOTO_SOURCE_SETTING_KEY, "maps_place")).toBe("maps_place");
  for (const fallback of [false, true]) {
    const calls: string[] = [];
    const service = load("lib/explore/places-service.ts", {
      "server-only": {}, "node:crypto": { createHash }, "@/lib/explore/geo": geo,
      "@/lib/explore/wikimedia-images": {}, "./google-budget-policy": budgetPolicy,
      "./provider-config": { getExploreProvider: async () => fallback ? "google" : "serpent", getSerpentMapsQuickEnabled: async () => true, getSerpentPhotoSource: async () => "maps_place" },
      "./providers": providers, "./serpent-policy": serpentPolicy,
      "./google-fallback": { runGoogleWithFallback: (_google: unknown, alternatives: any) => alternatives.serpent() },
      "./serpent-places": { searchSerpentPlaces: async (input: any) => { calls.push(input.detailMode); return [{ id: "nearby" }]; } },
      "./serper-places": {}, "./place-images": {},
    }, { SERPENT_API_KEY: "test", GOOGLE_MAPS_API_KEY: "test" });
    expect(await service.searchExplorePlaces({ location, radiusKm: 50, query: "restaurant", categoryQuery: null, detailMode: "full" })).toMatchObject({ detailsPending: false, imageSearch: true, photoLookupSource: "maps_place" });
    expect(calls).toEqual(["list"]);
  }
  expect(serpentPolicy.serpentDetailPolicy(false, "full", "maps_place")).toMatchObject({ detailMode: "list", imageSearch: false, photoLookupSource: undefined });
});

function listingHarness() {
  let calls = 0; let fail = false; let incomplete = false; let noPhoto = false;
  const requests: URL[] = []; const cache = new Map();
  const module = load("lib/explore/serpent-place-photo.ts", {
    "server-only": {}, "./serpent-results": { placePhoto },
    "./photo-cache": photoCacheMock(),
    "next/cache": { unstable_cache: (fn: any) => (reference: any) => { const key = JSON.stringify(reference); if (!cache.has(key)) cache.set(key, fn(reference).catch((error: unknown) => { cache.delete(key); throw error; })); return cache.get(key); } },
  }, { SERPENT_API_KEY: "private" }, { URL, AbortSignal, Map, Promise, fetch: async (url: URL, options: RequestInit) => {
    calls++; requests.push(url); expect(options.headers).toEqual({ "X-API-Key": "private" });
    if (fail) return Response.json({}, { status: 503 });
    return Response.json({ success: true, place: { name: "Langbang Cafe", place_id: url.searchParams.get("place_id"), detail_status: incomplete ? "core_only" : "complete", cover_image: noPhoto ? null : "https://lh3.googleusercontent.com/business-photo" } });
  } });
  return { module, requests, calls: () => calls, failure: (value: boolean) => { fail = value; }, incomplete: (value: boolean) => { incomplete = value; }, noPhoto: (value: boolean) => { noPhoto = value; } };
}
const listingPlace = { ...samplePhotoPlace, id: "serpent-ChIJ123456789", lookupMode: "listing" as const };

test("listing photos prefer the larger gallery photo over a small cover preview", () => {
  const h = listingHarness();
  const payload = { success: true, place: { name: "Langbang Cafe", data_id: "0x123:0x456", cover_image: "https://lh3.googleusercontent.com/photo=w86-h114-k-no", images: [{ url: "https://lh3.googleusercontent.com/photo=w408-h544-k-no" }] } };
  expect(h.module.selectSerpentListingPhoto(payload, { parameter: "data_id", value: "0x123:0x456" }).imageUrl).toContain("w408");
});

test("listing photos reuse exact identity across names, distance changes and concurrent users", async () => {
  const h = listingHarness();
  const [first, second] = await Promise.all([h.module.lookupSerpentListingPhoto(listingPlace), h.module.lookupSerpentListingPhoto({ ...listingPlace, name: "Langbang Cafe (updated name)", address: "Updated address" })]);
  expect(first).toEqual(second); expect(first?.imageUrl).toBe("https://lh3.googleusercontent.com/business-photo"); expect(h.calls()).toBe(1);
  await h.module.lookupSerpentListingPhoto(listingPlace); expect(h.calls()).toBe(1);
  expect(h.requests[0].pathname).toBe("/api/maps/place"); expect(h.requests[0].searchParams.toString()).toBe("place_id=ChIJ123456789");
  await h.module.lookupSerpentListingPhoto({ ...listingPlace, id: "serpent-ChIJ987654321" }); expect(h.calls()).toBe(2);
});

test("listing photos cache a complete no-photo result but retry failures and incomplete reads", async () => {
  const h = listingHarness(); h.failure(true);
  await expect(h.module.lookupSerpentListingPhoto(listingPlace)).rejects.toThrow();
  h.failure(false); h.noPhoto(true); h.incomplete(true);
  await expect(h.module.lookupSerpentListingPhoto(listingPlace)).rejects.toThrow("listing_photo_incomplete");
  h.incomplete(false);
  expect(await h.module.lookupSerpentListingPhoto(listingPlace)).toBeNull();
  expect(await h.module.lookupSerpentListingPhoto(listingPlace)).toBeNull(); expect(h.calls()).toBe(3);
});

test("listing lookup rejects unrelated sources, coordinate-only URLs, avatar images and identity mismatch", async () => {
  const h = listingHarness();
  for (const mapsUrl of ["https://attacker.test/maps/place/cafe", "https://www.google.com/maps/search/?api=1&query=25.48,92.36", "https://www.google.com.attacker.test/maps?cid=123", "https://user:pass@www.google.com/maps?cid=123"]) {
    expect(await h.module.lookupSerpentListingPhoto({ ...listingPlace, id: "serpent-unknown", mapsUrl })).toBeNull();
  }
  expect(h.calls()).toBe(0);
  expect(h.module.listingPhotoReference({ ...listingPlace, id: "serpent-0x123:0x456" })).toEqual({ parameter: "data_id", value: "0x123:0x456" });
  expect(h.module.listingPhotoReference({ ...listingPlace, id: "serpent-unknown", mapsUrl: "https://www.google.com/maps?cid=123" })).toEqual({ parameter: "url", value: "https://www.google.com/maps?cid=123" });
  const payload = { success: true, place: { name: "Cafe", place_id: "ChIJ123456789", detail_status: "complete", cover_image: "https://lh3.googleusercontent.com/a/AAAAAAAAAA/photo.jpg", images: [{ url: "https://lh3.googleusercontent.com/real-photo" }] } };
  expect(h.module.selectSerpentListingPhoto(payload, { parameter: "place_id", value: "ChIJ123456789" })?.imageUrl).toBe("https://lh3.googleusercontent.com/real-photo");
  expect(() => h.module.selectSerpentListingPhoto(payload, { parameter: "place_id", value: "ChIJwrong" })).toThrow("listing_identity_mismatch");
});


test("preset resolution excludes display labels and duplicate internal keywords, and preserves custom narrowing", () => {
  const category = { name: "Eat Nearby", searchQuery: "restaurant" };
  for (const query of ["Eat Nearby", "restaurant", " RESTAURANT "]) {
    expect(presets.resolveExplorePreset(query, category, null)).toEqual({ query: "restaurant", categoryQuery: null, isPreset: true });
  }
  const subcategory = { name: "Tea Stops", searchQuery: "cafe" };
  expect(presets.resolveExplorePreset("Tea Stops", category, subcategory)).toEqual({ query: "cafe", categoryQuery: null, isPreset: true });
  expect(presets.resolveExplorePreset("vegetarian", category, null)).toEqual({ query: "vegetarian", categoryQuery: "restaurant", isPreset: false });
  expect(presets.resolveExplorePreset("restaurant", null, null).isPreset).toBe(false);
});
