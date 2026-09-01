import { unstable_cache } from "next/cache";
import { type ReactNode, Suspense } from "react";

import {
  createPricingPlanAction,
  deletePricingPlanAction,
  hardDeletePricingPlanAction,
  setRecommendedPricingPlanAction,
  updateChatModelPricingAction,
  updateImageModelPricingAction,
  updateLiveVoiceModelPricingAction,
  updatePlanTranslationAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
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
import { IMAGE_MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/image-model-registry";
import { MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/model-registry";
import {
  calculateWalletUnitsPerInr,
  normalizeMarkupMultiplier,
  selectBaseCreditPlan,
} from "@/lib/billing/cost-plus";
import { PRICING_PLAN_CACHE_TAG, RECOMMENDED_PRICING_PLAN_SETTING_KEY, TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  type AdminModelPricingSnapshotRow,
  getAppSetting,
  getTranslationValuesForKeys,
  listAdminModelPricingSnapshot,
  listAdminPricingPlans,
  listLanguagesWithSettings,
  type listPricingPlans,
} from "@/lib/db/queries";
import { getFallbackUsdToInrRate, getUsdToInrRate } from "@/lib/services/exchange-rate";
import { withTimeout } from "@/lib/utils/async";
import { LIVE_VOICE_MODEL_CONFIG_CACHE_TAG } from "@/lib/voice/live";
import { PlanPricingFields } from "../settings/plan-pricing-fields";
import { PricingPlanEditForm } from "../settings/pricing-plan-edit-form";
import {
  ModelPricingManagementTable,
  type ModelPricingRow,
  ModelPricingSubmitButton,
} from "./model-pricing-management-table";
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

const listAdminModelPricingSnapshotCached = unstable_cache(
  () => listAdminModelPricingSnapshot(),
  ["admin-pricing:model-snapshot:v1"],
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
  models: AdminModelPricingSnapshotRow[],
  usdToInr: number
) {
  return models
    .filter((model) => model.type === "chat" && model.isEnabled)
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
  models: AdminModelPricingSnapshotRow[];
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
    .filter((model) => model.type === "chat")
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
        isEnabled: model.isEnabled,
        key: `chat:${model.id}`,
        markupMultiplier: markup,
        name: model.displayName,
        providerInputCostUsd,
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
        providerModelId: model.providerModelId,
        providerOutputCostUsd,
        type: "chat",
        updatedAt: toIsoString(model.updatedAt),
      };
    });

  const imageRows = modelSnapshot
    .filter((model) => model.type === "image")
    .map<ModelPricingRow>((model) => {
      const markup = normalizeMarkupMultiplier(model.markupMultiplier, 2);
      const providerOutputCostUsd = Math.max(
        0,
        Number(model.providerCostPerOutputUsd ?? 0)
      );
      const customerOutputChargeInr =
        providerOutputCostUsd * usdToInr * markup;
      return {
        creditInputCharge: null,
        creditOutputCharge: creditsForCharge(
          customerOutputChargeInr,
          walletUnitsPerInr
        ),
        customerInputChargeInr: null,
        customerOutputChargeInr,
        id: model.id,
        isEnabled: model.isEnabled,
        key: `image:${model.id}`,
        markupMultiplier: markup,
        name: model.displayName,
        providerInputCostUsd: null,
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
        providerModelId: model.providerModelId,
        providerOutputCostUsd,
        type: "image",
        updatedAt: toIsoString(model.updatedAt),
      };
    });

  const voiceRows = modelSnapshot
    .filter((model) => model.type === "live_voice")
    .map<ModelPricingRow>((model) => {
      const markup = normalizeMarkupMultiplier(model.markupMultiplier, 3);
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
        isEnabled: model.isEnabled,
        key: `live_voice:${model.id}`,
        markupMultiplier: markup,
        name: model.displayName,
        providerInputCostUsd,
        providerLabel: PROVIDER_LABELS[model.provider] ?? model.provider,
        providerModelId: model.providerModelId,
        providerOutputCostUsd,
        type: "live_voice",
        updatedAt: toIsoString(model.updatedAt),
      };
    });

  return [...chatRows, ...imageRows, ...voiceRows].sort((left, right) =>
    left.name.localeCompare(right.name)
  );
}

