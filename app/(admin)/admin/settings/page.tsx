import { formatDistanceToNow } from "date-fns";
import { unstable_cache } from "next/cache";
import type { ComponentProps, ReactNode } from "react";
import {
  createImageModelConfigAction,
  createLanguageAction,
  createModelConfigAction,
  createPricingPlanAction,
  deleteLanguageAction,
  deleteImageModelConfigAction,
  deleteModelConfigAction,
  deletePricingPlanAction,
  hardDeleteImageModelConfigAction,
  hardDeleteModelConfigAction,
  hardDeletePricingPlanAction,
  setActiveImageModelConfigAction,
  setDefaultModelConfigAction,
  setImagePromptTranslationModelAction,
  setMarginBaselineModelAction,
  setRecommendedPricingPlanAction,
  updateAboutContentAction,
  updateDocumentUploadsAvailabilityAction,
  updateForumAvailabilityAction,
  updateFreeMessageSettingsAction,
  updateIconPromptAvailabilityAction,
  updateIconPromptsAction,
  updateImageFilenamePrefixAction,
  updateImageGenerationAvailabilityAction,
  updateImageModelConfigAction,
  updateLanguageSettingsAction,
  updateLanguageStatusAction,
  updateModelConfigAction,
  updatePlanTranslationAction,
  updatePricingPlanAction,
  updatePrivacyPolicyByLanguageAction,
  updateSuggestedPromptsAction,
  updateSuggestedPromptsAvailabilityAction,
  updateTermsOfServiceByLanguageAction,
} from "@/app/(admin)/actions";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { parseImageGenerationEnabledSetting } from "@/lib/ai/image-generation";
import { IMAGE_MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/image-model-registry";
import { MODEL_REGISTRY_CACHE_TAG } from "@/lib/ai/model-registry";
import {
  DEFAULT_ABOUT_US,
  DEFAULT_FREE_MESSAGES_PER_DAY,
  DEFAULT_PRIVACY_POLICY,
  DEFAULT_SUGGESTED_PROMPTS,
  DEFAULT_TERMS_OF_SERVICE,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  ICON_PROMPTS_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY,
  IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY,
  PRICING_PLAN_CACHE_TAG,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TOKENS_PER_CREDIT,
} from "@/lib/constants";
import {
  APP_SETTING_CACHE_TAG,
  getAppSetting,
  getTranslationValuesForKeys,
  listImageModelConfigs,
  listLanguagesWithSettings,
  listModelConfigs,
  listPricingPlans,
} from "@/lib/db/queries";
import { parseForumEnabledSetting } from "@/lib/forum/config";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import { normalizeIconPromptSettings } from "@/lib/icon-prompts";
import { getUsdToInrRate } from "@/lib/services/exchange-rate";
import { parseDocumentUploadsEnabledSetting } from "@/lib/uploads/document-uploads";
import { cn } from "@/lib/utils";
import { IconPromptSettingsForm } from "./icon-prompt-settings-form";
import { ImageModelPricingFields } from "./image-model-pricing-fields";
import { LanguageContentForm } from "./language-content-form";
import { LanguagePromptsForm } from "./language-prompts-form";
import { AdminSettingsNotice } from "./notice";
import { PlanPricingFields } from "./plan-pricing-fields";

export const dynamic = "force-dynamic";

const PROVIDER_OPTIONS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google Gemini" },
  { value: "custom", label: "Custom (configure in code)" },
];

const ADMIN_SETTINGS_CACHE_KEY = "admin-settings-data-v1";
const ADMIN_SETTINGS_CACHE_TAGS = [
  APP_SETTING_CACHE_TAG,
  MODEL_REGISTRY_CACHE_TAG,
  IMAGE_MODEL_REGISTRY_CACHE_TAG,
  PRICING_PLAN_CACHE_TAG,
  "languages",
];
const SETTINGS_PENDING_TIMEOUT_MS = 12000;

function SettingsSubmitButton(
  props: ComponentProps<typeof ActionSubmitButton>
) {
  return (
    <ActionSubmitButton
      pendingTimeoutMs={SETTINGS_PENDING_TIMEOUT_MS}
      {...props}
    />
  );
}

const loadAdminSettingsData = unstable_cache(
  async () => {
    const [
      exchangeRate,
      modelsRaw,
      imageModelConfigs,
      plansRaw,
      privacyPolicySetting,
      termsOfServiceSetting,
      aboutUsSetting,
      aboutUsContentByLanguageSetting,
      privacyPolicyByLanguageSetting,
      termsOfServiceByLanguageSetting,
      suggestedPromptsSetting,
      suggestedPromptsByLanguageSetting,
      suggestedPromptsEnabledSetting,
      recommendedPlanSetting,
      languages,
      freeMessageSettings,
      forumEnabledSetting,
      imageGenerationEnabledSetting,
      imagePromptTranslationModelSetting,
      imageFilenamePrefixSetting,
      iconPromptsSetting,
      iconPromptsEnabledSetting,
      documentUploadsEnabledSetting,
    ] = await Promise.all([
      getUsdToInrRate(),
      listModelConfigs({
        includeDisabled: true,
        includeDeleted: true,
        limit: 200,
      }),
      listImageModelConfigs({
        includeDisabled: true,
        includeDeleted: true,
        limit: 200,
      }),
      listPricingPlans({ includeInactive: true, includeDeleted: true }),
      getAppSetting<string>("privacyPolicy"),
      getAppSetting<string>("termsOfService"),
      getAppSetting<string>("aboutUsContent"),
      getAppSetting<Record<string, string>>("aboutUsContentByLanguage"),
      getAppSetting<Record<string, string>>("privacyPolicyByLanguage"),
      getAppSetting<Record<string, string>>("termsOfServiceByLanguage"),
      getAppSetting<string[]>("suggestedPrompts"),
      getAppSetting<Record<string, string[]>>("suggestedPromptsByLanguage"),
      getAppSetting<string | boolean>(SUGGESTED_PROMPTS_ENABLED_SETTING_KEY),
      getAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY),
      listLanguagesWithSettings(),
      loadFreeMessageSettings(),
      getAppSetting<string | boolean>(FORUM_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(IMAGE_GENERATION_FEATURE_FLAG_KEY),
      getAppSetting<string | null>(IMAGE_PROMPT_TRANSLATION_MODEL_SETTING_KEY),
      getAppSetting<string>(IMAGE_GENERATION_FILENAME_PREFIX_SETTING_KEY),
      getAppSetting<unknown>(ICON_PROMPTS_SETTING_KEY),
      getAppSetting<string | boolean>(ICON_PROMPTS_ENABLED_SETTING_KEY),
      getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
    ]);

    return {
      exchangeRate,
      modelsRaw,
      imageModelConfigs,
      plansRaw,
      privacyPolicySetting,
      termsOfServiceSetting,
      aboutUsSetting,
      aboutUsContentByLanguageSetting,
      privacyPolicyByLanguageSetting,
      termsOfServiceByLanguageSetting,
      suggestedPromptsSetting,
      suggestedPromptsByLanguageSetting,
      suggestedPromptsEnabledSetting,
      recommendedPlanSetting,
      languages,
      freeMessageSettings,
      forumEnabledSetting,
      imageGenerationEnabledSetting,
      imagePromptTranslationModelSetting,
      imageFilenamePrefixSetting,
      iconPromptsSetting,
      iconPromptsEnabledSetting,
      documentUploadsEnabledSetting,
    };
  },
  [ADMIN_SETTINGS_CACHE_KEY],
  {
    tags: ADMIN_SETTINGS_CACHE_TAGS,
    revalidate: 300,
  }
);

