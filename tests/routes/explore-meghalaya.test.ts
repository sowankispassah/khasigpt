import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  parseExploreChatContext,
  resolveExploreChatFollowUp,
} from "@/lib/explore/chat-follow-up";
import { calculateDistanceKm } from "@/lib/explore/geo";
import {
  createExploreSearchKey,
  extractExploreRadiusKm,
  hasExploreExplicitLocation,
  isExploreNearMeQuery,
  parseExploreAccessModeSetting,
} from "@/lib/explore/shared";
import {
  shouldEnrichExploreSearch,
} from "@/lib/explore/types";
import { exploreSearchInputSchema } from "@/lib/explore/validation";

const repoRoot = process.cwd();
const readWorkspaceFile = (relativePath: string) =>
  readFile(path.join(repoRoot, relativePath), "utf8");

const resolvedLocation = {
  id: "osm:node:shangpung",
  label: "Shangpung, Meghalaya",
  latitude: 25.479_847_1,
  longitude: 92.356_722_9,
  accuracy: 200_000,
  source: "gps" as const,
};

const validSearchInput = {
  query: "restaurant",
  categoryId: null,
  subcategoryId: null,
  chatId: null,
  clientRequestId: "request-1",
  locationContextKey: null,
  radiusKm: 10,
  location: resolvedLocation,
};