function PricingNumberField({
  defaultValue,
  description,
  id,
  label,
  name,
  translationKey,
}: {
  defaultValue: number;
  description: string;
  id: string;
  label: string;
  name: string;
  translationKey: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm" htmlFor={id}>
      <span className="font-medium">
        <EditableTranslation
          defaultText={label}
          description={description}
          translationKey={translationKey}
        />
      </span>
      <input
        className="rounded-md border bg-background px-3 py-2 text-sm"
        defaultValue={defaultValue}
        id={id}
        min={0}
        name={name}
        required
        step={0.000001}
        type="number"
      />
    </label>
  );
}

function PricingMarkupField({
  defaultValue,
  id,
}: {
  defaultValue: number;
  id: string;
}) {
  return (
    <label className="flex flex-col gap-2 text-sm" htmlFor={id}>
      <span className="font-medium">
        <EditableTranslation
          defaultText="Customer markup"
          description="Markup field in the Admin Pricing model-cost editor."
          translationKey="admin.pricing.markup"
        />
      </span>
      <input
        className="rounded-md border bg-background px-3 py-2 text-sm"
        defaultValue={defaultValue}
        id={id}
        max={20}
        min={1}
        name="markupMultiplier"
        required
        step={0.01}
        type="number"
      />
    </label>
  );
}

function ChatModelPricingForm({
  model,
}: {
  model: AdminModelPricingSnapshotRow;
}) {
  const prefix = `chat-model-pricing-${model.id}`;
  return (
    <form action={updateChatModelPricingAction} className="grid gap-4 md:grid-cols-2">
      <input name="id" type="hidden" value={model.id} />
      <PricingNumberField
        defaultValue={Number(model.inputProviderCostPerMillion ?? 0)}
        description="Provider input-token cost field for a chat model."
        id={`${prefix}-input`}
        label="Provider input cost (USD / 1M tokens)"
        name="inputProviderCostPerMillion"
        translationKey="admin.pricing.provider_input_cost"
      />
      <PricingNumberField
        defaultValue={Number(model.outputProviderCostPerMillion ?? 0)}
        description="Provider output-token cost field for a chat model."
        id={`${prefix}-output`}
        label="Provider output cost (USD / 1M tokens)"
        name="outputProviderCostPerMillion"
        translationKey="admin.pricing.provider_output_cost"
      />
      <PricingMarkupField
        defaultValue={normalizeMarkupMultiplier(model.markupMultiplier, 4)}
        id={`${prefix}-markup`}
      />
      <div className="flex items-end justify-end">
        <ModelPricingSubmitButton />
      </div>
    </form>
  );
}

function ImageModelPricingForm({
  model,
}: {
  model: AdminModelPricingSnapshotRow;
}) {
  const prefix = `image-model-pricing-${model.id}`;
  return (
    <form action={updateImageModelPricingAction} className="grid gap-4 md:grid-cols-2">
      <input name="id" type="hidden" value={model.id} />
      <PricingNumberField
        defaultValue={Number(model.providerCostPerOutputUsd ?? 0)}
        description="Provider cost per completed image output."
        id={`${prefix}-output`}
        label="Provider cost (USD / completed image)"
        name="providerCostPerOutputUsd"
        translationKey="admin.pricing.provider_image_cost"
      />
      <PricingMarkupField
        defaultValue={normalizeMarkupMultiplier(model.markupMultiplier, 2)}
        id={`${prefix}-markup`}
      />
      <div className="flex justify-end md:col-span-2">
        <ModelPricingSubmitButton />
      </div>
    </form>
  );
}

