import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { getImageGenerationAccess } from "@/lib/ai/image-generation";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MOBILE_BOOTSTRAP_TIMEOUT_MS = 8_000;

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
    return await withTimeout(
      getAppSetting<T>(key),
      MOBILE_BOOTSTRAP_TIMEOUT_MS
    );
  } catch (error) {
    console.error(`[api/mobile/bootstrap] Failed to load ${key}.`, error);
    return getLastKnownAppSetting<T>(key) ?? fallback;
  }
}

export async function GET(request: Request) {
  const session = await auth();
  const cookieStore = await cookies();
  const { searchParams } = new URL(request.url);
  const requestedLanguage = searchParams.get("lang")?.trim().toLowerCase() ?? null;
  const preferredLanguage = requestedLanguage || cookieStore.get("lang")?.value || null;
  const role = session?.user?.role ?? null;

  const [
    translationBundle,
    modelConfig,
    languagesWithSettings,
    suggestedPrompts,
    iconPromptActions,
    calculatorSetting,
    customKnowledgeSetting,
    documentUploadsSetting,
    forumSetting,
    jobsSetting,
    studySetting,
    translateSetting,
    translateProviderModeSetting,
    translateLanguages,
    pricingPlans,
    recommendedPlanId,
    balance,
    imageGenerationAccess,
  ] = await Promise.all([
    getTranslationBundle(preferredLanguage),
    loadChatModels(),
    withTimeout(listLanguagesWithSettings(), MOBILE_BOOTSTRAP_TIMEOUT_MS).catch(
      () => []
    ),
    session?.user
      ? loadSuggestedPrompts(preferredLanguage, session.user.role).catch(
          () => []
        )
      : Promise.resolve([]),
    session?.user
      ? loadIconPromptActions(preferredLanguage, session.user.role).catch(
          () => []
        )
      : Promise.resolve([]),
    safeAppSetting<string | boolean | null>(
      CALCULATOR_FEATURE_FLAG_KEY,
      null
    ),
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
    safeAppSetting<string | boolean | null>(
      STUDY_MODE_FEATURE_FLAG_KEY,
      null
    ),
    safeAppSetting<string | boolean | null>(TRANSLATE_FEATURE_FLAG_KEY, null),
    safeAppSetting<string | boolean | number | null>(
      TRANSLATE_PROVIDER_MODE_SETTING_KEY,
      null
    ),
    withTimeout(
      listTranslationFeatureLanguagesWithModels(),
      MOBILE_BOOTSTRAP_TIMEOUT_MS
    ).catch(() => []),
    session?.user
      ? listPricingPlans({ includeInactive: false }).catch(() => [])
      : Promise.resolve([]),
    safeAppSetting<string | null>(RECOMMENDED_PRICING_PLAN_SETTING_KEY, null),
    session?.user
      ? getUserBalanceSummary(session.user.id).catch(() => null)
      : Promise.resolve(null),
    session?.user
      ? getImageGenerationAccess({
          userId: session.user.id,
          userRole: session.user.role,
        }).catch(() => null)
      : Promise.resolve(null),
  ]);

  const featureAccess = {
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
  };

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

  const response = NextResponse.json(
    {
      session,
      i18n: {
        activeLanguage: translationBundle.activeLanguage,
        languages: translationBundle.languages,
        dictionary: translationBundle.dictionary,
      },
      featureAccess,
      modelConfig: {
        defaultModelId: modelConfig.defaultModel?.id ?? null,
        models: modelConfig.models.map((model) => ({
          id: model.id,
          name: model.name,
          description: model.description,
          supportsReasoning: model.supportsReasoning,
        })),
      },
      chat: {
        languages: activeChatLanguages,
        suggestedPrompts,
        iconPromptActions,
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
      },
      translate: {
        providerMode: parseTranslateProviderModeSetting(
          translateProviderModeSetting
        ),
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
      },
      billing: {
        recommendedPlanId,
        balance: balance
          ? {
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
            }
          : null,
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
      },
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );

  if (requestedLanguage) {
    response.cookies.set("lang", translationBundle.activeLanguage.code, {
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}
