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
    expect(modelTableSource).toContain('translate("admin.pricing.add_chat_model"');
    expect(modelTableSource).toContain('translate("admin.pricing.add_image_model"');
    expect(modelTableSource).toContain('translate("admin.pricing.add_voice_model"');
    expect(modelTableSource).toContain('const modelTypes: ModelType[] = ["chat", "image", "live_voice"]');
    expect(modelTableSource).toContain("modelTypes.map((type) =>");
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

  test("shows ten pricing and model rows by default with isolated load-more controls", async () => {
    const [planTableSource, modelTableSource] = await Promise.all([
      readWorkspaceFile(
        "app/(admin)/admin/pricing/pricing-management-table.tsx"
      ),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/model-pricing-management-table.tsx"
      ),
    ]);

    for (const source of [planTableSource, modelTableSource]) {
      expect(source).toContain("const DEFAULT_VISIBLE_ROWS = 10");
      expect(source).toContain('translate("admin.pricing.load_more", "Load more")');
      expect(source).toContain(
        'translate("admin.pricing.showing_rows", "Showing {visible} of {total}")'
      );
    }
    expect(planTableSource).toContain("plans.slice(0, visiblePlanCount)");
    expect(modelTableSource).toContain("typeModels.slice(0, visibleModelCounts[type])");
  });

  test("keeps every pricing table collapsed until its own header is opened", async () => {
    const [planTableSource, modelTableSource] = await Promise.all([
      readWorkspaceFile(
        "app/(admin)/admin/pricing/pricing-management-table.tsx"
      ),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/model-pricing-management-table.tsx"
      ),
    ]);

    for (const source of [planTableSource, modelTableSource]) {
      expect(source).toContain("<Collapsible");
      expect(source).toContain("<CollapsibleTrigger asChild>");
      expect(source).toContain("<CollapsibleContent>");
      expect(source).toContain("defaultOpen={false}");
      expect(source).toContain("group-data-[state=open]:rotate-180");
    }
    expect(planTableSource).toContain(
      'translate(\n                "admin.pricing.toggle_pricing_plans"'
    );
    expect(modelTableSource).toContain(
      '"admin.pricing.toggle_model_section"'
    );
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

  test("requires cost-plus pricing and removes all legacy model billing", async () => {
    const [
      formSource,
      previewSource,
      actionSource,
      querySource,
      schemaSource,
      migrationSource,
      voiceMigrationSource,
      voiceSource,
      webSearchConfigSource,
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
        "lib/db/migrations/0095_drop_live_voice_legacy_multiplier.sql"
      ),
      readWorkspaceFile("lib/voice/live-models.ts"),
      readWorkspaceFile("lib/web-search/config.ts"),
      readWorkspaceFile(
        "app/(admin)/admin/pricing/web-search-pricing-form.tsx"
      ),
      readWorkspaceFile("app/api/admin/pricing-preview/route.ts"),
    ]);

    expect(formSource).toContain("<TokenCostPlusFields");
    expect(formSource).toContain("<UnitCostPlusFields");
    expect(formSource).not.toContain("Legacy fixed price");
    expect(formSource).not.toContain("Legacy credits per image");
    expect(formSource).not.toContain("Legacy credit multiplier");
    expect(previewSource).toContain("calculateCostPlusPreview");
    expect(previewSource).toContain("Profit margin");
    expect(previewSource).toContain("Credits deducted");
    expect(actionSource).not.toContain("resolveImageModelPricing");
    expect(querySource).not.toContain("legacyTokensPerImage");
    expect(querySource).not.toContain("legacyTokensToDeduct");
    expect(querySource).not.toContain("function calculateTokenDeduction");
    expect(schemaSource).not.toContain('tokensPerImage: integer("tokensPerImage")');
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS "priceInPaise"');
    expect(migrationSource).toContain('DROP COLUMN IF EXISTS "tokensPerImage"');
    expect(voiceMigrationSource).toContain(
      'DROP COLUMN IF EXISTS "creditMultiplier"'
    );
    expect(voiceSource).not.toContain("defaultLiveVoiceModelConfig");
    expect(webSearchConfigSource).not.toContain("0.014");
    expect(webSearchConfigSource).not.toContain("0.01,");
    expect(searchSource).toContain("<CostPlusPreviewCard");
    expect(searchSource).toContain('required\n            step={0.000001}');
    expect(previewRouteSource).toContain("requireAdminApiUser");
    expect(previewRouteSource).toContain('"Cache-Control": "no-store"');
  });

  test("owns the complete Web Search configuration on Pricing", async () => {
    const [pricingSource, searchFormSource, searchRouteSource, settingsSource] =
      await Promise.all([
        readWorkspaceFile("app/(admin)/admin/pricing/page.tsx"),
        readWorkspaceFile(
          "app/(admin)/admin/pricing/web-search-pricing-form.tsx"
        ),
        readWorkspaceFile("app/api/admin/pricing/web-search/route.ts"),
        readWorkspaceFile("app/(admin)/admin/settings/page.tsx"),
      ]);

    expect(pricingSource).toContain("async function WebSearchPricingContent");
    expect(pricingSource).toContain("<WebSearchPricingForm");
    expect(pricingSource).toContain("<FeatureAccessModeControl");
    expect(pricingSource).toContain("loadWebSearchConfig");
    expect(pricingSource).toContain("loadFeatureAccessSettingsByKeys");
    expect(pricingSource).toContain(
      "<Suspense fallback={<WebSearchPricingSection />}>"
    );
    expect(searchFormSource).toContain('fetch("/api/admin/pricing/web-search"');
    expect(searchFormSource).toContain("Primary provider");
    expect(searchFormSource).toContain("Enable on web");
    expect(searchFormSource).toContain("Max search calls");
    expect(searchFormSource).toContain("Customer markup");
    expect(searchFormSource).toContain("Grounded search provider cost");
    expect(searchRouteSource).toContain('source: "pricing.web_search.update"');
    expect(settingsSource).not.toContain("<WebSearchSettingsForm");
    expect(settingsSource).not.toContain('title="Web Search"');
    expect(settingsSource).not.toContain(
      'translationKey="admin.web_search.section_title"'
    );
  });
});
