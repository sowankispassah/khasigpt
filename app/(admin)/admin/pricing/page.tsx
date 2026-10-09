import { unstable_cache } from "next/cache";
import { type ReactNode, Suspense } from "react";
import {
  createPricingPlanAction,
  hardDeletePricingPlanAction,
  setRecommendedPricingPlanAction,
  updatePlanTranslationAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  ADMIN_SETTINGS_IMAGE_MODELS_CACHE_TAG,
  ADMIN_SETTINGS_LIVE_VOICE_MODELS_CACHE_TAG,
  ADMIN_SETTINGS_MODELS_CACHE_TAG,
  ADMIN_SETTINGS_PRICING_CACHE_TAG,
} from "@/lib/admin/cache-invalidation";
import { resolveAdminDbReadGroup } from "@/lib/admin/db-read-concurrency";
import {
  type AdminQueryResult,
  adminQueryResult,
  getAdminQueryTimeoutMs,
} from "@/lib/admin/safe-query";
import { KHASIGPT_GENERAL_SYSTEM_PROMPT } from "@/lib/ai/identity";
import { IMAGE_MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/image-model-registry";
import { MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/model-registry";
import {
  type CreditPlanForConversion,
  calculatePlanModelEconomics,
  calculateWalletUnitsPerInr,
  normalizeMarkupMultiplier,
  selectBaseCreditPlan,
} from "@/lib/billing/cost-plus";
import {
  IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY,
  PRICING_PLAN_CACHE_TAG,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  TOKENS_PER_CREDIT,
  WEB_SEARCH_ENABLED_SETTING_KEY,
} from "@/lib/constants";
import {
  type AdminModelPricingSnapshotRow,
  getAppSetting,
  getTranslationValuesForKeys,
  listAdminModelPricingSnapshot,
  listAdminPricingPlans,
  listLanguagesWithSettings,
  type listPricingPlans,
} from "@/lib/db/queries";
import { requireAdminPageSession } from "@/lib/security/admin-session";
import { getFallbackUsdToInrRate, getUsdToInrRate } from "@/lib/services/exchange-rate";
import {
  loadFeatureAccessSettingsByKeys,
  resolveFeatureAccessControlState,
} from "@/lib/settings/feature-access-settings";
import { withTimeout } from "@/lib/utils/async";
import { LIVE_VOICE_MODEL_CONFIG_CACHE_TAG } from "@/lib/voice/live";
import { isDurationVoiceModel, readDurationVoicePricing } from "@/lib/voice/pricing";
import { loadWebSearchConfig } from "@/lib/web-search/config";
import { FeatureAccessModeControl } from "../settings/feature-access-mode-control";
import {
  type ModelCostPreview,
  PlanPricingFields,
} from "../settings/plan-pricing-fields";
import { PricingPlanEditForm } from "../settings/pricing-plan-edit-form";
import {
  ChatModelConfigurationForm,
  ImageModelConfigurationForm,
  LiveVoiceModelConfigurationForm,
} from "./model-configuration-forms";
import {
  type DeletedModelRow,
  ModelPricingManagementTable,
  type ModelPricingRow,
  type ModelType,
} from "./model-pricing-management-table";
import { PricingNotice } from "./notice";
import { PricingManagementTable } from "./pricing-management-table";
import {
  ImagePromptTranslationModelForm,
  PricingDisclosure,
  PricingSectionHeading,
} from "./pricing-section";
import { WebSearchPricingForm } from "./web-search-pricing-form";

export const dynamic = "force-dynamic";

const ADMIN_PRICING_LIST_CACHE_REVALIDATE_SECONDS = 300;
const PLAN_TRANSLATION_QUERY_TIMEOUT_MS = 1500;

const listAdminPricingPlansCached = unstable_cache(
  () => listAdminPricingPlans({ includeInactive: true, includeDeleted: true }),
  ["admin-pricing:plans:v1"],
  {
    revalidate: ADMIN_PRICING_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [ADMIN_SETTINGS_PRICING_CACHE_TAG, PRICING_PLAN_CACHE_TAG],
  }
);

const listAdminModelPricingSnapshotCached = unstable_cache(
  () => listAdminModelPricingSnapshot(),
  ["admin-pricing:model-snapshot:v2"],
  {
    revalidate: ADMIN_PRICING_LIST_CACHE_REVALIDATE_SECONDS,
    tags: [
      ADMIN_SETTINGS_MODELS_CACHE_TAG,
      ADMIN_SETTINGS_IMAGE_MODELS_CACHE_TAG,
      ADMIN_SETTINGS_LIVE_VOICE_MODELS_CACHE_TAG,
      MODEL_REGISTRY_CACHE_TAG,
      IMAGE_MODEL_REGISTRY_CACHE_TAG,
      LIVE_VOICE_MODEL_CONFIG_CACHE_TAG,
    ],
  }
);

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  custom: "Custom",
  google: "Google Gemini",
  openai: "OpenAI",
};

type PlanTranslation = { description: string; name: string };

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildModelCostPreviews(models: AdminModelPricingSnapshotRow[]) {
  return models
    .filter(
      (model) =>
        model.type === "chat" && model.isEnabled && !model.deletedAt
    )
    .map<ModelCostPreview>((model) => ({
      id: model.id,
      inputCostPerMillionUsd: Math.max(
        0,
        Number(model.inputProviderCostPerMillion ?? 0)
      ),
      isDefault: model.isDefault,
      markupMultiplier: normalizeMarkupMultiplier(model.markupMultiplier),
      name: model.displayName,
      outputCostPerMillionUsd: Math.max(
        0,
        Number(model.outputProviderCostPerMillion ?? 0)
      ),
      providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
    }));
}

function buildPlanTranslations(
  plans: Awaited<ReturnType<typeof listPricingPlans>>,
  languages: Awaited<ReturnType<typeof listLanguagesWithSettings>>,
  valuesByLanguage: Record<string, Record<string, string>>
) {
  const activeLanguages = languages.filter((language) => language.isActive);
  const result: Record<string, Record<string, PlanTranslation>> = {};

  for (const language of activeLanguages) {
    const languageValues = valuesByLanguage[language.code] ?? {};
    result[language.code] = {};
    for (const plan of plans) {
      result[language.code][plan.id] = {
        description: language.isDefault
          ? plan.description ?? ""
          : languageValues[`recharge.plan.${plan.id}.description`] ?? "",
        name: language.isDefault
          ? plan.name
          : languageValues[`recharge.plan.${plan.id}.name`] ?? "",
      };
    }
  }

  return { activeLanguages, result };
}

function toBasePlanCandidates(plans: PricingPlans): CreditPlanForConversion[] {
  return plans
    .filter((plan) => plan.isActive && !plan.deletedAt)
    .map((plan) => ({
      priceInPaise: plan.priceInPaise,
      tokenAllowance: plan.tokenAllowance,
    }));
}

function CreatePricingPlanForm({
  basePlanCandidates,
  modelCosts,
  usdToInr,
}: {
  basePlanCandidates: CreditPlanForConversion[];
  modelCosts: ModelCostPreview[];
  usdToInr: number;
}) {
  return (
    <form action={createPricingPlanAction} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-name">Plan name</label>
        <input className="h-10 rounded-lg border bg-background px-3 text-sm" id="pricing-plan-create-name" name="name" placeholder="Starter" required />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-description">Description</label>
        <textarea className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm" id="pricing-plan-create-description" name="description" placeholder="Great for individual builders." />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-android-id">Android product id</label>
        <input className="h-10 rounded-lg border bg-background px-3 text-sm" id="pricing-plan-create-android-id" name="androidProductId" placeholder="khasigpt_starter" />
        <p className="text-muted-foreground text-xs">Must exactly match the in-app product id configured in Google Play Console.</p>
      </div>
      <div className="space-y-3 md:col-span-2">
        <PlanPricingFields
          basePlanCandidates={basePlanCandidates}
          includeDraftInBase
          inputIdPrefix="plan-create"
          modelCosts={modelCosts}
          usdToInr={usdToInr}
        />
        <p className="text-muted-foreground text-xs">Display credits are calculated automatically ({TOKENS_PER_CREDIT} tokens per credit).</p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-cycle">Billing cycle (days)</label>
        <input className="h-10 rounded-lg border bg-background px-3 text-sm" id="pricing-plan-create-cycle" min={0} name="billingCycleDays" placeholder="90" required type="number" />
      </div>
      <label className="flex cursor-pointer items-center gap-2 font-medium text-sm">
        <input className="h-4 w-4 cursor-pointer" defaultChecked name="isActive" type="checkbox" />
        Plan is active
      </label>
      <div className="flex justify-end md:col-span-2">
        <ActionSubmitButton pendingLabel="Creating..." type="submit">Create plan</ActionSubmitButton>
      </div>
    </form>
  );
}

function PlanTranslationForms({
  activeLanguages,
  plan,
  translations,
}: {
  activeLanguages: Awaited<ReturnType<typeof listLanguagesWithSettings>>;
  plan: Awaited<ReturnType<typeof listPricingPlans>>[number];
  translations: Record<string, PlanTranslation>;
}) {
  const nonDefaultLanguages = activeLanguages.filter((language) => !language.isDefault);
  return (
    <div className="space-y-4 border-t pt-5">
      <div>
        <h3 className="font-semibold text-sm">Localized content</h3>
        <p className="mt-1 text-muted-foreground text-xs">Optional localized plan details. Blank values fall back to English.</p>
      </div>
      {nonDefaultLanguages.length === 0 ? (
        <p className="rounded-lg bg-muted/40 p-3 text-muted-foreground text-sm">Add another language to provide localized plan details.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {nonDefaultLanguages.map((language) => {
            const formId = `pricing-plan-translation-${plan.id}-${language.code}`;
            const translation = translations[language.code] ?? { description: "", name: "" };
            return (
              <form action={updatePlanTranslationAction} className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3" key={formId}>
                <input name="planId" type="hidden" value={plan.id} />
                <input name="languageCode" type="hidden" value={language.code} />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{language.name}</span>
                  <span className="text-muted-foreground text-xs">{language.code.toUpperCase()}</span>
                </div>
                <label className="flex flex-col gap-2 font-medium text-xs" htmlFor={`${formId}-name`}>Plan name
                  <input className="h-10 rounded-lg border bg-background px-3 text-sm font-normal" defaultValue={translation.name} id={`${formId}-name`} name="name" placeholder="Enter localized name" />
                </label>
                <label className="flex flex-col gap-2 font-medium text-xs" htmlFor={`${formId}-description`}>Description
                  <textarea className="min-h-20 rounded-lg border bg-background px-3 py-2 text-sm font-normal" defaultValue={translation.description} id={`${formId}-description`} name="description" placeholder="Enter localized description" />
                </label>
                <div className="flex justify-end">
                  <ActionSubmitButton pendingLabel="Saving..." size="sm" type="submit" variant="outline">Save {language.name}</ActionSubmitButton>
                </div>
              </form>
            );
          })}
        </div>
      )}
    </div>
  );
}

type PricingPlans = Awaited<ReturnType<typeof listAdminPricingPlans>>;

function serializePlans({
  activePlans,
  referenceModel,
  recommendedPlanId,
  usdToInr,
}: {
  activePlans: PricingPlans;
  referenceModel: ModelCostPreview | null;
  recommendedPlanId: string | null;
  usdToInr: number;
}) {
  const basePlan = selectBaseCreditPlan(toBasePlanCandidates(activePlans));

  return activePlans.map((plan) => {
    const priceInRupees = plan.priceInPaise / 100;
    const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
    const userCreditCostInr = credits > 0 ? priceInRupees / credits : null;
    const economics = referenceModel
      ? calculatePlanModelEconomics({
          basePlan,
          inputCostPerMillionUsd: referenceModel.inputCostPerMillionUsd,
          markupMultiplier: referenceModel.markupMultiplier,
          outputCostPerMillionUsd: referenceModel.outputCostPerMillionUsd,
          plan,
          usdToInr,
        })
      : null;

    return {
      billingCycleDays: plan.billingCycleDays,
      credits,
      customerInputPerMillionInr:
        economics?.customerInputPerMillionInr ?? null,
      customerOutputPerMillionInr:
        economics?.customerOutputPerMillionInr ?? null,
      deletedAt: toIsoString(plan.deletedAt),
      description: plan.description,
      id: plan.id,
      isActive: plan.isActive,
      isRecommended: recommendedPlanId === plan.id,
      marginPercent: economics?.marginPercent ?? null,
      name: plan.name,
      priceInPaise: plan.priceInPaise,
      providerInputCostUsd: referenceModel?.inputCostPerMillionUsd ?? null,
      providerOutputCostUsd: referenceModel?.outputCostPerMillionUsd ?? null,
      realizedMarkup: economics?.realizedMarkup ?? null,
      tokenAllowance: plan.tokenAllowance,
      updatedAt: toIsoString(plan.updatedAt),
      userCreditCostInr,
    };
  });
}

type ModelPricingSnapshot = AdminModelPricingSnapshotRow[];
type ModelPricingSnapshotPromise = Promise<
  AdminQueryResult<ModelPricingSnapshot>
>;

function creditsForCharge(customerChargeInr: number, walletUnitsPerInr: number) {
  if (customerChargeInr <= 0 || walletUnitsPerInr <= 0) {
    return null;
  }
  return (customerChargeInr * walletUnitsPerInr) / TOKENS_PER_CREDIT;
}

function buildModelPricingRows({
  modelSnapshot,
  usdToInr,
  walletUnitsPerInr,
}: {
  modelSnapshot: ModelPricingSnapshot;
  usdToInr: number;
  walletUnitsPerInr: number;
}): ModelPricingRow[] {
  const chatRows = modelSnapshot
    .filter((model) => model.type === "chat" && !model.deletedAt)
    .map<ModelPricingRow>((model) => {
      const markup = normalizeMarkupMultiplier(model.markupMultiplier, 4);
      const providerInputCostUsd = Math.max(
        0,
        Number(model.inputProviderCostPerMillion ?? 0)
      );
      const providerOutputCostUsd = Math.max(
        0,
        Number(model.outputProviderCostPerMillion ?? 0)
      );
      const customerInputChargeInr =
        providerInputCostUsd * usdToInr * markup;
      const customerOutputChargeInr =
        providerOutputCostUsd * usdToInr * markup;
      return {
        creditInputCharge: creditsForCharge(
          customerInputChargeInr,
          walletUnitsPerInr
        ),
        creditOutputCharge: creditsForCharge(
          customerOutputChargeInr,
          walletUnitsPerInr
        ),
        customerInputChargeInr,
        customerOutputChargeInr,
        id: model.id,
        isActive: model.isActive,
        isDefault: model.isDefault,
        isEnabled: model.isEnabled,
        key: `chat:${model.id}`,
        markupMultiplier: markup,
        name: model.displayName,
        providerInputCostUsd,
        providerCostType: "per_token",
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
        providerModelId: model.providerModelId,
        providerOutputCostUsd,
        type: "chat",
        updatedAt: toIsoString(model.updatedAt),
      };
    });

  const imageRows = modelSnapshot
    .filter((model) => model.type === "image" && !model.deletedAt)
    .map<ModelPricingRow>((model) => {
      const markup = normalizeMarkupMultiplier(model.markupMultiplier, 2);
      const providerCostType = model.providerCostType ?? "per_generation";
      const providerInputCostUsd =
        providerCostType === "per_token"
          ? Math.max(0, Number(model.inputProviderCostPerMillion ?? 0))
          : null;
      const providerOutputCostUsd = Math.max(
        0,
        Number(
          providerCostType === "per_token"
            ? model.outputProviderCostPerMillion
            : model.providerCostPerOutputUsd
        )
      );
      const customerInputChargeInr =
        providerInputCostUsd === null
          ? null
          : providerInputCostUsd * usdToInr * markup;
      const customerOutputChargeInr =
        providerOutputCostUsd * usdToInr * markup;
      return {
        cachedImageInputProviderCostUsd:
          providerCostType === "per_token"
            ? Math.max(
                0,
                Number(model.cachedImageInputProviderCostPerMillion ?? 0)
              )
            : null,
        cachedTextInputProviderCostUsd:
          providerCostType === "per_token"
            ? Math.max(
                0,
                Number(model.cachedTextInputProviderCostPerMillion ?? 0)
              )
            : null,
        creditInputCharge:
          customerInputChargeInr === null
            ? null
            : creditsForCharge(customerInputChargeInr, walletUnitsPerInr),
        creditOutputCharge: creditsForCharge(
          customerOutputChargeInr,
          walletUnitsPerInr
        ),
        customerInputChargeInr,
        customerOutputChargeInr,
        id: model.id,
        imageInputProviderCostUsd:
          providerCostType === "per_token"
            ? Math.max(
                0,
                Number(model.imageInputProviderCostPerMillion ?? 0)
              )
            : null,
        isActive: model.isActive,
        isDefault: model.isDefault,
        isEnabled: model.isEnabled,
        key: `image:${model.id}`,
        markupMultiplier: markup,
        name: model.displayName,
        providerInputCostUsd,
        providerCostType,
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
        providerModelId: model.providerModelId,
        providerOutputCostUsd,
        type: "image",
        updatedAt: toIsoString(model.updatedAt),
      };
    });

  const voiceRows = modelSnapshot
    .filter((model) => model.type === "live_voice" && !model.deletedAt)
    .map<ModelPricingRow>((model) => {
      const durationModel = isDurationVoiceModel(model);
      const duration = durationModel ? readDurationVoicePricing(model.config) : null;
      const markup = duration ? duration.customerChargePerMinuteUsd / duration.providerCostPerMinuteUsd : normalizeMarkupMultiplier(model.markupMultiplier, 3);
      const providerInputCostUsd = Math.max(
        0,
        Number(model.inputProviderCostPerMillion ?? 0)
      );
      const providerOutputCostUsd = Math.max(
        0,
        Number(model.outputProviderCostPerMillion ?? 0)
      );
      const customerInputChargeInr =
        providerInputCostUsd * usdToInr * markup;
      const customerOutputChargeInr =
        providerOutputCostUsd * usdToInr * markup;
      return {
        creditInputCharge: duration ? null : creditsForCharge(
          customerInputChargeInr,
          walletUnitsPerInr
        ),
        creditOutputCharge: creditsForCharge(
          duration ? duration.customerChargePerMinuteUsd * usdToInr : customerOutputChargeInr,
          walletUnitsPerInr
        ),
        customerInputChargeInr: duration ? null : customerInputChargeInr,
        customerOutputChargeInr: duration ? duration.customerChargePerMinuteUsd * usdToInr : customerOutputChargeInr,
        id: model.id,
        isActive: model.isActive,
        isDefault: model.isDefault,
        isEnabled: model.isEnabled,
        key: `live_voice:${model.id}`,
        markupMultiplier: markup,
        name: model.displayName,
        providerInputCostUsd: durationModel ? null : providerInputCostUsd,
        providerCostType: durationModel ? "per_minute" : "per_token",
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
        providerModelId: model.providerModelId,
        providerOutputCostUsd: durationModel ? (duration?.providerCostPerMinuteUsd ?? 0) : providerOutputCostUsd,
        type: "live_voice",
        updatedAt: toIsoString(model.updatedAt),
      };
    });

  return [...chatRows, ...imageRows, ...voiceRows].sort(
    (left, right) =>
      Number(right.isEnabled) - Number(left.isEnabled) ||
      left.name.localeCompare(right.name)
  );
}

function buildDeletedForms(deletedPlans: PricingPlans) {
  return Object.fromEntries(
    deletedPlans.map((plan) => [
      plan.id,
      <form action={hardDeletePricingPlanAction} key={plan.id}>
        <input name="id" type="hidden" value={plan.id} />
        <ActionSubmitButton
          pendingLabel="Hard deleting..."
          size="sm"
          type="submit"
          variant="destructive"
        >
          Hard delete
        </ActionSubmitButton>
      </form>,
    ])
  );
}

async function PricingManagementContent({
  activePlans,
  deletedPlans,
  modelPricingSnapshotPromise,
}: {
  activePlans: PricingPlans;
  deletedPlans: PricingPlans;
  modelPricingSnapshotPromise: ModelPricingSnapshotPromise;
}) {
  const queryTimeoutMs = getAdminQueryTimeoutMs(3500);
  const exchangeRateStatePromise = adminQueryResult({
    fallback: { rate: getFallbackUsdToInrRate(), fetchedAt: new Date() },
    label: "pricing.exchange-rate",
    promise: withTimeout(getUsdToInrRate(), 1200),
    timeoutMs: queryTimeoutMs,
  });
  const [recommendedState, languagesState] = await resolveAdminDbReadGroup([
      () =>
        adminQueryResult({
          fallback: null as string | null,
          label: "pricing.recommended-plan",
          promise: getAppSetting<string | null>(
            RECOMMENDED_PRICING_PLAN_SETTING_KEY
          ),
          timeoutMs: queryTimeoutMs,
        }),
      () =>
        adminQueryResult({
          fallback: [] as Awaited<
            ReturnType<typeof listLanguagesWithSettings>
          >,
          label: "pricing.languages",
          promise: listLanguagesWithSettings(),
          timeoutMs: queryTimeoutMs,
        }),
    ]);
  const [exchangeRateState, modelsState] = await Promise.all([
    exchangeRateStatePromise,
    modelPricingSnapshotPromise,
  ]);
  const recommendedPlanId = activePlans.some(
    (plan) => plan.id === recommendedState.data
  )
    ? recommendedState.data
    : null;
  const usdToInr = exchangeRateState.data.rate;
  const modelCosts = buildModelCostPreviews(modelsState.data);
  const referenceModel =
    modelCosts.find((model) => model.isDefault) ??
    modelCosts[0] ??
    null;
  const translationDefinitions = activePlans.flatMap((plan) => [
    { key: `recharge.plan.${plan.id}.name`, defaultText: plan.name },
    {
      key: `recharge.plan.${plan.id}.description`,
      defaultText: plan.description ?? "",
    },
  ]);
  const translationState =
    languagesState.ok && translationDefinitions.length > 0
      ? await adminQueryResult({
          fallback: {} as Record<string, Record<string, string>>,
          label: "pricing.plan-translations",
          promise: withTimeout(
            getTranslationValuesForKeys(
              translationDefinitions.map((definition) => definition.key)
            ),
            PLAN_TRANSLATION_QUERY_TIMEOUT_MS
          ),
          timeoutMs: PLAN_TRANSLATION_QUERY_TIMEOUT_MS,
        })
      : { data: {}, error: null, ok: true as const };
  const { activeLanguages, result: translations } = buildPlanTranslations(
    activePlans,
    languagesState.data,
    translationState.data
  );
  const serializedPlans = serializePlans({
    activePlans,
    referenceModel,
    recommendedPlanId,
    usdToInr,
  });
  const editForms: Record<string, ReactNode> = Object.fromEntries(
    activePlans.map((plan) => [
      plan.id,
      <div className="space-y-6" key={plan.id}>
        <PricingPlanEditForm
          basePlanCandidates={toBasePlanCandidates(
            activePlans.filter((candidate) => candidate.id !== plan.id)
          )}
          modelCosts={modelCosts}
          plan={plan}
          usdToInr={usdToInr}
        />
        <PlanTranslationForms
          activeLanguages={activeLanguages}
          plan={plan}
          translations={Object.fromEntries(
            Object.entries(translations).map(
              ([languageCode, plansForLanguage]) => [
                languageCode,
                plansForLanguage[plan.id] ?? { description: "", name: "" },
              ]
            )
          )}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5">
          <div>
            <span className="font-medium text-sm">
              {recommendedPlanId === plan.id
                ? "Recommended plan"
                : "Not recommended"}
            </span>
            <p className="text-muted-foreground text-xs">The recommended plan is highlighted on the recharge page.</p>
          </div>
          {recommendedPlanId === plan.id ? (
            <form action={setRecommendedPricingPlanAction}>
              <input name="planId" type="hidden" value="" />
              <ActionSubmitButton
                pendingLabel="Updating..."
                type="submit"
                variant="outline"
              >
                Remove recommendation
              </ActionSubmitButton>
            </form>
          ) : (
            <form action={setRecommendedPricingPlanAction}>
              <input name="planId" type="hidden" value={plan.id} />
              <ActionSubmitButton
                disabled={!plan.isActive}
                pendingLabel="Updating..."
                type="submit"
              >
                Set as recommended
              </ActionSubmitButton>
            </form>
          )}
        </div>
      </div>,
    ])
  );

  return (
    <PricingManagementTable
      referenceModelName={referenceModel?.name ?? null}
      createForm={
        <CreatePricingPlanForm
          basePlanCandidates={toBasePlanCandidates(activePlans)}
          modelCosts={modelCosts}
          usdToInr={usdToInr}
        />
      }
      deletedForms={buildDeletedForms(deletedPlans)}
      editForms={editForms}
      modelCostsConfirmed={modelsState.ok}
      plans={serializedPlans}
      plansConfirmed
    />
  );
}

function PricingManagementLoading({
  activePlans,
  deletedPlans,
}: {
  activePlans: PricingPlans;
  deletedPlans: PricingPlans;
}) {
  const usdToInr = getFallbackUsdToInrRate();
  const serializedPlans = serializePlans({
    activePlans,
    referenceModel: null,
    recommendedPlanId: null,
    usdToInr,
  });

  return (
    <PricingManagementTable
      referenceModelName={null}
      createForm={
        <CreatePricingPlanForm
          basePlanCandidates={toBasePlanCandidates(activePlans)}
          modelCosts={[]}
          usdToInr={usdToInr}
        />
      }
      deletedForms={buildDeletedForms(deletedPlans)}
      detailsLoading
      editForms={{}}
      modelCostsConfirmed={false}
      plans={serializedPlans}
      plansConfirmed
    />
  );
}

async function ModelPricingContent({
  activePlans,
  modelPricingSnapshotPromise,
}: {
  activePlans: PricingPlans;
  modelPricingSnapshotPromise: ModelPricingSnapshotPromise;
}) {
  const queryTimeoutMs = getAdminQueryTimeoutMs(3500);
  const exchangeRatePromise = adminQueryResult({
    fallback: { rate: getFallbackUsdToInrRate(), fetchedAt: new Date() },
    label: "pricing.model-pricing.exchange-rate",
    promise: withTimeout(getUsdToInrRate(), 1200),
    timeoutMs: queryTimeoutMs,
  });
  const imageTranslationModelStatePromise = adminQueryResult({
    fallback: null as string | null,
    label: "pricing.image-translation-model",
    promise: getAppSetting<string | null>(
      IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY
    ),
    timeoutMs: queryTimeoutMs,
  });
  const [exchangeRateState, imageTranslationModelState, modelsState] = await Promise.all([
    exchangeRatePromise,
    imageTranslationModelStatePromise,
    modelPricingSnapshotPromise,
  ]);
  const usdToInr = exchangeRateState.data.rate;
  const basePlan = selectBaseCreditPlan(
    activePlans.filter((plan) => plan.isActive && !plan.deletedAt)
  );
  const walletUnitsPerInr = calculateWalletUnitsPerInr(basePlan);
  const pricingPreviewContext = {
    basePlanName: basePlan?.name ?? null,
    usdToInr,
    walletUnitsPerInr,
  };
  const models = buildModelPricingRows({
    modelSnapshot: modelsState.data,
    usdToInr,
    walletUnitsPerInr,
  });
  const activeModelSnapshot = modelsState.data.filter(
    (model) => !model.deletedAt
  );
  const chatModels = activeModelSnapshot.filter(
    (model) => model.type === "chat"
  );
  const imageModels = modelsState.data.filter(
    (model) => model.type === "image" && !model.deletedAt
  );
  const liveVoiceModels = modelsState.data.filter(
    (model) => model.type === "live_voice" && !model.deletedAt
  );
  const deletedModels: DeletedModelRow[] = modelsState.data
    .filter((model) => Boolean(model.deletedAt))
    .map((model) => ({
      deletedAt: toIsoString(model.deletedAt),
      id: model.id,
      key: `${model.type}:${model.id}`,
      name: model.displayName,
      type: model.type,
    }));
  const editForms: Record<string, ReactNode> = {
    ...Object.fromEntries(
      chatModels.map((model) => [
        `chat:${model.id}`,
        <ChatModelConfigurationForm context={pricingPreviewContext} key={model.id} model={model} />,
      ])
    ),
    ...Object.fromEntries(
      imageModels.map((model) => [
        `image:${model.id}`,
        <ImageModelConfigurationForm context={pricingPreviewContext} key={model.id} model={model} />,
      ])
    ),
    ...Object.fromEntries(
      liveVoiceModels.map((model) => [
        `live_voice:${model.id}`,
        <LiveVoiceModelConfigurationForm
          context={pricingPreviewContext}
          key={model.id}
          model={model}
        />,
      ])
    ),
  };
  const createForms: Record<ModelType, ReactNode> = {
    chat: <ChatModelConfigurationForm context={pricingPreviewContext} />,
    image: <ImageModelConfigurationForm context={pricingPreviewContext} />,
    live_voice: (
      <LiveVoiceModelConfigurationForm context={pricingPreviewContext} />
    ),
  };
  const modelsConfirmed = modelsState.ok;

  return (
    <ModelPricingManagementTable
      baseCreditValueInr={
        walletUnitsPerInr > 0
          ? TOKENS_PER_CREDIT / walletUnitsPerInr
          : null
      }
      basePlanName={basePlan?.name ?? null}
      createForms={createForms}
      deletedModels={deletedModels}
      editForms={editForms}
      loadWarning={!modelsConfirmed || !exchangeRateState.ok}
      modelSettings={
        <ImagePromptTranslationModelForm
          models={activeModelSnapshot}
          selectedModelId={imageTranslationModelState.data}
        />
      }
      models={models}
      modelsConfirmed={modelsConfirmed}
    />
  );
}

function ModelPricingLoading({ activePlans }: { activePlans: PricingPlans }) {
  const basePlan = selectBaseCreditPlan(
    activePlans.filter((plan) => plan.isActive && !plan.deletedAt)
  );
  const walletUnitsPerInr = calculateWalletUnitsPerInr(basePlan);
  return (
    <ModelPricingManagementTable
      baseCreditValueInr={
        walletUnitsPerInr > 0
          ? TOKENS_PER_CREDIT / walletUnitsPerInr
          : null
      }
      basePlanName={basePlan?.name ?? null}
      createForms={{
        chat: null,
        image: null,
        live_voice: null,
      }}
      deletedModels={[]}
      editForms={{}}
      loading
      modelSettings={null}
      models={[]}
      modelsConfirmed={false}
    />
  );
}

function WebSearchPricingSection({ children }: { children?: ReactNode }) {
  return (
    <PricingDisclosure
      description={
        <EditableTranslation
          defaultText="Configure grounding, platform availability, limits, and independent pricing for each search provider."
          description="Description for the Web Search settings section in Admin Pricing."
          translationKey="admin.web_search.section_description"
        />
      }
      headingLevel={2}
      title={
        <EditableTranslation
          defaultText="Web Search settings"
          description="Title for the Web Search settings section in Admin Pricing."
          translationKey="admin.web_search.section_title"
        />
      }
    >
      {children}
    </PricingDisclosure>
  );
}

async function WebSearchPricingContent() {
  const queryTimeoutMs = getAdminQueryTimeoutMs(3500);
  const [config, featureAccessSnapshot] = await Promise.all([
    loadWebSearchConfig({ timeoutMs: queryTimeoutMs }),
    loadFeatureAccessSettingsByKeys([WEB_SEARCH_ENABLED_SETTING_KEY], {
      source: "admin.pricing.web-search",
      timeoutMs: queryTimeoutMs,
    }),
  ]);
  const accessState = resolveFeatureAccessControlState({
    settingKey: WEB_SEARCH_ENABLED_SETTING_KEY,
    snapshot: featureAccessSnapshot,
  });

  return (
    <WebSearchPricingSection>
      <div className="rounded-lg bg-muted/40 p-4">
        <FeatureAccessModeControl
          currentMode={accessState.mode}
          description="Control whether time-sensitive public questions may use grounded web search."
          fieldName="webSearchAccessMode"
          readState={accessState.readState}
          successMessage="Web Search availability updated."
          title="Web Search access"
        />
      </div>
      <WebSearchPricingForm
        config={{
          ...config,
          accessMode: accessState.mode ?? config.accessMode,
        }}
        serperConfigured={Boolean(process.env.SERPER_API_KEY?.trim())}
        serpentConfigured={Boolean(process.env.SERPENT_API_KEY?.trim())}
      />
    </WebSearchPricingSection>
  );
}

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string }>;
}) {
  await requireAdminPageSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryTimeoutMs = getAdminQueryTimeoutMs(3500);
  const plansState = await adminQueryResult({
    fallback: [] as PricingPlans,
    label: "pricing.plans",
    promise: listAdminPricingPlansCached(),
    timeoutMs: queryTimeoutMs,
  });
  const activePlans = plansState.data
    .filter((plan) => !plan.deletedAt)
    .sort(
      (left, right) =>
        Number(right.isActive) - Number(left.isActive) ||
        left.name.localeCompare(right.name)
    );
  const deletedPlans = plansState.data.filter((plan) => Boolean(plan.deletedAt));
  const modelPricingSnapshotPromise = adminQueryResult({
    fallback: [] as ModelPricingSnapshot,
    label: "pricing.model-snapshot",
    promise: listAdminModelPricingSnapshotCached(),
    timeoutMs: queryTimeoutMs,
  });

  return (
    <div className="flex flex-col gap-8">
      <PricingNotice notice={resolvedSearchParams?.notice} />
      <AdminPageHeader
        description="Recharge plans, model costs and markups, and web search pricing in one place."
        navHref="/admin/pricing"
        title="Pricing"
      />
      <section className="flex flex-col gap-4">
      <PricingSectionHeading
        description={
          <EditableTranslation
            defaultText="The packs users buy credits with. Margins compare each pack with the default chat model's provider cost."
            description="Description of the recharge plans section on Admin Pricing."
            translationKey="admin.pricing.recharge_plans_description"
          />
        }
        title={
          <EditableTranslation
            defaultText="Recharge plans"
            description="Heading for the recharge plans section on Admin Pricing."
            translationKey="admin.pricing.recharge_plans_title"
          />
        }
      />
      {plansState.ok ? (
        <Suspense
          fallback={
            <PricingManagementLoading
              activePlans={activePlans}
              deletedPlans={deletedPlans}
            />
          }
        >
          <PricingManagementContent
            activePlans={activePlans}
            deletedPlans={deletedPlans}
            modelPricingSnapshotPromise={modelPricingSnapshotPromise}
          />
        </Suspense>
      ) : (
        <PricingManagementTable
          referenceModelName={null}
          createForm={
            <CreatePricingPlanForm
              basePlanCandidates={[]}
              modelCosts={[]}
              usdToInr={getFallbackUsdToInrRate()}
            />
          }
          deletedForms={{}}
          editForms={{}}
          modelCostsConfirmed={false}
          plans={[]}
          plansConfirmed={false}
        />
      )}
      </section>
      <section className="flex flex-col gap-4">
        <PricingSectionHeading
          description={
            <EditableTranslation
              defaultText="Add and manage chat, image, and live voice models, including provider costs and independent customer markups."
              description="Description of the Admin Pricing model-pricing section."
              translationKey="admin.pricing.model_pricing_description"
            />
          }
          title={
            <EditableTranslation
              defaultText="Model pricing"
              description="Heading for the model provider-cost and markup section on Admin Pricing."
              translationKey="admin.pricing.model_pricing_title"
            />
          }
        />
        <PricingDisclosure
          summaryId="general-system-prompt-label"
          title={
            <EditableTranslation
              defaultText="General system prompt (read-only)"
              translationKey="admin.models.general_prompt.title"
            />
          }
        >
          <textarea
            aria-labelledby="general-system-prompt-label"
            className="min-h-64 w-full rounded-lg border bg-muted/40 p-3 font-mono text-xs leading-relaxed"
            id="general-system-prompt"
            readOnly
            value={KHASIGPT_GENERAL_SYSTEM_PROMPT}
          />
        </PricingDisclosure>
        <Suspense fallback={<ModelPricingLoading activePlans={activePlans} />}>
          <ModelPricingContent
            activePlans={activePlans}
            modelPricingSnapshotPromise={modelPricingSnapshotPromise}
          />
        </Suspense>
      </section>
      <section className="flex flex-col gap-4">
        <Suspense fallback={<WebSearchPricingSection />}>
          <WebSearchPricingContent />
        </Suspense>
      </section>
    </div>
  );
}
