import { unstable_cache } from "next/cache";
import { type ReactNode, Suspense } from "react";

import {
  createPricingPlanAction,
  deletePricingPlanAction,
  hardDeletePricingPlanAction,
  setRecommendedPricingPlanAction,
  updatePlanTranslationAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import {
  ADMIN_SETTINGS_PRICING_CACHE_TAG,
} from "@/lib/admin/cache-invalidation";
import { resolveAdminDbReadGroup } from "@/lib/admin/db-read-concurrency";
import { adminQueryResult, getAdminQueryTimeoutMs } from "@/lib/admin/safe-query";
import { PRICING_PLAN_CACHE_TAG, RECOMMENDED_PRICING_PLAN_SETTING_KEY, TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  getAppSetting,
  getTranslationValuesForKeys,
  listAdminPricingPlans,
  listLanguagesWithSettings,
  listModelConfigs,
  type listPricingPlans,
} from "@/lib/db/queries";
import { getFallbackUsdToInrRate, getUsdToInrRate } from "@/lib/services/exchange-rate";
import { withTimeout } from "@/lib/utils/async";
import { PlanPricingFields } from "../settings/plan-pricing-fields";
import { PricingPlanEditForm } from "../settings/pricing-plan-edit-form";
import { PricingNotice } from "./notice";
import { PricingManagementTable } from "./pricing-management-table";

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

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  custom: "Custom",
  google: "Google Gemini",
  openai: "OpenAI",
};

type ModelCostPreview = {
  id: string;
  isMarginBaseline: boolean;
  name: string;
  providerCostPerMillionInr: number;
  providerCostPerMillionUsd: number;
  providerLabel: string;
};