test.describe("Explore Meghalaya", () => {
  const chatContext = [
    "Current Explore location: Shangpung, Meghalaya (25.4798471, 92.3567229).",
    "Current radius: 10 km.",
    "Current search: restaurant; category: Food.",
    "Selected result: Hôtel rajasthan — Shangpung. Source: https://www.openstreetmap.org/node/1.",
  ].join("\n");

  test("defaults missing feature access to admin-only", () => {
    expect(parseExploreAccessModeSetting(undefined)).toBe("admin_only");
    expect(parseExploreAccessModeSetting("enabled")).toBe("enabled");
    expect(parseExploreAccessModeSetting("disabled")).toBe("disabled");
  });

  test("requests GPS only for location-relative searches", () => {
    expect(isExploreNearMeQuery("Restaurants near me")).toBe(true);
    expect(isExploreNearMeQuery("Best waterfall within 30 km")).toBe(true);
    expect(isExploreNearMeQuery("Festivals across Meghalaya")).toBe(false);
    expect(hasExploreExplicitLocation("Restaurants in Shillong")).toBe(true);
    expect(hasExploreExplicitLocation("Things to do near Jowai")).toBe(true);
  });

  test("allows same-origin browser geolocation prompts", async () => {
    const nextConfig = await readWorkspaceFile("next.config.ts");

    expect(nextConfig).toContain("geolocation=(self)");
    expect(nextConfig).not.toContain("geolocation=()");
  });

  test("accepts coarse browser accuracy when coordinates are valid", () => {
    const result = exploreSearchInputSchema.safeParse(validSearchInput);

    expect(result.success).toBe(true);
  });

  test("accepts user-selected whole-kilometre radii from 1 through 50", () => {
    expect(
      exploreSearchInputSchema.safeParse({
        ...validSearchInput,
        radiusKm: 17,
      }).success,
    ).toBe(true);
    expect(
      exploreSearchInputSchema.safeParse({ ...validSearchInput, radiusKm: 0 })
        .success,
    ).toBe(false);
    expect(
      exploreSearchInputSchema.safeParse({ ...validSearchInput, radiusKm: 51 })
        .success,
    ).toBe(false);
  });

  test("keeps ordinary place refreshes outside credit-bearing enrichment", () => {
    const defaultRequest = exploreSearchInputSchema.parse(validSearchInput);
    const enrichedRequest = exploreSearchInputSchema.parse({
      ...validSearchInput,
      searchMode: "enriched",
    });

    expect(defaultRequest.searchMode).toBe("places_only");
    expect(shouldEnrichExploreSearch(defaultRequest.searchMode)).toBe(false);
    expect(shouldEnrichExploreSearch(enrichedRequest.searchMode)).toBe(true);
  });

  test("requires resolved coordinates and a location identity before search", () => {
    const { location: _location, ...withoutLocation } = validSearchInput;
    expect(exploreSearchInputSchema.safeParse(withoutLocation).success).toBe(
      false,
    );
    expect(
      exploreSearchInputSchema.safeParse({
        ...validSearchInput,
        location: { ...resolvedLocation, id: "" },
      }).success,
    ).toBe(false);
  });

  test("separates search identity by coordinates, radius, query and filters", () => {
    const shangpung = createExploreSearchKey({
      categoryId: null,
      latitude: 25.479_847_1,
      locationId: "shangpung",
      longitude: 92.356_722_9,
      query: "restaurants",
      radiusKm: 10,
      subcategoryId: null,
    });
    const shillong = createExploreSearchKey({
      categoryId: null,
      latitude: 25.5788,
      locationId: "shillong",
      longitude: 91.8933,
      query: "restaurants",
      radiusKm: 10,
      subcategoryId: null,
    });
    const widerShangpung = createExploreSearchKey({
      categoryId: null,
      latitude: 25.479_847_1,
      locationId: "shangpung",
      longitude: 92.356_722_9,
      query: "restaurants",
      radiusKm: 25,
      subcategoryId: null,
    });

    expect(shangpung).not.toBe(shillong);
    expect(shangpung).not.toBe(widerShangpung);
    expect(extractExploreRadiusKm("Cafés within 5 km")).toBe(5);
    expect(extractExploreRadiusKm("Restaurants nearby")).toBeNull();
  });

  test("calculates geographic distance independently of provider text", () => {
    const shangpungToShillong = calculateDistanceKm(
      { latitude: 25.479_847_1, longitude: 92.356_722_9 },
      { latitude: 25.5788, longitude: 91.8933 },
    );

    expect(shangpungToShillong).toBeGreaterThan(40);
    expect(shangpungToShillong).toBeGreaterThan(10);
  });

  test("recovers the exact saved Explore center for contextual chat", () => {
    const parsed = parseExploreChatContext([chatContext]);

    expect(parsed?.location.label).toBe("Shangpung, Meghalaya");
    expect(parsed?.location.latitude).toBe(25.4798471);
    expect(parsed?.location.longitude).toBe(92.3567229);
    expect(parsed?.radiusKm).toBe(10);
  });

  test("turns find-more chat requests into a fresh search at the new radius", () => {
    const followUp = resolveExploreChatFollowUp({
      currentText: "Find more within 5 km",
      recentAssistantTexts: [chatContext],
    });

    expect(followUp?.query).toBe("restaurant");
    expect(followUp?.radiusKm).toBe(5);
    expect(followUp?.location.label).toBe("Shangpung, Meghalaya");
  });

  test("does not start a geo search without saved Explore context", () => {
    expect(
      resolveExploreChatFollowUp({
        currentText: "Find more within 5 km",
        recentAssistantTexts: ["A normal conversation."],
      }),
    ).toBeNull();
  });

  test("wires guarded web and native discovery to shared APIs and chat", async () => {
    const [
      web,
      native,
      webSidebar,
      nativeSidebar,
      searchRoute,
      locationRoute,
      placesService,
      contextRoute,
      migration,
    ] =
      await Promise.all([
        readWorkspaceFile("components/explore/explore-page-client.tsx"),
        readWorkspaceFile("native/src/screens/ExploreScreen.tsx"),
        readWorkspaceFile("components/app-sidebar.tsx"),
        readWorkspaceFile("native/src/components/AppSidebar.tsx"),
        readWorkspaceFile("app/api/explore/search/route.ts"),
        readWorkspaceFile("app/api/explore/location/route.ts"),
        readWorkspaceFile("lib/explore/places-service.ts"),
        readWorkspaceFile("app/api/explore/context/route.ts"),
        readWorkspaceFile("lib/db/migrations/0090_explore_meghalaya.sql"),
      ]);

    expect(web).toContain("First, choose your location");
    expect(web).toContain("sessionStorage");
    expect(web).toContain('fetch("/api/explore/search"');
    expect(web).toContain('fetch("/api/explore/location"');
    expect(web).toContain('fetch("/api/explore/context"');
    expect(web).toContain("clientRequestId");
    expect(web).toContain("setResponse(null)");
    expect(web).toContain('type="range"');
    expect(web).toContain("max={50}");
    expect(web).toContain('mode === "search" ? "enriched" : "places_only"');
    expect(web).toContain("visibleResultCount");
    expect(web).toContain("explore.results.load_more");
    expect(native).toContain("api.exploreSearch");
    expect(native).toContain("api.resolveExploreLocation");
    expect(native).toContain("getForegroundPermissionsAsync");
    expect(native).toContain("requestForegroundPermissionsAsync");
    expect(native).toContain("clientRequestId");
    expect(native).toContain("maximumValue={50}");
    expect(native).toContain('mode === "search" ? "enriched" : "places_only"');
    expect(native).toContain("visibleResultCount");
    expect(native).toContain("explore.results.load_more");
    expect(locationRoute).toContain("resolveManualExploreLocation");
    expect(locationRoute).toContain("reverseGeocodeExploreLocation");
    expect(placesService).toContain("locationRestriction");
    expect(placesService).toContain("getRadiusBoundingBox");
    expect(placesService).toContain("filterExploreResultsWithinRadius");
    expect(placesService).toContain("const MAX_RESULTS = 48");
    expect(searchRoute).toContain("searchExplorePlaces");
    expect(searchRoute).toContain(
      "if (shouldEnrichExploreSearch(parsed.data.searchMode))",
    );
    expect(searchRoute).toContain("locationContextKey");
    expect(searchRoute).not.toContain("recentConversation");
    expect(contextRoute).toContain("Current geographically verified result set");
    expect(searchRoute).toContain("Current Explore context");
    expect(webSidebar).toContain('translationKey="sidebar.explore_meghalaya"');
    expect(nativeSidebar).toContain('translationKey="sidebar.explore_meghalaya"');
    expect(searchRoute).toContain("recordTokenUsage");
    expect(searchRoute).toContain("recordWebSearchUsage");
    expect(searchRoute).not.toContain("imageGeneration");
    expect(migration).toContain("admin_only");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });
});
