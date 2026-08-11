import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("admin pricing loading isolation", () => {
  test("loads plans first and streams optional pricing details", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/pricing/page.tsx"
    );

    const plansRead = source.indexOf("const plansState = await adminQueryResult");
    const enhancementRender = source.indexOf("<PricingManagementContent");

    expect(plansRead).toBeGreaterThanOrEqual(0);
    expect(enhancementRender).toBeGreaterThan(plansRead);
    expect(source).toContain("<Suspense");
    expect(source).toContain("<PricingManagementLoading");
    expect(source).toContain("await resolveAdminDbReadGroup([");
    expect(source).not.toContain(
      "const [plansState, recommendedState, modelsState, languagesState"
    );
  });

  test("uses the recoverable admin database for the critical plan list", async () => {
    const [pageSource, querySource] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/pricing/page.tsx"),
      readWorkspaceFile("lib/db/queries.ts"),
    ]);

    expect(pageSource).toContain("listAdminPricingPlansCached");
    expect(pageSource).toContain(
      "listAdminPricingPlans({ includeInactive: true, includeDeleted: true })"
    );
    expect(querySource).toContain(
      'withAdminDatabase("pricing.plans", async (adminDb) => {'
    );
  });

  test("does not present a failed plan read as a confirmed zero", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/pricing/pricing-management-table.tsx"
    );

    expect(source).toContain('"Pricing configurations are unavailable"');
    expect(source).toContain("plansConfirmed");
    expect(source).toContain("detailsLoading");
    expect(source).not.toContain("active pricing ${");
  });
});
