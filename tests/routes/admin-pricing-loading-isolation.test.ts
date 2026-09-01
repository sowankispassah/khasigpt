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
    expect(modelTableSource).toContain("<div key={createType}>");
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

  test("uses the default chat model for previews without a margin-baseline control", async () => {
    const [
      pageSource,
      modelTableSource,
      modelFormSource,
      planFieldsSource,
      actionSource,
      querySource,
      schemaSource,
      migrationSource,
    ] = await Promise.all([
      readWorkspaceFile("app/(admin)/admin/pricing/page.tsx"),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/model-pricing-management-table.tsx"
      ),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/model-configuration-forms.tsx"
      ),
      readWorkspaceFile(
        "app/(admin)/admin/settings/plan-pricing-fields.tsx"
      ),
      readWorkspaceFile("app/(admin)/actions.ts"),
      readWorkspaceFile("lib/db/queries.ts"),
      readWorkspaceFile("lib/db/schema.ts"),
      readWorkspaceFile(
        "lib/db/migrations/0093_drop-model-margin-baseline.sql"
      ),
    ]);

    expect(pageSource).toContain(
      "modelCosts.find((model) => model.isDefault)"
    );
    expect(planFieldsSource).toContain("Default model");
    expect(modelTableSource).not.toContain("setMarginBaselineModelAction");
    expect(modelTableSource).not.toContain("Use as margin baseline");
    expect(modelFormSource).not.toContain('name="isMarginBaseline"');
    expect(actionSource).not.toContain("setMarginBaselineModel");
    expect(querySource).not.toContain("isMarginBaseline");
    expect(querySource).not.toContain("computeCostMultiplier");
    expect(schemaSource).not.toContain("isMarginBaseline");
    expect(migrationSource).toContain(
      'DROP COLUMN IF EXISTS "isMarginBaseline"'
    );
  });

  test("requires cost-plus pricing and removes image legacy billing", async () => {
    const [
      formSource,
      previewSource,
      actionSource,
      querySource,
      schemaSource,
      migrationSource,
      searchSource,
      previewRouteSource,
    ] = await Promise.all([
      readWorkspaceFile(
        "app/(admin)/admin/pricing/model-configuration-forms.tsx"
      ),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/cost-plus-pricing-fields.tsx"
      ),
      readWorkspaceFile("app/(admin)/actions.ts"),
      readWorkspaceFile("lib/db/queries.ts"),
      readWorkspaceFile("lib/db/schema.ts"),
      readWorkspaceFile(
        "lib/db/migrations/0094_drop_image_legacy_pricing.sql"
      ),
      readWorkspaceFile(
        "app/(admin)/admin/settings/web-search-settings-form.tsx"
      ),
      readWorkspaceFile("app/api/admin/pricing-preview/route.ts"),
    ]);

    expect(formSource).toContain("<TokenCostPlusFields");
    expect(formSource).toContain("<UnitCostPlusFields");
    expect(formSource).not.toContain("Legacy fixed price");
    expect(formSource).not.toContain("Legacy credits per image");
    expect(previewSource).toContain("calculateCostPlusPreview");
    expect(previewSource).toContain("Profit margin");
    expect(previewSource).toContain("Credits deducted");
    expect(actionSource).not.toContain("resolveImageModelPricing");
    expect(querySource).not.toContain("legacyTokensPerImage");
    expect(schemaSource).not.toContain('tokensPerImage: integer("tokensPerImage")');
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS "priceInPaise"');
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS "tokensPerImage"');
    expect(searchSource).toContain("<CostPlusPreviewCard");
    expect(searchSource).toContain('required\n            step={0.000001}');
    expect(previewRouteSource).toContain("requireAdminApiUser");
    expect(previewRouteSource).toContain('"Cache-Control": "no-store"');
  });
});
