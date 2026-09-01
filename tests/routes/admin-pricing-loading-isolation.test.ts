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

  test("uses the recoverable admin database for pricing reads", async () => {
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
    expect(querySource).toContain('"pricing.model-snapshot"');
    expect(querySource).toContain("UNION ALL");
  });

  test("does not present a failed plan read as a confirmed zero", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/pricing/pricing-management-table.tsx"
    );

    expect(source).toContain('"Pricing configurations are unavailable"');
    expect(source).toContain("plansConfirmed");
    expect(source).toContain("detailsLoading");
    expect(source).not.toContain("active pricing ${");
    expect(source).toContain('new Intl.DateTimeFormat("en-IN"');
    expect(source).toContain('timeZone: "Asia/Kolkata"');
    expect(source).not.toContain("date.toLocaleString()");
  });

  test("keeps model pricing on the Pricing page and isolated from recharge plans", async () => {
    const [pricingSource, modelTableSource, settingsSource] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/pricing/page.tsx"),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/model-pricing-management-table.tsx"
      ),
      readWorkspaceFile("app/(admin)/admin/settings/page.tsx"),
    ]);

    expect(pricingSource).toContain("async function ModelPricingContent");
    expect(pricingSource).toContain("<ModelPricingManagementTable");
    expect(pricingSource).toContain(
      "<Suspense fallback={<ModelPricingLoading activePlans={activePlans} />}>"
    );
    expect(pricingSource).toContain("listAdminModelPricingSnapshotCached");
    expect(
      pricingSource.match(/listAdminModelPricingSnapshotCached\(\)/g)
    ).toHaveLength(1);
    expect(pricingSource).toContain(
      "modelPricingSnapshotPromise={modelPricingSnapshotPromise}"
    );
    expect(pricingSource).not.toContain("listAdminChatPricingModelsCached");
    expect(pricingSource).not.toContain("listAdminImagePricingModelsCached");
    expect(pricingSource).not.toContain(
      "listAdminLiveVoicePricingModelsCached"
    );
    expect(modelTableSource).toContain("loadWarning");
    expect(modelTableSource).toContain("modelsConfirmed");
    expect(modelTableSource).toContain('translate("admin.pricing.add_model"');
    expect(modelTableSource).toContain("<DropdownMenuTrigger asChild>");
    expect(modelTableSource).toContain("deleteModelConfigAction");
    expect(modelTableSource).toContain("setActiveImageModelConfigAction");
    expect(modelTableSource).toContain("setDefaultLiveVoiceModelConfigAction");
    expect(pricingSource).toContain("<ChatModelConfigurationForm");
    expect(pricingSource).toContain("<ImageModelConfigurationForm");
    expect(pricingSource).toContain("<LiveVoiceModelConfigurationForm");
    expect(settingsSource).not.toContain("ImageModelPricingFields");
    expect(settingsSource).not.toContain("LiveVoiceProfitabilityFields");
    expect(settingsSource).not.toContain(
      'name="inputProviderCostPerMillion"'
    );
    expect(settingsSource).not.toContain(
      'name="outputProviderCostPerMillion"'
    );
    expect(settingsSource).not.toContain('name="providerCostPerOutputUsd"');
    expect(settingsSource).not.toContain('name="markupMultiplier"');
    expect(settingsSource).not.toContain("listPricingPlans");
    expect(settingsSource).not.toContain("getUsdToInrRate");
    expect(settingsSource).not.toContain('title="Models"');
    expect(settingsSource).not.toContain("createModelConfigAction");
    expect(settingsSource).not.toContain("createImageModelConfigAction");
    expect(settingsSource).not.toContain("createLiveVoiceModelConfigAction");
  });

  test("uses active-first sorting and confirmation menus for pricing plans", async () => {
    const [pageSource, tableSource] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/pricing/page.tsx"),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/pricing-management-table.tsx"
      ),
    ]);

    expect(pageSource).toContain(
      "Number(right.isActive) - Number(left.isActive)"
    );
    expect(pageSource).toContain(
      "Number(right.isEnabled) - Number(left.isEnabled)"
    );
    expect(tableSource).toContain("<MoreVertical");
    expect(tableSource).toContain('setDialogMode("delete")');
    expect(tableSource).toContain("deletePricingPlanAction");
    expect(tableSource).toContain("Delete pricing plan?");
  });
});