function LiveVoiceModelPricingForm({
  model,
}: {
  model: AdminModelPricingSnapshotRow;
}) {
  const prefix = `voice-model-pricing-${model.id}`;
  return (
    <form action={updateLiveVoiceModelPricingAction} className="grid gap-4 md:grid-cols-2">
      <input name="id" type="hidden" value={model.id} />
      <PricingNumberField
        defaultValue={Number(model.inputProviderCostPerMillion ?? 0)}
        description="Provider input-token cost field for a live voice model."
        id={`${prefix}-input`}
        label="Provider input cost (USD / 1M tokens)"
        name="inputProviderCostPerMillion"
        translationKey="admin.pricing.provider_input_cost"
      />
      <PricingNumberField
        defaultValue={Number(model.outputProviderCostPerMillion ?? 0)}
        description="Provider output-token cost field for a live voice model."
        id={`${prefix}-output`}
        label="Provider output cost (USD / 1M tokens)"
        name="outputProviderCostPerMillion"
        translationKey="admin.pricing.provider_output_cost"
      />
      <PricingMarkupField
        defaultValue={normalizeMarkupMultiplier(model.markupMultiplier, 3)}
        id={`${prefix}-markup`}
      />
      <div className="flex items-end justify-end">
        <ModelPricingSubmitButton />
      </div>
    </form>
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
  const [exchangeRateState, modelsState] = await Promise.all([
    exchangeRatePromise,
    modelPricingSnapshotPromise,
  ]);
  const usdToInr = exchangeRateState.data.rate;
  const basePlan = selectBaseCreditPlan(
    activePlans.filter((plan) => plan.isActive && !plan.deletedAt)
  );
  const walletUnitsPerInr = calculateWalletUnitsPerInr(basePlan);
  const models = buildModelPricingRows({
    modelSnapshot: modelsState.data,
    usdToInr,
    walletUnitsPerInr,
  });
  const chatModels = modelsState.data.filter((model) => model.type === "chat");
  const imageModels = modelsState.data.filter(
    (model) => model.type === "image"
  );
  const liveVoiceModels = modelsState.data.filter(
    (model) => model.type === "live_voice"
  );
  const editForms: Record<string, ReactNode> = {
    ...Object.fromEntries(
      chatModels.map((model) => [
        `chat:${model.id}`,
        <ChatModelPricingForm key={model.id} model={model} />,
      ])
    ),
    ...Object.fromEntries(
      imageModels.map((model) => [
        `image:${model.id}`,
        <ImageModelPricingForm key={model.id} model={model} />,
      ])
    ),
    ...Object.fromEntries(
      liveVoiceModels.map((model) => [
        `live_voice:${model.id}`,
        <LiveVoiceModelPricingForm key={model.id} model={model} />,
      ])
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
      editForms={editForms}
      loadWarning={!modelsConfirmed || !exchangeRateState.ok}
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
      editForms={{}}
      loading
      models={[]}
      modelsConfirmed={false}
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
  const modelPricingSnapshotPromise = adminQueryResult({
    fallback: [] as ModelPricingSnapshot,
    label: "pricing.model-snapshot",
    promise: listAdminModelPricingSnapshotCached(),
    timeoutMs: queryTimeoutMs,
  });

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
            modelPricingSnapshotPromise={modelPricingSnapshotPromise}
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
      <section className="mt-4 flex flex-col gap-5 border-t pt-8">
        <div>
          <h2 className="font-semibold text-xl">
            <EditableTranslation
              defaultText="Model pricing"
              description="Heading for the model provider-cost and markup section on Admin Pricing."
              translationKey="admin.pricing.model_pricing_title"
            />
          </h2>
          <p className="mt-1 max-w-3xl text-muted-foreground text-sm">
            <EditableTranslation
              defaultText="Configure provider costs and independent customer markups for chat, image, and live voice models."
              description="Description of the Admin Pricing model-pricing section."
              translationKey="admin.pricing.model_pricing_description"
            />
          </p>
        </div>
        <Suspense fallback={<ModelPricingLoading activePlans={activePlans} />}>
          <ModelPricingContent
            activePlans={activePlans}
            modelPricingSnapshotPromise={modelPricingSnapshotPromise}
          />
        </Suspense>
      </section>
    </div>
  );
}
