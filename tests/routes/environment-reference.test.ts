import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  inferKnownEnvironmentDecision,
  parseEnvironmentReferenceDecision,
} from "@/lib/ai/environment-reference-core";
import {
  buildVisualSearchQuery,
  rankVisualSearchCandidates,
} from "@/lib/web-search/image-search-core";

const workspaceRoot = process.cwd();

function readWorkspaceFile(relativePath: string) {
  return fs.readFileSync(path.join(workspaceRoot, relativePath), "utf8");
}

test.describe("automatic web visual references", () => {
  test("generic prompts do not trigger the deterministic place resolver", () => {
    expect(inferKnownEnvironmentDecision("Generate a futuristic city.")).toBeNull();
    expect(
      inferKnownEnvironmentDecision("Generate a beautiful futuristic lake.")
    ).toBeNull();
  });

  test("resolves Shillong, Laitumkhrah, and Umiam Lake with geographic context", () => {
    expect(inferKnownEnvironmentDecision("Generate Shillong in 2050.")).toMatchObject({
      shouldSearch: true,
      entity: "Shillong",
      entityType: "PLACE",
      historicalPeriod: null,
    });
    expect(
      inferKnownEnvironmentDecision("Generate Laitumkhrah in 2050.")
    ).toMatchObject({
      entity: "Laitumkhrah",
      geographicContext: "Shillong Meghalaya India",
    });
    expect(
      inferKnownEnvironmentDecision("Generate Umiam Lake during sunset.")
    ).toMatchObject({
      entity: "Umiam Lake",
      entityType: "NATURAL_LOCATION",
    });
  });

  test("person-only prompts never become deterministic web face searches", () => {
    expect(
      inferKnownEnvironmentDecision("Generate Jessie Lyngdoh flying.")
    ).toBeNull();
    expect(
      inferKnownEnvironmentDecision(
        "Generate Jessie Lyngdoh walking through Laitumkhrah in 2050."
      )
    ).toMatchObject({ entity: "Laitumkhrah", entityType: "PLACE" });
  });

  test("ambiguous classifier decisions cannot trigger a search", () => {
    expect(
      parseEnvironmentReferenceDecision({
        shouldSearch: true,
        entity: "Springfield",
        entityType: "PLACE",
        geographicContext: null,
        historicalPeriod: null,
        ambiguous: true,
      })
    ).toMatchObject({
      shouldSearch: false,
      entity: "Springfield",
      ambiguous: true,
    });
  });

  test("search queries contain the real entity rather than future transformations", () => {
    expect(
      buildVisualSearchQuery({
        entity: "Laitumkhrah",
        geographicContext: "Shillong Meghalaya India",
        historicalPeriod: null,
      })
    ).toBe("Laitumkhrah Shillong Meghalaya India");
  });

  test("ranks clear relevant photos and rejects maps, logos, tiny images, and duplicates", () => {
    const ranked = rankVisualSearchCandidates({
      entity: "Laitumkhrah Shillong",
      limit: 3,
      candidates: [
        {
          imageUrl: "https://images.example/laitumkhrah-road.jpg",
          sourceUrl: "https://travel.example/laitumkhrah",
          title: "Laitumkhrah Shillong street photograph",
          width: 1800,
          height: 1200,
          mediaType: "image/jpeg",
          provider: "google_custom_search",
        },
        {
          imageUrl: "https://images.example/laitumkhrah-road.jpg",
          sourceUrl: "https://duplicate.example/photo",
          title: "Laitumkhrah Shillong street photograph",
          width: 1800,
          height: 1200,
          mediaType: "image/jpeg",
          provider: "google_custom_search",
        },
        {
          imageUrl: "https://images.example/map.png",
          sourceUrl: "https://maps.example/laitumkhrah",
          title: "Laitumkhrah route map",
          width: 2000,
          height: 1200,
          mediaType: "image/png",
          provider: "google_custom_search",
        },
        {
          imageUrl: "https://images.example/tiny.jpg",
          sourceUrl: "https://travel.example/tiny",
          title: "Laitumkhrah Shillong",
          width: 120,
          height: 80,
          mediaType: "image/jpeg",
          provider: "google_custom_search",
        },
      ],
    });
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.candidate.imageUrl).toContain("laitumkhrah-road.jpg");
  });

  test("keeps the resolver shared by web and native through the image API", () => {
    const route = readWorkspaceFile("app/(chat)/api/images/route.ts");
    const generation = readWorkspaceFile("lib/ai/image-generation.ts");
    const nativeClient = readWorkspaceFile("native/src/api/client.ts");
    const featureConfig = readWorkspaceFile(
      "lib/ai/environment-reference-config.ts"
    );
    const featureRoute = readWorkspaceFile(
      "app/api/admin/feature-access/route.ts"
    );

    expect(route).toContain("resolveEnvironmentReferences");
    expect(route).toContain("isEnvironmentReferenceEnabledForRole");
    expect(route).toContain('type: "data-imageReferenceContext"');
    expect(route).toContain("skipNewSearch: sourceImages.length > 0");
    expect(generation).toContain("environmentReferences");
    expect(generation).toContain('type: "CHARACTER"');
    expect(nativeClient).toContain('>("/api/images"');
    expect(featureConfig).toContain('parseFeatureAccessMode(value, "admin_only")');
    expect(featureRoute).toContain("imageWebReferencesAccessMode");
    expect(featureRoute).toContain("feature.image_web_references.toggle");
  });
});
