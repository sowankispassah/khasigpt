import "server-only";

import {
  buildImageGenerationAccessFromAvailability,
  getImageGenerationAccess,
  getImageGenerationAvailability,
  isImageGenerationEnabledForAllUsers,
} from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import { sortPricingPlansForDisplay } from "@/lib/billing/pricing-plans";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  getAppSetting,
  getLastKnownAppSetting,
  getUserBalanceSummary,
  listLanguagesWithSettings,
  listPricingPlans,
  listTranslationFeatureLanguagesWithModels,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  getCachedTranslationBundle,
  getFreshTranslationBundle,
  getTranslationBundle,
} from "@/lib/i18n/dictionary";
import {
  getDefaultIconPromptActions,
  loadIconPromptActions,
} from "@/lib/icon-prompts";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { getAndroidProductIdForPlan } from "@/lib/payments/google-play-products";
import {
  loadFeatureAccessSettingsByKeys,
  USER_VISIBLE_FEATURE_ACCESS_SETTING_KEYS,
} from "@/lib/settings/feature-access-settings";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import {
  parseTranslateAccessModeSetting,
  parseTranslateProviderModeSetting,
} from "@/lib/translate/config";
import { parseDocumentUploadsAccessModeSetting } from "@/lib/uploads/document-uploads";
import {
  parseVoiceChatAccessModeSetting,
  resolvePlatformVoiceChatSetting,
} from "@/lib/voice/config";

const READ_TIMEOUT_MS = 5000;

const serializeDate = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : value ?? null;

function parseBooleanSetting(value: unknown) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return false;
}

async function safeAppSetting<T>(key: string, fallback: T) {
  try {
    const value = await getAppSetting<T>(key);
    return value ?? fallback;
  } catch (error) {
    console.error(`[read-models] Failed to load setting "${key}".`, error);
    return getLastKnownAppSetting<T>(key) ?? fallback;
  }
}

export async function loadFeatureAccessReadModel({
  role,
  userId,
}: {
  role: UserRole | null | undefined;
  userId?: string | null;
}) {
  const [
    featureAccessSettings,
    customKnowledgeSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadFeatureAccessSettingsByKeys(USER_VISIBLE_FEATURE_ACCESS_SETTING_KEYS, {
      source: "api.read-models.feature-access",
      timeoutMs: READ_TIMEOUT_MS + 3000,
    }),
    safeAppSetting<string | boolean | null>(
      CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
      null
    ),
    userId
      ? getImageGenerationAccess({
          userId,
          userRole: role ?? "regular",
        }).catch(async (error) => {
          console.error(
            "[read-models] Image generation credit access failed; falling back to feature availability.",
            error
          );
          return getImageGenerationAvailability({
            userRole: role ?? "regular",
          })
            .then(buildImageGenerationAccessFromAvailability)
            .catch((fallbackError) => {
              console.error(
                "[read-models] Image generation availability fallback failed.",
                fallbackError
              );
              return null;
            });
        })
      : Promise.resolve(null),
  ]);
  const featureAccessUnavailable =
    featureAccessSettings.status === "unavailable";
  const getFeatureSetting = (key: string): string | boolean | null => {
    const value = featureAccessSettings.values.get(key);
    return typeof value === "string" || typeof value === "boolean"
      ? value
      : featureAccessUnavailable
        ? "enabled"
        : null;
  };
  const calculatorSetting = getFeatureSetting(CALCULATOR_FEATURE_FLAG_KEY);
  const documentUploadsSetting = getFeatureSetting(
    DOCUMENT_UPLOADS_FEATURE_FLAG_KEY
  );
  const jobsSetting = getFeatureSetting(JOBS_FEATURE_FLAG_KEY);
  const studySetting = getFeatureSetting(STUDY_MODE_FEATURE_FLAG_KEY);
  const translateSetting = getFeatureSetting(TRANSLATE_FEATURE_FLAG_KEY);
  const voiceChatSettings = resolvePlatformVoiceChatSetting({
    androidValue: getFeatureSetting(VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY),
    legacyValue: getFeatureSetting(VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY),
    webValue: getFeatureSetting(VOICE_CHAT_WEB_FEATURE_FLAG_KEY),
  });

  return {
    calculator: isFeatureEnabledForRole(
      parseCalculatorAccessModeSetting(calculatorSetting),
      role
    ),
    customKnowledge: parseBooleanSetting(customKnowledgeSetting),
    documentUploads: isFeatureEnabledForRole(
      parseDocumentUploadsAccessModeSetting(documentUploadsSetting),
      role
    ),
    forum: true,
    jobs: isFeatureEnabledForRole(parseJobsAccessModeSetting(jobsSetting), role),
    study: isFeatureEnabledForRole(
      parseStudyModeAccessModeSetting(studySetting),
      role
    ),
    translate: isFeatureEnabledForRole(
      parseTranslateAccessModeSetting(translateSetting),
      role
    ),
    voiceChat: isFeatureEnabledForRole(
      parseVoiceChatAccessModeSetting(voiceChatSettings.android),
      role
    ),
    voiceChatAndroid: isFeatureEnabledForRole(
      parseVoiceChatAccessModeSetting(voiceChatSettings.android),
      role
    ),
    voiceChatWeb: isFeatureEnabledForRole(
      parseVoiceChatAccessModeSetting(voiceChatSettings.web),
      role
    ),
    imageGeneration: imageGenerationAccess
      ? {
          enabled: imageGenerationAccess.enabled,
          canGenerate: imageGenerationAccess.canGenerate,
          requiresPaidCredits:
            imageGenerationAccess.requiresPaidCredits ?? false,
        }
      : featureAccessUnavailable
        ? {
            enabled: true,
            canGenerate: true,
            requiresPaidCredits: false,
          }
      : {
          enabled: false,
          canGenerate: false,
          requiresPaidCredits: false,
        },
  };
}