type PlanTranslation = { description: string; name: string };

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function buildModelCostPreviews(
  models: Awaited<ReturnType<typeof listModelConfigs>>,
  usdToInr: number
) {
  return models
    .filter((model) => !model.deletedAt && model.isEnabled)
    .map<ModelCostPreview>((model) => {
      const providerCostPerMillionUsd =
        Number(model.inputProviderCostPerMillion ?? 0) +
        Number(model.outputProviderCostPerMillion ?? 0);
      return {
        id: model.id,
        isMarginBaseline: Boolean(model.isMarginBaseline),
        name: model.displayName,
        providerCostPerMillionInr: providerCostPerMillionUsd * usdToInr,
        providerCostPerMillionUsd,
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
      };
    });
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

function CreatePricingPlanForm({ modelCosts, usdToInr }: { modelCosts: ModelCostPreview[]; usdToInr: number }) {
  return (
    <form action={createPricingPlanAction} className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-name">Plan name</label>
        <input className="rounded-md border bg-background px-3 py-2 text-sm" id="pricing-plan-create-name" name="name" placeholder="Starter" required />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-description">Description</label>
        <textarea className="rounded-md border bg-background px-3 py-2 text-sm" id="pricing-plan-create-description" name="description" placeholder="Great for individual builders." />
      </div>
      <div className="flex flex-col gap-2 md:col-span-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-android-id">Android product id</label>
        <input className="rounded-md border bg-background px-3 py-2 text-sm" id="pricing-plan-create-android-id" name="androidProductId" placeholder="khasigpt_starter" />
        <p className="text-muted-foreground text-xs">Must exactly match the in-app product id configured in Google Play Console.</p>
      </div>
      <div className="space-y-3 md:col-span-2">
        <PlanPricingFields inputIdPrefix="plan-create" modelCosts={modelCosts} usdToInr={usdToInr} />
        <p className="text-muted-foreground text-xs">Display credits are calculated automatically ({TOKENS_PER_CREDIT} tokens per credit).</p>
      </div>
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm" htmlFor="pricing-plan-create-cycle">Billing cycle (days)</label>
        <input className="rounded-md border bg-background px-3 py-2 text-sm" id="pricing-plan-create-cycle" min={0} name="billingCycleDays" placeholder="90" required type="number" />
      </div>
      <label className="flex items-center gap-2 font-medium text-sm">
        <input className="h-4 w-4" defaultChecked name="isActive" type="checkbox" />
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
        <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-muted-foreground text-sm">Add another language to provide localized plan details.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {nonDefaultLanguages.map((language) => {
            const formId = `pricing-plan-translation-${plan.id}-${language.code}`;
            const translation = translations[language.code] ?? { description: "", name: "" };
            return (
              <form action={updatePlanTranslationAction} className="flex flex-col gap-3 rounded-lg border bg-background p-3" key={formId}>
                <input name="planId" type="hidden" value={plan.id} />
                <input name="languageCode" type="hidden" value={language.code} />
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm">{language.name}</span>
                  <span className="text-muted-foreground text-xs">{language.code.toUpperCase()}</span>
                </div>
                <label className="flex flex-col gap-2 font-medium text-xs" htmlFor={`${formId}-name`}>Plan name
                  <input className="rounded-md border bg-background px-3 py-2 text-sm font-normal" defaultValue={translation.name} id={`${formId}-name`} name="name" placeholder="Enter localized name" />
                </label>
                <label className="flex flex-col gap-2 font-medium text-xs" htmlFor={`${formId}-description`}>Description
                  <textarea className="rounded-md border bg-background px-3 py-2 text-sm font-normal" defaultValue={translation.description} id={`${formId}-description`} name="description" placeholder="Enter localized description" />
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
  baselineModel,
  models,
  recommendedPlanId,
  usdToInr,
}: {
  activePlans: PricingPlans;
  baselineModel: ModelCostPreview | null;
  models: Awaited<ReturnType<typeof listModelConfigs>>;
  recommendedPlanId: string | null;
  usdToInr: number;
}) {
  const baselineModelRecord = baselineModel
    ? models.find((model) => model.id === baselineModel.id)
    : null;

  return activePlans.map((plan) => {
    const priceInRupees = plan.priceInPaise / 100;
    const credits = Math.floor(plan.tokenAllowance / TOKENS_PER_CREDIT);
    const userCreditCostInr = credits > 0 ? priceInRupees / credits : null;
    const effectivePerMillionInr = plan.tokenAllowance > 0
      ? (priceInRupees / plan.tokenAllowance) * 1_000_000
      : null;
    const effectivePerMillionUsd =
      effectivePerMillionInr !== null && usdToInr > 0
        ? effectivePerMillionInr / usdToInr
        : null;
    const marginPercent =
      effectivePerMillionInr !== null &&
      effectivePerMillionInr > 0 &&
      baselineModel
        ? ((effectivePerMillionInr -
            baselineModel.providerCostPerMillionInr) /
            effectivePerMillionInr) *
          100
        : null;

    return {
      billingCycleDays: plan.billingCycleDays,
      credits,
      deletedAt: toIsoString(plan.deletedAt),
      description: plan.description,
      effectivePerMillionInr,
      effectivePerMillionUsd,
      id: plan.id,
      isActive: plan.isActive,
      isRecommended: recommendedPlanId === plan.id,
      marginPercent,
      name: plan.name,
      priceInPaise: plan.priceInPaise,
      providerInputCostUsd: baselineModelRecord
        ? Number(baselineModelRecord.inputProviderCostPerMillion ?? 0)
        : null,
      providerOutputCostUsd: baselineModelRecord
        ? Number(baselineModelRecord.outputProviderCostPerMillion ?? 0)
        : null,
      tokenAllowance: plan.tokenAllowance,
      updatedAt: toIsoString(plan.updatedAt),
      userCreditCostInr,
    };
  });
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
}: {
  activePlans: PricingPlans;
  deletedPlans: PricingPlans;
}) {
  const queryTimeoutMs = getAdminQueryTimeoutMs(3500);
  const exchangeRateStatePromise = adminQueryResult({
    fallback: { rate: getFallbackUsdToInrRate(), fetchedAt: new Date() },
    label: "pricing.exchange-rate",
    promise: withTimeout(getUsdToInrRate(), 1200),
    timeoutMs: queryTimeoutMs,
  });
  const [recommendedState, modelsState, languagesState] =
    await resolveAdminDbReadGroup([
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
          fallback: [] as Awaited<ReturnType<typeof listModelConfigs>>,
          label: "pricing.provider-costs",
          promise: listModelConfigs({
            includeDisabled: true,
            includeDeleted: false,
            limit: 200,
          }),
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
  const exchangeRateState = await exchangeRateStatePromise;
  const recommendedPlanId = activePlans.some(
    (plan) => plan.id === recommendedState.data
  )
    ? recommendedState.data
    : null;
  const usdToInr = exchangeRateState.data.rate;
  const modelCosts = buildModelCostPreviews(modelsState.data, usdToInr);
  const baselineModel =
    modelCosts.find((model) => model.isMarginBaseline) ??
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
    baselineModel,
    models: modelsState.data,
    recommendedPlanId,
    usdToInr,
  });
  const editForms: Record<string, ReactNode> = Object.fromEntries(
    activePlans.map((plan) => [
      plan.id,
      <div className="space-y-6" key={plan.id}>
        <PricingPlanEditForm
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
          <span className="font-medium text-sm">
            {recommendedPlanId === plan.id
              ? "Recommended plan"
              : "Not recommended"}
          </span>
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
        <form action={deletePricingPlanAction} className="border-t pt-5">
          <input name="id" type="hidden" value={plan.id} />
          <ActionSubmitButton
            className="border border-destructive text-destructive hover:bg-destructive/10"
            pendingLabel="Soft deleting..."
            type="submit"
            variant="outline"
          >
            Soft delete
          </ActionSubmitButton>
        </form>
      </div>,
    ])
  );

  return (
    <PricingManagementTable
      baselineModelName={baselineModel?.name ?? null}
      createForm={
        <CreatePricingPlanForm modelCosts={modelCosts} usdToInr={usdToInr} />
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
    baselineModel: null,
    models: [],
    recommendedPlanId: null,
    usdToInr,
  });

  return (
    <PricingManagementTable
      baselineModelName={null}
      createForm={
        <CreatePricingPlanForm modelCosts={[]} usdToInr={usdToInr} />
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

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const queryTimeoutMs = getAdminQueryTimeoutMs(3500);
  const plansState = await adminQueryResult({
    fallback: [] as PricingPlans,
    label: "pricing.plans",
    promise: listAdminPricingPlansCached(),
    timeoutMs: queryTimeoutMs,
  });
  const activePlans = plansState.data.filter((plan) => !plan.deletedAt);
  const deletedPlans = plansState.data.filter((plan) => Boolean(plan.deletedAt));

  return (
    <div className="flex flex-col gap-6">
      <PricingNotice notice={resolvedSearchParams?.notice} />
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-semibold text-2xl">Pricing</h1>
            <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
              Review recharge tiers, compare effective user pricing with
              provider costs, and update plans without opening separate
              collapsible sections.
            </p>
          </div>
        </div>
      </header>
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
          />
        </Suspense>
      ) : (
        <PricingManagementTable
          baselineModelName={null}
          createForm={
            <CreatePricingPlanForm
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
    </div>
  );
}
