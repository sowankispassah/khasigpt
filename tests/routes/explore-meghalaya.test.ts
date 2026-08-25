import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  hasExploreExplicitLocation,
  isExploreNearMeQuery,
  parseExploreAccessModeSetting,
} from "@/lib/explore/shared";

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
    expect(native).toContain("api.exploreSearch");
    expect(native).toContain("requestForegroundPermissionsAsync");
    expect(webSidebar).toContain('translationKey="sidebar.explore_meghalaya"');
    expect(nativeSidebar).toContain('translationKey="sidebar.explore_meghalaya"');
    expect(searchRoute).toContain("recordTokenUsage");
    expect(searchRoute).toContain("recordWebSearchUsage");
    expect(searchRoute).not.toContain("imageGeneration");
    expect(migration).toContain("admin_only");
    expect(migration).toContain("ENABLE ROW LEVEL SECURITY");
  });
});
