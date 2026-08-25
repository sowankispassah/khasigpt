import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  hasExploreExplicitLocation,
  isExploreNearMeQuery,
  parseExploreAccessModeSetting,
} from "@/lib/explore/shared";
import { exploreSearchInputSchema } from "@/lib/explore/validation";

const repoRoot = process.cwd();
const readWorkspaceFile = (relativePath: string) =>
  readFile(path.join(repoRoot, relativePath), "utf8");

test.describe("Explore Meghalaya", () => {
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
    const result = exploreSearchInputSchema.safeParse({
      query: "restaurant",
      categoryId: null,
      subcategoryId: null,
      chatId: null,
      radiusKm: null,
      location: {
        label: "Current location",
        latitude: 25.57,
        longitude: 91.88,
        accuracy: 200_000,
      },
    });

    expect(result.success).toBe(true);
  });

  test("accepts user-selected whole-kilometre radii from 1 through 50", () => {
    expect(
      exploreSearchInputSchema.safeParse({ query: "restaurant", radiusKm: 17 })
        .success,
    ).toBe(true);
    expect(
      exploreSearchInputSchema.safeParse({ query: "restaurant", radiusKm: 0 })
        .success,
    ).toBe(false);
    expect(
      exploreSearchInputSchema.safeParse({ query: "restaurant", radiusKm: 51 })
        .success,
    ).toBe(false);
  });

  test("wires guarded web and native discovery to shared APIs and chat", async () => {
    const [web, native, webSidebar, nativeSidebar, searchRoute, migration] =
      await Promise.all([
        readWorkspaceFile("components/explore/explore-page-client.tsx"),
        readWorkspaceFile("native/src/screens/ExploreScreen.tsx"),
        readWorkspaceFile("components/app-sidebar.tsx"),
        readWorkspaceFile("native/src/components/AppSidebar.tsx"),
        readWorkspaceFile("app/api/explore/search/route.ts"),
        readWorkspaceFile("lib/db/migrations/0090_explore_meghalaya.sql"),
      ]);

    expect(web).toContain('fetch("/api/explore/search"');
    expect(web).toContain('fetch("/api/explore/context"');
    expect(web).toContain('type="range"');
    expect(web).toContain("max={50}");
    expect(native).toContain("api.exploreSearch");
    expect(native).toContain("requestForegroundPermissionsAsync");
    expect(native).toContain("maximumValue={50}");
    expect(webSidebar).toContain('translationKey="sidebar.explore_meghalaya"');
    expect(nativeSidebar).toContain('translationKey="sidebar.explore_meghalaya"');
    expect(searchRoute).toContain("recordTokenUsage");
    expect(searchRoute).toContain("recordWebSearchUsage");
    expect(searchRoute).not.toContain("imageGeneration");
    expect(migration).toContain("admin_only");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });
});