function _formatCurrency(value: number, currency: "USD" | "INR") {
  return value.toLocaleString(currency === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function ProviderBadge({ value }: { value: string }) {
  const option = PROVIDER_OPTIONS.find((item) => item.value === value);
  return (
    <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-xs capitalize">
      {option?.label ?? value}
    </span>
  );
}

function EnabledBadge({ enabled }: { enabled: boolean }) {
  if (enabled) {
    return (
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 text-xs">
        Enabled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-rose-100 px-2 py-0.5 font-medium text-rose-700 text-xs">
      Disabled
    </span>
  );
}

function ActiveBadge({ active }: { active: boolean }) {
  if (!active) {
    return null;
  }
  return (
    <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs">
      Active
    </span>
  );
}

type AdminSettingsSearchParams = { notice?: string };

function CollapsibleSection({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      className="group overflow-hidden rounded-lg border bg-card shadow-sm"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-3 px-6 py-4">
        <div className="space-y-1">
          <h2 className="font-semibold text-lg">{title}</h2>
          {description ? (
            <p className="text-muted-foreground text-sm">{description}</p>
          ) : null}
        </div>
        <span className="font-semibold text-muted-foreground text-xs transition-transform duration-150 group-open:rotate-180">
          ▼
        </span>
      </summary>
      <div className="border-t px-6 py-5">
        <div className="space-y-4">{children}</div>
      </div>
    </details>
  );
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<AdminSettingsSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = resolvedSearchParams?.notice;

  const {
    exchangeRate,
    modelsRaw,
    imageModelConfigs,
    plansRaw,
    privacyPolicySetting,
    termsOfServiceSetting,
    aboutUsSetting,
    aboutUsContentByLanguageSetting,
    privacyPolicyByLanguageSetting,
    termsOfServiceByLanguageSetting,
    suggestedPromptsSetting,
    suggestedPromptsByLanguageSetting,
    suggestedPromptsEnabledSetting,
    recommendedPlanSetting,
    languages,
    freeMessageSettings,
    forumEnabledSetting,
    imageGenerationEnabledSetting,
    imagePromptTranslationModelSetting,
    imageFilenamePrefixSetting,
    iconPromptsSetting,
    iconPromptsEnabledSetting,
    documentUploadsEnabledSetting,
  } = await loadAdminSettingsData();

  const usdToInr = exchangeRate.rate;
  const activeModels = modelsRaw.filter((model) => !model.deletedAt);
  const deletedModels = modelsRaw.filter((model) => model.deletedAt);
  const activeImageModels = imageModelConfigs.filter((model) => !model.deletedAt);
  const deletedImageModels = imageModelConfigs.filter((model) => model.deletedAt);
  const enabledModels = activeModels.filter((model) => model.isEnabled);
  const imageFilenamePrefix =
    typeof imageFilenamePrefixSetting === "string"
      ? imageFilenamePrefixSetting
      : "";
  const imagePromptTranslationModelId =
    typeof imagePromptTranslationModelSetting === "string" &&
    imagePromptTranslationModelSetting.trim().length > 0
      ? imagePromptTranslationModelSetting
      : null;
  const imagePromptTranslationModel = imagePromptTranslationModelId
    ? activeModels.find((model) => model.id === imagePromptTranslationModelId) ??
      null
    : null;
  const iconPromptSettings = normalizeIconPromptSettings(
    iconPromptsSetting,
    iconPromptsEnabledSetting
  );
  const suggestedPromptsEnabled =
    typeof suggestedPromptsEnabledSetting === "boolean"
      ? suggestedPromptsEnabledSetting
      : typeof suggestedPromptsEnabledSetting === "string"
        ? suggestedPromptsEnabledSetting.toLowerCase() === "true"
        : true;

  const activePlans = plansRaw.filter((plan) => !plan.deletedAt);
  const deletedPlans = plansRaw.filter((plan) => plan.deletedAt);

  const recommendedPlanId =
    recommendedPlanSetting &&
    activePlans.some((plan) => plan.id === recommendedPlanSetting)
      ? recommendedPlanSetting
      : null;
  const recommendedPlan = recommendedPlanId
    ? activePlans.find((plan) => plan.id === recommendedPlanId) ?? null
    : null;
  const recommendedPlanName = recommendedPlan?.name ?? null;
  const recommendedPlanPriceInPaise = recommendedPlan?.priceInPaise ?? 0;
  const recommendedPlanTokenAllowance = recommendedPlan?.tokenAllowance ?? 0;

  const privacyPolicyContent =
    privacyPolicySetting && privacyPolicySetting.trim().length > 0
      ? privacyPolicySetting
      : DEFAULT_PRIVACY_POLICY;
  const termsOfServiceContent =
    termsOfServiceSetting && termsOfServiceSetting.trim().length > 0
      ? termsOfServiceSetting
      : DEFAULT_TERMS_OF_SERVICE;
  const aboutContent =
    aboutUsSetting && aboutUsSetting.trim().length > 0
      ? aboutUsSetting
      : DEFAULT_ABOUT_US;
  const normalizedAboutContentByLanguage: Record<string, string> = {};
  if (
    aboutUsContentByLanguageSetting &&
    typeof aboutUsContentByLanguageSetting === "object" &&
    !Array.isArray(aboutUsContentByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      aboutUsContentByLanguageSetting
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedAboutContentByLanguage[code] = value.trim();
      }
    }
  }
  const normalizedPrivacyPolicyByLanguage: Record<string, string> = {};
  if (
    privacyPolicyByLanguageSetting &&
    typeof privacyPolicyByLanguageSetting === "object" &&
    !Array.isArray(privacyPolicyByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      privacyPolicyByLanguageSetting
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedPrivacyPolicyByLanguage[code] = value.trim();
      }
    }
  }
  const normalizedTermsOfServiceByLanguage: Record<string, string> = {};
  if (
    termsOfServiceByLanguageSetting &&
    typeof termsOfServiceByLanguageSetting === "object" &&
    !Array.isArray(termsOfServiceByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      termsOfServiceByLanguageSetting
    )) {
      if (typeof value === "string" && value.trim().length > 0) {
        normalizedTermsOfServiceByLanguage[code] = value.trim();
      }
    }
  }
  const activeLanguagesList = languages.filter((language) => language.isActive);

  const providerLabelLookup = new Map(
    PROVIDER_OPTIONS.map((option) => [option.value, option.label])
  );
  const providerCostSummaries = activeModels
    .filter((model) => model.isEnabled)
    .map((model) => {
      const providerCostPerMillionUsd =
        Number(model.inputProviderCostPerMillion ?? 0) +
        Number(model.outputProviderCostPerMillion ?? 0);

      return {
        id: model.id,
        name: model.displayName,
        providerLabel:
          providerLabelLookup.get(model.provider) ?? model.provider,
        isMarginBaseline: Boolean(model.isMarginBaseline),
        providerCostPerMillionUsd,
        providerCostPerMillionInr: providerCostPerMillionUsd * usdToInr,
      };
    });

  const suggestedPromptsList = Array.isArray(suggestedPromptsSetting)
    ? suggestedPromptsSetting.filter(
        (item) => typeof item === "string" && item.trim().length > 0
      )
    : [];
  const suggestedPrompts =
    suggestedPromptsList.length > 0
      ? suggestedPromptsList
      : DEFAULT_SUGGESTED_PROMPTS;
  const normalizedSuggestedPromptsByLanguage: Record<string, string[]> = {};
  if (
    suggestedPromptsByLanguageSetting &&
    typeof suggestedPromptsByLanguageSetting === "object" &&
    !Array.isArray(suggestedPromptsByLanguageSetting)
  ) {
    for (const [code, value] of Object.entries(
      suggestedPromptsByLanguageSetting as Record<string, unknown>
    )) {
      if (!Array.isArray(value)) {
        continue;
      }

      const normalized = value
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter((item) => item.length > 0);

      if (normalized.length > 0) {
        normalizedSuggestedPromptsByLanguage[code] = normalized;
      }
    }
  }
  const forumEnabled = parseForumEnabledSetting(forumEnabledSetting);
  const imageGenerationEnabled = parseImageGenerationEnabledSetting(
    imageGenerationEnabledSetting
  );
  const documentUploadsEnabled = parseDocumentUploadsEnabledSetting(
    documentUploadsEnabledSetting
  );

  const languagePromptConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedSuggestedPromptsByLanguage[language.code];
    const promptsForLanguage =
      stored && stored.length > 0 ? stored : suggestedPrompts;

    return {
      language,
      prompts: promptsForLanguage,
    };
  });
  const languageAboutConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedAboutContentByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? aboutContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });
  const languagePrivacyConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedPrivacyPolicyByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? privacyPolicyContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });

  const isGlobalFreeMessageMode = freeMessageSettings.mode === "global";
  const perModelInputClassName = cn(
    "rounded-md border bg-background px-3 py-2 text-sm",
    isGlobalFreeMessageMode &&
      "cursor-not-allowed bg-muted text-muted-foreground opacity-60"
  );
  const perModelFieldDescription = isGlobalFreeMessageMode
    ? "Managed by the global allowance above."
    : "Complimentary messages per day for this model when a user has no active credits.";
  const languageTermsConfigs = activeLanguagesList.map((language) => {
    const stored = normalizedTermsOfServiceByLanguage[language.code];
    const contentForLanguage =
      stored && stored.length > 0
        ? stored
        : language.isDefault
          ? termsOfServiceContent
          : "";

    return {
      language,
      content: contentForLanguage,
    };
  });

  const planTranslationDefinitions = activePlans.flatMap((plan) => [
    {
      key: `recharge.plan.${plan.id}.name`,
      defaultText: plan.name,
    },
    {
      key: `recharge.plan.${plan.id}.description`,
      defaultText: plan.description ?? "",
    },
  ]);

  const planTranslationKeys = planTranslationDefinitions.map(
    (definition) => definition.key
  );
  const planTranslationValuesByLanguage =
    planTranslationKeys.length > 0
      ? await getTranslationValuesForKeys(planTranslationKeys)
      : {};

  const planTranslationsByLanguage: Record<
    string,
    Record<string, { name: string; description: string }>
  > = {};

  for (const language of activeLanguagesList) {
    const languageValues = planTranslationValuesByLanguage[language.code] ?? {};
    const planMap: Record<string, { name: string; description: string }> = {};

    for (const plan of activePlans) {
      planMap[plan.id] = {
        name: language.isDefault
          ? plan.name
          : (languageValues[`recharge.plan.${plan.id}.name`] ?? ""),
        description: language.isDefault
          ? (plan.description ?? "")
          : (languageValues[`recharge.plan.${plan.id}.description`] ?? ""),
      };
    }

    planTranslationsByLanguage[language.code] = planMap;
  }

  return (
    <>
      <AdminSettingsNotice notice={notice} />

      <div className="flex flex-col gap-6">
        <CollapsibleSection
          description="Control access to optional, user-facing experiences."
          title="Feature settings"
        >
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">Community forum</span>
                  <EnabledBadge enabled={forumEnabled} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Toggle public access to the forum. When disabled, the forum
                  link disappears and all routes return a 404.
                </p>
              </div>
              <form
                action={updateForumAvailabilityAction}
                className="flex flex-col gap-3 text-sm"
              >
                <input
                  name="forumEnabled"
                  type="hidden"
                  value={(!forumEnabled).toString()}
                />
                <SettingsSubmitButton
                  pendingLabel={forumEnabled ? "Disabling…" : "Enabling…"}
                  successMessage="Forum availability updated."
                  variant={forumEnabled ? "destructive" : "default"}
                >
                  {forumEnabled ? "Disable forum" : "Enable forum"}
                </SettingsSubmitButton>
                <p className="text-muted-foreground text-xs">
                  Changes take effect immediately for all users.
                </p>
              </form>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    AI image generation
                  </span>
                  <EnabledBadge enabled={imageGenerationEnabled} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Show or hide the image generation entry points across the chat
                  experience.
                </p>
              </div>
              <form
                action={updateImageGenerationAvailabilityAction}
                className="flex flex-col gap-3 text-sm"
              >
                <input
                  name="imageGenerationEnabled"
                  type="hidden"
                  value={(!imageGenerationEnabled).toString()}
                />
                <SettingsSubmitButton
                  pendingLabel={
                    imageGenerationEnabled ? "Disabling…" : "Enabling…"
                  }
                  successMessage="Image generation availability updated."
                  variant={imageGenerationEnabled ? "destructive" : "default"}
                >
                  {imageGenerationEnabled
                    ? "Disable image generation"
                    : "Enable image generation"}
                </SettingsSubmitButton>
                <p className="text-muted-foreground text-xs">
                  Changes take effect immediately for all users.
                </p>
              </form>
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">
                    Document uploads
                  </span>
                  <EnabledBadge enabled={documentUploadsEnabled} />
                </div>
                <p className="text-muted-foreground text-xs">
                  Allow users to upload PDFs, DOCX, and XLSX files in chat.
                </p>
              </div>
              <form
                action={updateDocumentUploadsAvailabilityAction}
                className="flex flex-col gap-3 text-sm"
              >
                <input
                  name="documentUploadsEnabled"
                  type="hidden"
                  value={(!documentUploadsEnabled).toString()}
                />
                <SettingsSubmitButton
                  pendingLabel={
                    documentUploadsEnabled ? "Disabling…" : "Enabling…"
                  }
                  successMessage="Document upload availability updated."
                  variant={documentUploadsEnabled ? "destructive" : "default"}
                >
                  {documentUploadsEnabled
                    ? "Disable document uploads"
                    : "Enable document uploads"}
                </SettingsSubmitButton>
                <p className="text-muted-foreground text-xs">
                  Changes take effect immediately for all users.
                </p>
              </form>
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Set defaults for generated image downloads."
          title="Image generation defaults"
        >
          <form
            action={updateImageFilenamePrefixAction}
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="flex flex-col gap-2 md:col-span-2">
              <label
                className="font-medium text-sm"
                htmlFor="imageFilenamePrefix"
              >
                Download filename prefix
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={imageFilenamePrefix}
                id="imageFilenamePrefix"
                name="imageFilenamePrefix"
                placeholder="nano-banana"
              />
              <p className="text-muted-foreground text-xs">
                Leave blank to use the default prefix in generated image
                downloads.
              </p>
            </div>

            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton
                pendingLabel="Saving..."
                successMessage="Image filename prefix updated."
              >
                Save defaults
              </SettingsSubmitButton>
            </div>
          </form>
        </CollapsibleSection>

        <CollapsibleSection
          description="Choose whether complimentary daily messages come from each model or a single global allowance."
          title="Free message policy"
        >
          <form
            action={updateFreeMessageSettingsAction}
            className="grid gap-6 md:grid-cols-2"
          >
            <fieldset className="space-y-3">
              <legend className="font-medium text-sm">Allowance mode</legend>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <input
                  className="mt-1 h-4 w-4 cursor-pointer"
                  defaultChecked={freeMessageSettings.mode === "per-model"}
                  name="mode"
                  type="radio"
                  value="per-model"
                />
                <span>
                  <span className="font-medium">Per model allowances</span>
                  <br />
                  <span className="text-muted-foreground">
                    Each model can define its own complimentary daily messages.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm">
                <input
                  className="mt-1 h-4 w-4 cursor-pointer"
                  defaultChecked={freeMessageSettings.mode === "global"}
                  name="mode"
                  type="radio"
                  value="global"
                />
                <span>
                  <span className="font-medium">One limit for all models</span>
                  <br />
                  <span className="text-muted-foreground">
                    Override per-model allowances and use the global value
                    below.
                  </span>
                </span>
              </label>
            </fieldset>
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="globalLimit">
                Global daily free messages
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={freeMessageSettings.globalLimit}
                id="globalLimit"
                min={0}
                name="globalLimit"
                step={1}
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Used only when &ldquo;One limit for all models&rdquo; is
                selected.
              </p>
            </div>
            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton
                pendingLabel="Saving..."
                refreshOnSuccess={true}
                successMessage="Free message policy updated."
              >
                Save policy
              </SettingsSubmitButton>
            </div>
          </form>
          {isGlobalFreeMessageMode ? (
            <div className="rounded-md bg-amber-50 px-4 py-3 text-amber-800 text-sm dark:bg-amber-500/10 dark:text-amber-100">
              Per-model inputs are locked because a global allowance of{" "}
              {freeMessageSettings.globalLimit.toLocaleString()} messages per
              day is active.
            </div>
          ) : null}
        </CollapsibleSection>

        <CollapsibleSection
          description="Manage supported languages, per-language system prompts, and UI sync behavior. Default language must stay active."
          title="Language settings"
        >
          <div className="grid gap-6 lg:grid-cols-[minmax(0,340px)_1fr]">
            <form
              action={createLanguageAction}
              className="flex flex-col gap-4 rounded-lg border bg-background p-4"
            >
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="language-code">
                  Language code
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-code"
                  name="code"
                  pattern="[a-z0-9-]{2,16}"
                  placeholder="fr"
                  required
                  title="Use 2-16 lowercase letters, numbers, or hyphens."
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="language-name">
                  Language name
                </label>
                <input
                  className="rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-name"
                  name="name"
                  placeholder="French"
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label
                  className="font-medium text-sm"
                  htmlFor="language-system-prompt"
                >
                  Language system prompt
                </label>
                <textarea
                  className="min-h-[120px] rounded-md border bg-background px-3 py-2 text-sm"
                  id="language-system-prompt"
                  name="systemPrompt"
                  placeholder="e.g., Respond in French unless the user asks otherwise."
                />
                <p className="text-muted-foreground text-xs">
                  Appended to the selected model prompt when this language is
                  chosen.
                </p>
              </div>
              <label className="flex items-center gap-2 font-medium text-sm">
                <input
                  className="h-4 w-4 cursor-pointer"
                  name="syncUiLanguage"
                  type="checkbox"
                />
                Change UI language when selected
              </label>
              <label className="flex items-center gap-2 font-medium text-sm">
                <input
                  className="h-4 w-4 cursor-pointer"
                  defaultChecked
                  name="isActive"
                  type="checkbox"
                />
                Active immediately
              </label>
              <SettingsSubmitButton pendingLabel="Adding..." type="submit">
                Add language
              </SettingsSubmitButton>
            </form>
            <div className="space-y-4">
              {languages.length === 0 ? (
                <div className="rounded-lg border bg-background p-4 text-muted-foreground text-sm">
                  No languages configured yet.
                </div>
              ) : null}
              {languages.map((language) => {
                const statusBadge = language.isActive
                  ? "text-emerald-600 bg-emerald-500/10"
                  : "text-muted-foreground bg-muted/60";

                return (
                  <details
                    className="rounded-lg border bg-background p-4"
                    key={language.id}
                  >
                    <summary className="flex cursor-pointer flex-col gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{language.name}</span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium text-xs ${statusBadge}`}
                        >
                          {language.isActive ? "Active" : "Inactive"}
                        </span>
                        {language.syncUiLanguage ? (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs">
                            UI sync
                          </span>
                        ) : null}
                        {language.isDefault ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-[11px] text-primary uppercase tracking-wide">
                            Default
                          </span>
                        ) : null}
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        {language.code}
                      </span>
                    </summary>
                    <div className="mt-4 space-y-4">
                      <form
                        action={updateLanguageSettingsAction}
                        className="grid gap-4 md:grid-cols-2"
                      >
                        <input
                          name="languageId"
                          type="hidden"
                          value={language.id}
                        />
                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`language-name-${language.id}`}
                          >
                            Display name
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={language.name}
                            id={`language-name-${language.id}`}
                            name="name"
                          />
                        </div>
                        <div className="flex flex-col gap-2 md:col-span-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`language-prompt-${language.id}`}
                          >
                            System prompt
                          </label>
                          <textarea
                            className="min-h-[140px] rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={language.systemPrompt ?? ""}
                            id={`language-prompt-${language.id}`}
                            name="systemPrompt"
                            placeholder="e.g., Respond in this language unless the user requests another."
                          />
                          <p className="text-muted-foreground text-xs">
                            This prompt is appended to the selected model prompt.
                          </p>
                        </div>
                        <label className="flex items-center gap-2 font-medium text-sm md:col-span-2">
                          <input
                            className="h-4 w-4 cursor-pointer"
                            defaultChecked={language.syncUiLanguage}
                            name="syncUiLanguage"
                            type="checkbox"
                          />
                          Change UI language when this language is selected
                        </label>
                        <div className="flex justify-end md:col-span-2">
                          <SettingsSubmitButton pendingLabel="Saving...">
                            Save settings
                          </SettingsSubmitButton>
                        </div>
                      </form>
                      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                        {language.isDefault ? (
                          <span className="text-muted-foreground text-xs">
                            Default language cannot be deactivated or removed.
                          </span>
                        ) : (
                          <>
                            <form action={updateLanguageStatusAction}>
                              <input
                                name="languageId"
                                type="hidden"
                                value={language.id}
                              />
                              <input
                                name="intent"
                                type="hidden"
                                value={
                                  language.isActive ? "deactivate" : "activate"
                                }
                              />
                              <SettingsSubmitButton
                                pendingLabel={
                                  language.isActive
                                    ? "Disabling..."
                                    : "Enabling..."
                                }
                                size="sm"
                                variant="outline"
                              >
                                {language.isActive ? "Deactivate" : "Activate"}
                              </SettingsSubmitButton>
                            </form>
                            <form action={deleteLanguageAction}>
                              <input
                                name="languageId"
                                type="hidden"
                                value={language.id}
                              />
                              <SettingsSubmitButton
                                pendingLabel="Removing..."
                                size="sm"
                                variant="destructive"
                              >
                                Remove language
                              </SettingsSubmitButton>
                            </form>
                          </>
                        )}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Control the quick-start prompts that appear on the home screen."
          title="Home page pre-prompts"
        >
          <div className="space-y-6">
            <CollapsibleSection
              description="Customize the quick-start prompts that appear on the home screen. Enter one prompt per line for each language."
              title="Suggested prompts"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          Suggested prompts
                        </span>
                        <EnabledBadge enabled={suggestedPromptsEnabled} />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Toggle the suggested prompt chips shown on the home
                        page.
                      </p>
                    </div>
                    <form
                      action={updateSuggestedPromptsAvailabilityAction}
                      className="flex flex-col gap-3 text-sm"
                    >
                      <input
                        name="suggestedPromptsEnabled"
                        type="hidden"
                        value={(!suggestedPromptsEnabled).toString()}
                      />
                      <SettingsSubmitButton
                        pendingLabel={
                          suggestedPromptsEnabled
                            ? "Disabling..."
                            : "Enabling..."
                        }
                        successMessage="Suggested prompts updated."
                        variant={
                          suggestedPromptsEnabled ? "destructive" : "default"
                        }
                      >
                        {suggestedPromptsEnabled
                          ? "Disable suggested prompts"
                          : "Enable suggested prompts"}
                      </SettingsSubmitButton>
                    </form>
                  </div>
                </div>

                {languagePromptConfigs.length === 0 ? (
                  <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
                    No active languages are configured. Add a language before
                    managing prompts.
                  </div>
                ) : (
                  <div className="grid gap-6 lg:grid-cols-2">
                    {languagePromptConfigs.map(({ language, prompts }) => (
                      <LanguagePromptsForm
                        initialPrompts={prompts}
                        key={language.id}
                        language={language}
                        onSubmit={updateSuggestedPromptsAction}
                      />
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              description="Manage icon-based quick prompts displayed on the home screen."
              title="Icon pre-prompts"
            >
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-4 rounded-lg border bg-background p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          Icon pre-prompts
                        </span>
                        <EnabledBadge enabled={iconPromptSettings.enabled} />
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Toggle the icon-based prompt section shown on the home
                        page.
                      </p>
                    </div>
                    <form
                      action={updateIconPromptAvailabilityAction}
                      className="flex flex-col gap-3 text-sm"
                    >
                      <input
                        name="iconPromptsEnabled"
                        type="hidden"
                        value={(!iconPromptSettings.enabled).toString()}
                      />
                      <SettingsSubmitButton
                        pendingLabel={
                          iconPromptSettings.enabled
                            ? "Disabling..."
                            : "Enabling..."
                        }
                        successMessage="Icon pre-prompts updated."
                        variant={
                          iconPromptSettings.enabled ? "destructive" : "default"
                        }
                      >
                        {iconPromptSettings.enabled
                          ? "Disable icon pre-prompts"
                          : "Enable icon pre-prompts"}
                      </SettingsSubmitButton>
                    </form>
                  </div>
                </div>

                {activeLanguagesList.length === 0 ? (
                  <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
                    No active languages are configured. Add a language before
                    managing icon prompts.
                  </div>
                ) : (
                  <IconPromptSettingsForm
                    initialItems={iconPromptSettings.items}
                    languages={activeLanguagesList}
                    onSubmit={updateIconPromptsAction}
                  />
                )}
              </div>
            </CollapsibleSection>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          description="Update the copy shown on the public About, Privacy Policy, and Terms of Service pages."
          title="Public page content"
        >
          {activeLanguagesList.length === 0 ? (
            <div className="rounded-md border border-muted-foreground/30 border-dashed bg-muted/30 p-4 text-muted-foreground text-sm">
              No active languages are configured. Add a language before managing
              public page content.
            </div>
          ) : (
            <div className="space-y-10">
              <div className="space-y-4">
                <h3 className="font-semibold text-base">About page content</h3>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languageAboutConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      contentLabel="about content"
                      helperText={{
                        default:
                          "Shown on the about page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      key={language.id}
                      language={language}
                      onSubmit={updateAboutContentAction}
                      placeholders={{
                        default: "Enter about content",
                        localized: "Provide localized about content",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-base">
                    Privacy policy content
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Appears at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /privacy-policy
                    </code>
                    .
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languagePrivacyConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      contentLabel="privacy policy"
                      helperText={{
                        default:
                          "Shown on the privacy policy page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      key={language.id}
                      language={language}
                      onSubmit={updatePrivacyPolicyByLanguageAction}
                      placeholders={{
                        default: "Enter privacy policy content",
                        localized: "Provide localized privacy policy content",
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold text-base">
                    Terms of service content
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    Appears at{" "}
                    <code className="rounded bg-muted px-1 py-0.5 text-xs">
                      /terms-of-service
                    </code>
                    .
                  </p>
                </div>
                <div className="grid gap-6 lg:grid-cols-2">
                  {languageTermsConfigs.map(({ language, content }) => (
                    <LanguageContentForm
                      contentLabel="terms of service"
                      helperText={{
                        default:
                          "Shown on the terms of service page when no localized version is available.",
                        localized: `Displayed when ${language.name} is selected. Falls back to the default language if left blank.`,
                      }}
                      initialContent={content}
                      key={language.id}
                      language={language}
                      onSubmit={updateTermsOfServiceByLanguageAction}
                      placeholders={{
                        default: "Enter terms of service content",
                        localized: "Provide localized terms of service content",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </CollapsibleSection>
        <CollapsibleSection
          description="Define recharge tiers that control how many tokens and credits users receive. Plans become available immediately."
          title="Pricing plans"
        >
          <div className="space-y-1 rounded-md border border-muted-foreground/40 border-dashed bg-muted/20 px-3 py-2 text-muted-foreground text-xs">
            <div>
              Current recommended plan: {recommendedPlanName ?? "None selected"}
            </div>
            {recommendedPlanSetting && !recommendedPlanId ? (
              <div className="text-amber-600">
                The previously selected plan is no longer active. Choose a new
                recommended plan below.
              </div>
            ) : null}
          </div>

          <form
            action={createPricingPlanAction}
            className="grid gap-4 md:grid-cols-2"
          >
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="plan-name">
                Plan name
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-name"
                name="name"
                placeholder="Starter"
                required
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-medium text-sm" htmlFor="plan-description">
                Description
              </label>
              <textarea
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-description"
                name="description"
                placeholder="Great for individual builders."
              />
            </div>
            <div className="space-y-3 md:col-span-2">
              <PlanPricingFields
                modelCosts={providerCostSummaries}
                usdToInr={usdToInr}
              />
              <p className="text-muted-foreground text-xs">
                Display credits are calculated automatically (
                {TOKENS_PER_CREDIT} tokens per credit).
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="plan-duration">
                Billing cycle (days)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="plan-duration"
                min={0}
                name="billingCycleDays"
                placeholder="90"
                required
                type="number"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                className="h-4 w-4"
                defaultChecked
                id="plan-active"
                name="isActive"
                type="checkbox"
              />
              <label className="font-medium text-sm" htmlFor="plan-active">
                Plan is active
              </label>
            </div>
            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton pendingLabel="Creating...">
                Create plan
              </SettingsSubmitButton>
            </div>
          </form>

          <div className="mt-8 space-y-4">
            {activePlans.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No plans created yet.
              </p>
            ) : (
              activePlans.map((plan) => {
                const priceInRupees = plan.priceInPaise / 100;
                const credits = Math.floor(
                  plan.tokenAllowance / TOKENS_PER_CREDIT
                );
                const isRecommendedPlan = recommendedPlanId === plan.id;
                const nonDefaultLanguages = activeLanguagesList.filter(
                  (language) => !language.isDefault
                );
                return (
                  <details
                    className="overflow-hidden rounded-lg border bg-background"
                    key={plan.id}
                  >
                    <summary className="flex cursor-pointer items-center justify-between gap-4 bg-muted/50 px-4 py-3 font-medium text-sm">
                      <span className="flex items-center gap-2">
                        <span>{plan.name}</span>
                        {isRecommendedPlan ? (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary text-xs">
                            Recommended
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {plan.isActive ? "Active" : "Inactive"}
                      </span>
                    </summary>
                    <div className="grid gap-6 border-t p-4 md:grid-cols-[3fr,2fr]">
                      <div className="space-y-6">
                        <form
                          action={updatePricingPlanAction}
                          className="flex flex-col gap-4"
                        >
                          <input name="id" type="hidden" value={plan.id} />
                          <div className="flex flex-col gap-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`plan-update-name-${plan.id}`}
                            >
                              Plan name (English)
                            </label>
                            <input
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={plan.name}
                              id={`plan-update-name-${plan.id}`}
                              name="name"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`plan-update-description-${plan.id}`}
                            >
                              Description (English)
                            </label>
                            <textarea
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={plan.description ?? ""}
                              id={`plan-update-description-${plan.id}`}
                              name="description"
                            />
                          </div>
                          <div className="space-y-3">
                            <PlanPricingFields
                              initialPriceInRupees={priceInRupees}
                              initialTokenAllowance={plan.tokenAllowance}
                              modelCosts={providerCostSummaries}
                              usdToInr={usdToInr}
                            />
                            <p className="text-muted-foreground text-xs">
                              Display credits are calculated automatically (
                              {TOKENS_PER_CREDIT} tokens per credit).
                            </p>
                          </div>
                          <div className="flex flex-col gap-2 sm:w-48">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`plan-cycle-${plan.id}`}
                            >
                              Cycle (days)
                            </label>
                            <input
                              className="rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={plan.billingCycleDays}
                              id={`plan-cycle-${plan.id}`}
                              min={0}
                              name="billingCycleDays"
                              type="number"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              className="h-4 w-4"
                              defaultChecked={plan.isActive}
                              id={`plan-active-${plan.id}`}
                              name="isActive"
                              type="checkbox"
                            />
                            <label
                              className="font-medium text-sm"
                              htmlFor={`plan-active-${plan.id}`}
                            >
                              Plan is active
                            </label>
                          </div>
                          <div className="flex justify-end gap-2">
                            <SettingsSubmitButton
                              pendingLabel="Saving..."
                              successMessage="Plan updated"
                            >
                              Save changes
                            </SettingsSubmitButton>
                          </div>
                        </form>

                        <div className="space-y-4">
                          <h4 className="font-semibold text-muted-foreground text-sm">
                            Localized content
                          </h4>
                          <div className="grid gap-4 md:grid-cols-2">
                            {nonDefaultLanguages.length === 0 ? (
                              <div className="rounded-lg border border-dashed bg-muted/20 p-3 text-muted-foreground text-sm">
                                Add another language to provide localized plan
                                details.
                              </div>
                            ) : (
                              nonDefaultLanguages.map((language) => {
                                const translation = planTranslationsByLanguage[
                                  language.code
                                ]?.[plan.id] ?? {
                                  name: "",
                                  description: "",
                                };
                                const formId = `plan-translation-${plan.id}-${language.code}`;

                                return (
                                  <form
                                    action={updatePlanTranslationAction}
                                    className="flex flex-col gap-3 rounded-lg border bg-background p-3"
                                    key={formId}
                                  >
                                    <input
                                      name="planId"
                                      type="hidden"
                                      value={plan.id}
                                    />
                                    <input
                                      name="languageCode"
                                      type="hidden"
                                      value={language.code}
                                    />
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium text-sm">
                                        {language.name}
                                      </span>
                                      <span className="text-muted-foreground text-xs">
                                        {language.code.toUpperCase()}
                                      </span>
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <label
                                        className="font-medium text-xs"
                                        htmlFor={`${formId}-name`}
                                      >
                                        Plan name
                                      </label>
                                      <input
                                        className="rounded-md border bg-background px-3 py-2 text-sm"
                                        defaultValue={translation.name}
                                        id={`${formId}-name`}
                                        name="name"
                                        placeholder="Enter localized name"
                                      />
                                    </div>
                                    <div className="flex flex-col gap-2">
                                      <label
                                        className="font-medium text-xs"
                                        htmlFor={`${formId}-description`}
                                      >
                                        Description
                                      </label>
                                      <textarea
                                        className="rounded-md border bg-background px-3 py-2 text-sm"
                                        defaultValue={translation.description}
                                        id={`${formId}-description`}
                                        name="description"
                                        placeholder="Enter localized description"
                                      />
                                      <p className="text-[11px] text-muted-foreground">
                                        Leave blank to fall back to English.
                                      </p>
                                    </div>
                                    <div className="flex justify-end">
                                      <SettingsSubmitButton
                                        pendingLabel="Saving..."
                                        size="sm"
                                        variant="outline"
                                      >
                                        {`Save ${language.name}`}
                                      </SettingsSubmitButton>
                                    </div>
                                  </form>
                                );
                              })
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col justify-between gap-4">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {isRecommendedPlan
                                ? "Recommended plan"
                                : "Not recommended"}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {isRecommendedPlan ? (
                                <form action={setRecommendedPricingPlanAction}>
                                  <input name="planId" type="hidden" value="" />
                                  <SettingsSubmitButton
                                    pendingLabel="Updating..."
                                    variant="outline"
                                  >
                                    Remove recommendation
                                  </SettingsSubmitButton>
                                </form>
                              ) : (
                                <form action={setRecommendedPricingPlanAction}>
                                  <input
                                    name="planId"
                                    type="hidden"
                                    value={plan.id}
                                  />
                                  <SettingsSubmitButton
                                    disabled={!plan.isActive}
                                    pendingLabel="Updating..."
                                  >
                                    Set as recommended
                                  </SettingsSubmitButton>
                                </form>
                              )}
                            </div>
                          </div>
                          {!plan.isActive && !isRecommendedPlan ? (
                            <p className="text-muted-foreground text-xs">
                              Activate this plan before setting it as
                              recommended.
                            </p>
                          ) : null}
                        </div>
                        <dl className="grid gap-2 text-sm">
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Credits provided
                            </dt>
                            <dd className="font-medium">
                              {credits.toLocaleString()}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Tokens provided
                            </dt>
                            <dd className="font-medium">
                              {plan.tokenAllowance.toLocaleString()}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Billing cycle
                            </dt>
                            <dd className="font-medium">
                              {plan.billingCycleDays} day
                              {plan.billingCycleDays === 1 ? "" : "s"}
                            </dd>
                          </div>
                          <div className="flex items-center justify-between">
                            <dt className="text-muted-foreground">
                              Price (INR)
                            </dt>
                            <dd className="font-medium">
                              {priceInRupees.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </dd>
                          </div>
                        </dl>
                        <div className="flex flex-wrap gap-2">
                          <form action={deletePricingPlanAction}>
                            <input name="id" type="hidden" value={plan.id} />
                            <SettingsSubmitButton
                              className="border border-destructive text-destructive hover:bg-destructive/10"
                              pendingLabel="Soft deleting..."
                              variant="outline"
                            >
                              Soft delete
                            </SettingsSubmitButton>
                          </form>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })
            )}
          </div>

          {deletedPlans.length > 0 && (
            <div className="mt-8 space-y-3">
              <h3 className="font-semibold text-muted-foreground text-sm">
                Deleted plans
              </h3>
              <div className="grid gap-2">
                {deletedPlans.map((plan) => (
                  <div
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm shadow-sm"
                    key={plan.id}
                  >
                    <div className="flex flex-col">
                      <span className="font-medium">{plan.name}</span>
                      <span className="text-muted-foreground text-xs">
                        Deleted{" "}
                        {plan.deletedAt
                          ? formatDistanceToNow(new Date(plan.deletedAt), {
                              addSuffix: true,
                            })
                          : "recently"}
                      </span>
                    </div>
                    <form action={hardDeletePricingPlanAction}>
                      <input name="id" type="hidden" value={plan.id} />
                      <SettingsSubmitButton
                        pendingLabel="Hard deleting..."
                        size="sm"
                        variant="destructive"
                      >
                        Hard delete
                      </SettingsSubmitButton>
                    </form>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleSection>

        <CollapsibleSection
          description="Manage text and image model configurations in one place."
          title="Models"
        >
          <div className="space-y-6">
            <CollapsibleSection
              description="Configure additional providers. Ensure the relevant API key is available in the environment."
              title="Add new model"
            >
              <form
                action={createModelConfigAction}
                className="grid gap-4 md:grid-cols-2"
              >
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="key">
                Model key
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="key"
                name="key"
                placeholder="openai-gpt-4o-mini"
                required
              />
              <p className="text-muted-foreground text-xs">
                Internal identifier that must be unique.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="provider">
                Provider
              </label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue="openai"
                id="provider"
                name="provider"
                required
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="providerModelId">
                Provider model ID
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="providerModelId"
                name="providerModelId"
                placeholder="gpt-4o-mini"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="displayName">
                Display name
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="displayName"
                name="displayName"
                placeholder="GPT-4o mini"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="inputProviderCostPerMillion"
              >
                Provider input cost (USD / 1M tokens)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={0}
                id="inputProviderCostPerMillion"
                min={0}
                name="inputProviderCostPerMillion"
                step="0.000001"
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                Private reference so you can compare user pricing versus your
                provider costs.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="outputProviderCostPerMillion"
              >
                Provider output cost (USD / 1M tokens)
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={0}
                id="outputProviderCostPerMillion"
                min={0}
                name="outputProviderCostPerMillion"
                step="0.000001"
                type="number"
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="freeMessagesPerDay"
              >
                Daily free messages
              </label>
              <input
                aria-disabled={isGlobalFreeMessageMode || undefined}
                className={perModelInputClassName}
                defaultValue={DEFAULT_FREE_MESSAGES_PER_DAY}
                id="freeMessagesPerDay"
                min={0}
                name="freeMessagesPerDay"
                readOnly={isGlobalFreeMessageMode}
                step={1}
                type="number"
              />
              <p className="text-muted-foreground text-xs">
                {perModelFieldDescription}
              </p>
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-medium text-sm" htmlFor="description">
                Description
              </label>
              <textarea
                className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                id="description"
                name="description"
                placeholder="Explain what this model is best suited for."
              />
            </div>

            <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="systemPrompt">
                  System prompt (optional)
                </label>
                <textarea
                  className="min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
                  id="systemPrompt"
                  name="systemPrompt"
                  placeholder="Custom system instructions"
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="font-medium text-sm" htmlFor="codeTemplate">
                  Provider code snippet (optional)
                </label>
                <textarea
                  className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                  id="codeTemplate"
                  name="codeTemplate"
                  placeholder="Store reference code for this model (not executed)."
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="reasoningTag">
                Reasoning tag
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="reasoningTag"
                name="reasoningTag"
                placeholder="think"
              />
              <p className="text-muted-foreground text-xs">
                Required when enabling reasoning output to wrap &lt;tag&gt;
                sequences.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="configJson">
                Provider config (JSON, optional)
              </label>
              <textarea
                className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                id="configJson"
                name="configJson"
                placeholder='{"baseURL":"https://..."}'
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                defaultChecked
                id="isEnabled"
                name="isEnabled"
                type="checkbox"
              />
              <label className="font-medium text-sm" htmlFor="isEnabled">
                Enable immediately
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                id="supportsReasoning"
                name="supportsReasoning"
                type="checkbox"
              />
              <label
                className="font-medium text-sm"
                htmlFor="supportsReasoning"
              >
                Supports reasoning traces
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                id="isDefault"
                name="isDefault"
                type="checkbox"
              />
              <label className="font-medium text-sm" htmlFor="isDefault">
                Set as default model
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                id="isMarginBaseline"
                name="isMarginBaseline"
                type="checkbox"
              />
              <label className="font-medium text-sm" htmlFor="isMarginBaseline">
                Use as margin baseline
              </label>
            </div>

            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton pendingLabel="Creating...">
                Create model
              </SettingsSubmitButton>
            </div>
              </form>
            </CollapsibleSection>

            <CollapsibleSection title="Configured models">
              <div className="space-y-6">
                {activeModels.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No models configured yet.
                  </p>
                ) : (
                  activeModels.map((model) => {
                const providerInputRate = Number(
                  model.inputProviderCostPerMillion ?? 0
                );
                const providerOutputRate = Number(
                  model.outputProviderCostPerMillion ?? 0
                );
                const totalProviderRate =
                  providerInputRate + providerOutputRate;
                const formatUsd = (value: number) =>
                  value.toLocaleString("en-US", {
                    style: "currency",
                    currency: "USD",
                    minimumFractionDigits: value >= 1 ? 2 : 4,
                    maximumFractionDigits: 6,
                  });

                return (
                  <details
                    className="rounded-md border bg-background p-4"
                    key={model.id}
                  >
                    <summary className="flex cursor-pointer flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{model.displayName}</span>
                        <ProviderBadge value={model.provider} />
                        <EnabledBadge enabled={model.isEnabled} />
                        {model.isDefault && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-700 text-xs">
                            Default
                          </span>
                        )}
                        {model.isMarginBaseline && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-700 text-xs">
                            Margin baseline
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        {model.providerModelId}
                      </span>
                    </summary>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <form
                        action={updateModelConfigAction}
                        className="grid gap-4 md:col-span-2 md:grid-cols-2"
                      >
                        <input name="id" type="hidden" value={model.id} />

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-display-name-${model.id}`}
                          >
                            Display name
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.displayName}
                            id={`model-display-name-${model.id}`}
                            name="displayName"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-provider-${model.id}`}
                          >
                            Provider
                          </label>
                          <select
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.provider}
                            id={`model-provider-${model.id}`}
                            name="provider"
                          >
                            {PROVIDER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-provider-id-${model.id}`}
                          >
                            Provider model ID
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.providerModelId}
                            id={`model-provider-id-${model.id}`}
                            name="providerModelId"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-input-cost-${model.id}`}
                          >
                            Provider input cost (USD / 1M tokens)
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={
                              model.inputProviderCostPerMillion ?? 0
                            }
                            id={`model-input-cost-${model.id}`}
                            min={0}
                            name="inputProviderCostPerMillion"
                            step="0.000001"
                            type="number"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-output-cost-${model.id}`}
                          >
                            Provider output cost (USD / 1M tokens)
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={
                              model.outputProviderCostPerMillion ?? 0
                            }
                            id={`model-output-cost-${model.id}`}
                            min={0}
                            name="outputProviderCostPerMillion"
                            step="0.000001"
                            type="number"
                          />
                          <p className="text-muted-foreground text-xs">
                            Only visible here — use it to track your real spend
                            versus credits charged.
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-free-messages-${model.id}`}
                          >
                            Daily free messages
                          </label>
                          <input
                            aria-disabled={isGlobalFreeMessageMode || undefined}
                            className={perModelInputClassName}
                            defaultValue={
                              model.freeMessagesPerDay ??
                              DEFAULT_FREE_MESSAGES_PER_DAY
                            }
                            id={`model-free-messages-${model.id}`}
                            min={0}
                            name="freeMessagesPerDay"
                            readOnly={isGlobalFreeMessageMode}
                            step={1}
                            type="number"
                          />
                          <p className="text-muted-foreground text-xs">
                            {perModelFieldDescription}
                          </p>
                        </div>

                        <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs sm:text-sm md:col-span-2">
                          <h4 className="font-semibold text-foreground text-sm">
                            Provider cost reference (per 1M tokens)
                          </h4>
                          <div className="mt-3 grid gap-2 sm:grid-cols-3">
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                Input cost
                              </p>
                              <p>{formatUsd(providerInputRate)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                Output cost
                              </p>
                              <p>{formatUsd(providerOutputRate)}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground text-xs uppercase tracking-wide">
                                Total
                              </p>
                              <p>{formatUsd(totalProviderRate)}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-muted-foreground text-xs">
                            Revenue now comes from your pricing plans. Keep
                            these costs updated to track real spend vs. credit
                            sales.
                          </p>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-reasoning-tag-${model.id}`}
                          >
                            Reasoning tag
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.reasoningTag ?? ""}
                            id={`model-reasoning-tag-${model.id}`}
                            name="reasoningTag"
                          />
                        </div>

                        <div className="flex flex-col gap-2 md:col-span-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-description-${model.id}`}
                          >
                            Description
                          </label>
                          <textarea
                            className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.description}
                            id={`model-description-${model.id}`}
                            name="description"
                          />
                        </div>

                        <div className="grid gap-4 md:col-span-2 md:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`model-system-prompt-${model.id}`}
                            >
                              System prompt
                            </label>
                            <textarea
                              className="min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
                              defaultValue={model.systemPrompt ?? ""}
                              id={`model-system-prompt-${model.id}`}
                              name="systemPrompt"
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <label
                              className="font-medium text-sm"
                              htmlFor={`model-code-template-${model.id}`}
                            >
                              Provider code snippet
                            </label>
                            <textarea
                              className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                              defaultValue={model.codeTemplate ?? ""}
                              id={`model-code-template-${model.id}`}
                              name="codeTemplate"
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2 md:col-span-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`model-config-json-${model.id}`}
                          >
                            Provider config (JSON)
                          </label>
                          <textarea
                            className="min-h-[100px] rounded-md border bg-background px-3 py-2 font-mono text-xs"
                            defaultValue={
                              model.config
                                ? JSON.stringify(model.config, null, 2)
                                : ""
                            }
                            id={`model-config-json-${model.id}`}
                            name="configJson"
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            name="supportsReasoning"
                            type="hidden"
                            value="false"
                          />
                          <input
                            className="h-4 w-4"
                            defaultChecked={model.supportsReasoning}
                            id={`supportsReasoning-${model.id}`}
                            name="supportsReasoning"
                            type="checkbox"
                            value="true"
                          />
                          <label
                            className="font-medium text-sm"
                            htmlFor={`supportsReasoning-${model.id}`}
                          >
                            Supports reasoning traces
                          </label>
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            name="isEnabled"
                            type="hidden"
                            value="false"
                          />
                          <input
                            className="h-4 w-4"
                            defaultChecked={model.isEnabled}
                            id={`isEnabled-${model.id}`}
                            name="isEnabled"
                            type="checkbox"
                            value="true"
                          />
                          <label
                            className="font-medium text-sm"
                            htmlFor={`isEnabled-${model.id}`}
                          >
                            Enabled
                          </label>
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            name="isDefault"
                            type="hidden"
                            value="false"
                          />
                          <input
                            className="h-4 w-4"
                            defaultChecked={model.isDefault}
                            id={`isDefault-${model.id}`}
                            name="isDefault"
                            type="checkbox"
                            value="true"
                          />
                          <label
                            className="font-medium text-sm"
                            htmlFor={`isDefault-${model.id}`}
                          >
                            Default model
                          </label>
                        </div>

                        <div className="flex justify-end md:col-span-2">
                          <SettingsSubmitButton
                            pendingLabel="Saving..."
                            successMessage="Model updated."
                          >
                            Save changes
                          </SettingsSubmitButton>
                        </div>
                      </form>

                      <div className="flex flex-wrap gap-3 md:col-span-2">
                        {!model.isDefault && (
                          <form action={setDefaultModelConfigAction}>
                            <input name="id" type="hidden" value={model.id} />
                            <SettingsSubmitButton
                              pendingLabel="Updating..."
                              size="sm"
                              variant="outline"
                            >
                              Set as default
                            </SettingsSubmitButton>
                          </form>
                        )}
                        {!model.isMarginBaseline && (
                          <form action={setMarginBaselineModelAction}>
                            <input name="id" type="hidden" value={model.id} />
                            <SettingsSubmitButton
                              pendingLabel="Updating..."
                              size="sm"
                              variant="outline"
                            >
                              Set as margin baseline
                            </SettingsSubmitButton>
                          </form>
                        )}

                        <form action={deleteModelConfigAction}>
                          <input name="id" type="hidden" value={model.id} />
                          <SettingsSubmitButton
                            className="border border-destructive text-destructive hover:bg-destructive/10"
                            pendingLabel="Soft deleting..."
                            size="sm"
                            variant="outline"
                          >
                            Soft delete
                          </SettingsSubmitButton>
                        </form>
                      </div>
                    </div>
                  </details>
                );
              })
            )}
              </div>

              {deletedModels.length > 0 && (
                <div className="mt-8 space-y-3">
                  <h3 className="font-semibold text-muted-foreground text-sm">
                    Deleted models
                  </h3>
                  <div className="grid gap-2">
                    {deletedModels.map((model) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm shadow-sm"
                        key={model.id}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {model.displayName}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Deleted{" "}
                            {model.deletedAt
                              ? formatDistanceToNow(new Date(model.deletedAt), {
                                  addSuffix: true,
                                })
                              : "recently"}
                          </span>
                        </div>
                        <form action={hardDeleteModelConfigAction}>
                          <input name="id" type="hidden" value={model.id} />
                          <SettingsSubmitButton
                            pendingLabel="Hard deleting..."
                            size="sm"
                            variant="destructive"
                          >
                            Hard delete
                          </SettingsSubmitButton>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection
              description="Choose which text model translates Khasi prompts to English during image generation."
              title="Image prompt translation model"
            >
              <form
                action={setImagePromptTranslationModelAction}
                className="grid gap-4 md:grid-cols-2"
              >
                <div className="flex flex-col gap-2 md:col-span-2">
                  <label
                    className="font-medium text-sm"
                    htmlFor="imagePromptTranslationModel"
                  >
                    Translation model
                  </label>
                  <select
                    className="rounded-md border bg-background px-3 py-2 text-sm"
                    defaultValue={imagePromptTranslationModel?.id ?? ""}
                    id="imagePromptTranslationModel"
                    name="modelId"
                  >
                    <option value="">
                      Use server default translation model
                    </option>
                    {enabledModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.displayName} ({model.provider})
                      </option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    Only enabled models are available. Selecting a model here
                    overrides the default translation model.
                  </p>
                </div>

                <div className="flex justify-end md:col-span-2">
                  <SettingsSubmitButton pendingLabel="Saving...">
                    Save translation model
                  </SettingsSubmitButton>
                </div>
              </form>

              <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs sm:text-sm">
                <h4 className="font-semibold text-foreground text-sm">
                  Current selection
                </h4>
                {imagePromptTranslationModel ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-medium">
                      {imagePromptTranslationModel.displayName}
                    </span>
                    <ProviderBadge value={imagePromptTranslationModel.provider} />
                    <EnabledBadge
                      enabled={imagePromptTranslationModel.isEnabled}
                    />
                    <span className="font-mono text-muted-foreground text-xs">
                      {imagePromptTranslationModel.providerModelId}
                    </span>
                  </div>
                ) : (
                  <p className="mt-2 text-muted-foreground">
                    Using the server default translation model.
                  </p>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              description="Add Google Nano Banana (or other image models) and define per-image pricing."
              title="Add image generation model"
            >
              <form
                action={createImageModelConfigAction}
                className="grid gap-4 md:grid-cols-2"
              >
            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="imageModelKey">
                Model key
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="imageModelKey"
                name="key"
                placeholder="google-nano-banana"
                required
              />
              <p className="text-muted-foreground text-xs">
                Internal identifier that must be unique.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <label className="font-medium text-sm" htmlFor="imageProvider">
                Provider
              </label>
              <select
                className="rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue="google"
                id="imageProvider"
                name="provider"
                required
              >
                {PROVIDER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="imageProviderModelId"
              >
                Provider model ID
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="imageProviderModelId"
                name="providerModelId"
                placeholder="gemini-2.5-flash-image-preview"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label
                className="font-medium text-sm"
                htmlFor="imageDisplayName"
              >
                Display name
              </label>
              <input
                className="rounded-md border bg-background px-3 py-2 text-sm"
                id="imageDisplayName"
                name="displayName"
                placeholder="Nano Banana (Image)"
                required
              />
            </div>

            <div className="md:col-span-2">
              <ImageModelPricingFields
                initialTokensPerImage={TOKENS_PER_CREDIT}
                inputIdPrefix="image-model-create"
                recommendedPlanPriceInPaise={recommendedPlanPriceInPaise}
                recommendedPlanTokenAllowance={recommendedPlanTokenAllowance}
              />
            </div>

            <div className="flex flex-col gap-2 md:col-span-2">
              <label className="font-medium text-sm" htmlFor="imageDescription">
                Description
              </label>
              <textarea
                className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                id="imageDescription"
                name="description"
                placeholder="Explain what this image model is best suited for."
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                defaultChecked
                id="imageIsEnabled"
                name="isEnabled"
                type="checkbox"
              />
              <label className="font-medium text-sm" htmlFor="imageIsEnabled">
                Enable immediately
              </label>
            </div>

            <div className="flex items-center gap-3">
              <input
                className="h-4 w-4"
                id="imageIsActive"
                name="isActive"
                type="checkbox"
              />
              <label className="font-medium text-sm" htmlFor="imageIsActive">
                Set as active image model
              </label>
            </div>

            <div className="flex justify-end md:col-span-2">
              <SettingsSubmitButton
                pendingLabel="Creating..."
                refreshOnSuccess={true}
                successMessage="Image model configuration created."
              >
                Create image model
              </SettingsSubmitButton>
            </div>
              </form>
            </CollapsibleSection>

            <CollapsibleSection title="Configured image models">
              <div className="space-y-6">
                {activeImageModels.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No image models configured yet.
                  </p>
                ) : (
                  activeImageModels.map((model) => {
                const tokensPerImage = Number(
                  model.tokensPerImage ?? TOKENS_PER_CREDIT
                );
                const creditsPerImage = tokensPerImage / TOKENS_PER_CREDIT;
                const priceInRupees =
                  typeof model.priceInPaise === "number"
                    ? model.priceInPaise / 100
                    : 0;

                return (
                  <details
                    className="rounded-md border bg-background p-4"
                    key={model.id}
                  >
                    <summary className="flex cursor-pointer flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{model.displayName}</span>
                        <ProviderBadge value={model.provider} />
                        <EnabledBadge enabled={model.isEnabled} />
                        <ActiveBadge active={model.isActive} />
                      </div>
                      <span className="font-mono text-muted-foreground text-xs">
                        {model.providerModelId}
                      </span>
                    </summary>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-xs sm:text-sm md:col-span-2">
                        <h4 className="font-semibold text-foreground text-sm">
                          Image pricing
                        </h4>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Price (INR)
                            </p>
                            <p>
                              {priceInRupees > 0
                                ? priceInRupees.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })
                                : "Not set"}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Credits per image
                            </p>
                            <p>{creditsPerImage.toFixed(2)}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground text-xs uppercase tracking-wide">
                              Tokens per image
                            </p>
                            <p>{tokensPerImage.toLocaleString()}</p>
                          </div>
                        </div>
                      </div>

                      <form
                        action={updateImageModelConfigAction}
                        className="grid gap-4 md:col-span-2 md:grid-cols-2"
                      >
                        <input name="id" type="hidden" value={model.id} />

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`image-model-display-name-${model.id}`}
                          >
                            Display name
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.displayName}
                            id={`image-model-display-name-${model.id}`}
                            name="displayName"
                          />
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`image-model-provider-${model.id}`}
                          >
                            Provider
                          </label>
                          <select
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.provider}
                            id={`image-model-provider-${model.id}`}
                            name="provider"
                          >
                            {PROVIDER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`image-model-provider-id-${model.id}`}
                          >
                            Provider model ID
                          </label>
                          <input
                            className="rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.providerModelId}
                            id={`image-model-provider-id-${model.id}`}
                            name="providerModelId"
                          />
                        </div>

                        <div className="md:col-span-2">
                          <ImageModelPricingFields
                            initialPriceInPaise={model.priceInPaise ?? 0}
                            initialTokensPerImage={tokensPerImage}
                            inputIdPrefix={`image-model-${model.id}`}
                            recommendedPlanPriceInPaise={
                              recommendedPlanPriceInPaise
                            }
                            recommendedPlanTokenAllowance={
                              recommendedPlanTokenAllowance
                            }
                          />
                        </div>

                        <div className="flex flex-col gap-2 md:col-span-2">
                          <label
                            className="font-medium text-sm"
                            htmlFor={`image-model-description-${model.id}`}
                          >
                            Description
                          </label>
                          <textarea
                            className="min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm"
                            defaultValue={model.description}
                            id={`image-model-description-${model.id}`}
                            name="description"
                          />
                        </div>

                        <div className="flex items-center gap-3">
                          <input
                            name="isEnabled"
                            type="hidden"
                            value="false"
                          />
                          <input
                            className="h-4 w-4"
                            defaultChecked={model.isEnabled}
                            id={`image-model-enabled-${model.id}`}
                            name="isEnabled"
                            type="checkbox"
                            value="true"
                          />
                          <label
                            className="font-medium text-sm"
                            htmlFor={`image-model-enabled-${model.id}`}
                          >
                            Enabled
                          </label>
                        </div>

                        <div className="flex justify-end md:col-span-2">
                          <SettingsSubmitButton
                            pendingLabel="Saving..."
                            successMessage="Image model updated."
                          >
                            Save changes
                          </SettingsSubmitButton>
                        </div>
                      </form>

                      <div className="flex flex-wrap gap-3 md:col-span-2">
                        {!model.isActive && (
                          <form action={setActiveImageModelConfigAction}>
                            <input name="id" type="hidden" value={model.id} />
                            <SettingsSubmitButton
                              pendingLabel="Updating..."
                              size="sm"
                              variant="outline"
                            >
                              Set as active
                            </SettingsSubmitButton>
                          </form>
                        )}

                        <form action={deleteImageModelConfigAction}>
                          <input name="id" type="hidden" value={model.id} />
                          <SettingsSubmitButton
                            className="border border-destructive text-destructive hover:bg-destructive/10"
                            pendingLabel="Soft deleting..."
                            size="sm"
                            variant="outline"
                          >
                            Soft delete
                          </SettingsSubmitButton>
                        </form>
                      </div>
                    </div>
                  </details>
                );
              })
            )}
              </div>

              {deletedImageModels.length > 0 && (
                <div className="mt-8 space-y-3">
                  <h3 className="font-semibold text-muted-foreground text-sm">
                    Deleted image models
                  </h3>
                  <div className="grid gap-2">
                    {deletedImageModels.map((model) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background p-3 text-sm shadow-sm"
                        key={model.id}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {model.displayName}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            Deleted{" "}
                            {model.deletedAt
                              ? formatDistanceToNow(new Date(model.deletedAt), {
                                  addSuffix: true,
                                })
                              : "recently"}
                          </span>
                        </div>
                        <form action={hardDeleteImageModelConfigAction}>
                          <input name="id" type="hidden" value={model.id} />
                          <SettingsSubmitButton
                            pendingLabel="Hard deleting..."
                            size="sm"
                            variant="destructive"
                          >
                            Hard delete
                          </SettingsSubmitButton>
                        </form>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CollapsibleSection>
          </div>
        </CollapsibleSection>
      </div>
    </>
  );
}