async function buildLanguageReadModelFromBundle(
  translationBundle: Awaited<ReturnType<typeof getTranslationBundle>>
) {
  const languagesWithSettings = await listLanguagesWithSettings().catch((error) => {
    console.error("[read-models] Failed to load chat languages.", error);
    return [];
  });
  const activeChatLanguages = languagesWithSettings
    .filter((language) => language.isActive)
    .map((language) => ({
      id: language.id,
      code: language.code,
      name: language.name,
      isDefault: language.isDefault,
      isActive: language.isActive,
      syncUiLanguage: language.syncUiLanguage,
    }));

  const chatLanguages =
    activeChatLanguages.length > 0
      ? activeChatLanguages
      : translationBundle.languages
          .filter((language) => language.isActive)
          .map((language) => ({
            id: language.id,
            code: language.code,
            name: language.name,
            isDefault: language.isDefault,
            isActive: language.isActive,
            syncUiLanguage: language.syncUiLanguage,
          }));

  return {
    i18n: {
      activeLanguage: translationBundle.activeLanguage,
      languages: translationBundle.languages,
      dictionary: translationBundle.dictionary,
      dictionaryLanguageCode: translationBundle.activeLanguage.code,
    },
    chatLanguages,
  };
}

export async function loadLanguageReadModel(
  preferredLanguage?: string | null,
  options: { requireFresh?: boolean; timeoutMs?: number } = {}
) {
  const translationBundle = options.requireFresh
    ? await getFreshTranslationBundle(preferredLanguage, options.timeoutMs)
    : await getTranslationBundle(preferredLanguage);

  return buildLanguageReadModelFromBundle(translationBundle);
}

export async function loadCachedLanguageReadModel(
  preferredLanguage?: string | null
) {
  const translationBundle = await getCachedTranslationBundle(preferredLanguage);
  if (!translationBundle) {
    throw new Error("No cached translation bundle is available.");
  }

  return buildLanguageReadModelFromBundle(translationBundle);
}

export async function loadModelConfigReadModel() {
  const modelConfig = await loadChatModels();

  return {
    defaultModelId: modelConfig.defaultModel?.id ?? null,
    models: modelConfig.models.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      supportsReasoning: model.supportsReasoning,
    })),
  };
}

export async function loadPromptReadModel({
  preferredLanguage,
  role,
}: {
  preferredLanguage?: string | null;
  role: UserRole;
}) {
  const [suggestedPrompts, iconPromptActions] = await Promise.all([
    loadSuggestedPrompts(preferredLanguage, role).catch((error) => {
      console.error("[read-models] Failed to load suggested prompts.", error);
      return [];
    }),
    loadIconPromptActions(preferredLanguage, role).catch((error) => {
      console.error("[read-models] Failed to load icon prompts.", error);
      return getDefaultIconPromptActions(
        preferredLanguage?.trim().toLowerCase() ?? "en"
      );
    }),
  ]);

  return {
    iconPromptActions,
    suggestedPrompts,
  };
}

export async function loadTranslateReadModel({
  includeLanguages = true,
}: {
  includeLanguages?: boolean;
} = {}) {
  const [providerModeSetting, translateLanguages] = await Promise.all([
    safeAppSetting<string | boolean | number | null>(
      TRANSLATE_PROVIDER_MODE_SETTING_KEY,
      null
    ),
    includeLanguages
      ? listTranslationFeatureLanguagesWithModels().catch((error) => {
          console.error("[read-models] Failed to load translate languages.", error);
          return [];
        })
      : Promise.resolve([]),
  ]);

  return {
    providerMode: parseTranslateProviderModeSetting(providerModeSetting),
    languages: translateLanguages
      .filter((language) => language.isActive)
      .map((language) => ({
        code: language.code,
        isDefault: language.isDefault,
        modelDisplayName: language.modelDisplayName ?? null,
        modelProvider: language.modelProvider ?? null,
        modelProviderModelId: language.modelProviderModelId ?? null,
        name: language.name,
      })),
  };
}

export async function loadPricingReadModel() {
  const [pricingPlans, recommendedPlanId, imageGenerationEnabledForAll] =
    await Promise.all([
      listPricingPlans({ includeInactive: false }),
      safeAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY, null),
      isImageGenerationEnabledForAllUsers().catch(() => false),
    ]);

  const sortedPricingPlans = sortPricingPlansForDisplay(pricingPlans);

  return {
    imageGenerationEnabledForAll,
    recommendedPlanId,
    plans: sortedPricingPlans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceInPaise: plan.priceInPaise,
      androidProductId:
        plan.priceInPaise > 0 ? getAndroidProductIdForPlan(plan) : null,
      tokenAllowance: plan.tokenAllowance,
      billingCycleDays: plan.billingCycleDays,
      isActive: plan.isActive,
    })),
  };
}

export async function loadBillingReadModel(userId: string) {
  const balance = await getUserBalanceSummary(userId);

  return {
    tokensRemaining: balance.tokensRemaining,
    tokensTotal: balance.tokensTotal,
    creditsRemaining: balance.creditsRemaining,
    creditsTotal: balance.creditsTotal,
    allocatedCredits: balance.allocatedCredits,
    rechargedCredits: balance.rechargedCredits,
    expiresAt: serializeDate(balance.expiresAt),
    startedAt: serializeDate(balance.startedAt),
    plan: balance.plan
      ? {
          id: balance.plan.id,
          name: balance.plan.name,
          priceInPaise: balance.plan.priceInPaise,
          billingCycleDays: balance.plan.billingCycleDays,
        }
      : null,
  };
}
