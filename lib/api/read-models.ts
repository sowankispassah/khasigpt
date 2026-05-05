import "server-only";

import {
  getImageGenerationAccess,
  isImageGenerationEnabledForAllUsers,
} from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import { parseCalculatorAccessModeSetting } from "@/lib/calculator/config";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  FORUM_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  RECOMMENDED_PRICING_PLAN_SETTING_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
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
import { parseForumAccessModeSetting } from "@/lib/forum/config";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { getAndroidProductIdForPlan } from "@/lib/payments/google-play-products";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import {
  parseTranslateAccessModeSetting,
  parseTranslateProviderModeSetting,
} from "@/lib/translate/config";
import { parseDocumentUploadsAccessModeSetting } from "@/lib/uploads/document-uploads";
import { withTimeout } from "@/lib/utils/async";

const READ_TIMEOUT_MS = 5000;
const DEFERRED_READ_TIMEOUT_MS = 10_000;

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
    const value = await withTimeout(getAppSetting<T>(key), READ_TIMEOUT_MS);
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
    calculatorSetting,
    customKnowledgeSetting,
    documentUploadsSetting,
    forumSetting,
    jobsSetting,
    studySetting,
    translateSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    safeAppSetting<string | boolean | null>(CALCULATOR_FEATURE_FLAG_KEY, null),
    safeAppSetting<string | boolean | null>(
      CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
      null
    ),
    safeAppSetting<string | boolean | null>(
      DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
      null
    ),
    safeAppSetting<string | boolean | null>(FORUM_FEATURE_FLAG_KEY, null),
    safeAppSetting<string | boolean | null>(JOBS_FEATURE_FLAG_KEY, null),
    safeAppSetting<string | boolean | null>(STUDY_MODE_FEATURE_FLAG_KEY, null),
    safeAppSetting<string | boolean | null>(TRANSLATE_FEATURE_FLAG_KEY, null),
    userId
      ? getImageGenerationAccess({ userId, userRole: role ?? "regular" }).catch(
          () => null
        )
      : Promise.resolve(null),
  ]);

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
    forum: isFeatureEnabledForRole(parseForumAccessModeSetting(forumSetting), role),
    jobs: isFeatureEnabledForRole(parseJobsAccessModeSetting(jobsSetting), role),
    study: isFeatureEnabledForRole(
      parseStudyModeAccessModeSetting(studySetting),
      role
    ),
    translate: isFeatureEnabledForRole(
      parseTranslateAccessModeSetting(translateSetting),
      role
    ),
    imageGeneration: imageGenerationAccess
      ? {
          enabled: imageGenerationAccess.enabled,
          canGenerate: imageGenerationAccess.canGenerate,
          requiresPaidCredits:
            imageGenerationAccess.requiresPaidCredits ?? false,
        }
      : {
          enabled: false,
          canGenerate: false,
          requiresPaidCredits: false,
        },
  };
}

export async function loadLanguageReadModel(preferredLanguage?: string | null) {
  const [translationBundle, languagesWithSettings] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    withTimeout(listLanguagesWithSettings(), READ_TIMEOUT_MS).catch((error) => {
      console.error("[read-models] Failed to load chat languages.", error);
      return [];
    }),
  ]);

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
    },
    chatLanguages,
  };
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
    withTimeout(
      loadSuggestedPrompts(preferredLanguage, role),
      DEFERRED_READ_TIMEOUT_MS
    ).catch((error) => {
      console.error("[read-models] Failed to load suggested prompts.", error);
      return [];
    }),
    withTimeout(
      loadIconPromptActions(preferredLanguage, role),
      DEFERRED_READ_TIMEOUT_MS
    ).catch((error) => {
      console.error("[read-models] Failed to load icon prompts.", error);
      return [];
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
      ? withTimeout(
          listTranslationFeatureLanguagesWithModels(),
          DEFERRED_READ_TIMEOUT_MS
        ).catch((error) => {
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
      withTimeout(
        listPricingPlans({ includeInactive: false }),
        DEFERRED_READ_TIMEOUT_MS
      ),
      safeAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY, null),
      isImageGenerationEnabledForAllUsers().catch(() => false),
    ]);

  return {
    imageGenerationEnabledForAll,
    recommendedPlanId,
    plans: pricingPlans.map((plan) => ({
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
  const balance = await withTimeout(
    getUserBalanceSummary(userId),
    DEFERRED_READ_TIMEOUT_MS
  );

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
