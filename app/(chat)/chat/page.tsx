import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ChatPageClient } from "@/components/chat-page-client";
import {
  buildImageGenerationAccessFromAvailability,
  getImageGenerationAvailability,
} from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import type { CachedChatPagePayload } from "@/lib/chat/page-payload";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { getActiveLanguages } from "@/lib/i18n/languages";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { getJobPostingById, toJobCard } from "@/lib/jobs/service";
import type { JobListItem } from "@/lib/jobs/types";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import {
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import {
  parseVoiceChatAccessModeSetting,
  resolvePlatformVoiceChatSetting,
} from "@/lib/voice/config";

const CHAT_HOME_OPTIONAL_QUERY_TIMEOUT_MS = 2500;
const CHAT_HOME_FEATURE_ACCESS_TIMEOUT_MS = 2000;
const CHAT_HOME_IMAGE_AVAILABILITY_TIMEOUT_MS = 2000;
const CHAT_HOME_FEATURE_ACCESS_KEYS = [
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
] as const;

function buildUnavailableImageGenerationAccess(userRole: string | null) {
  return {
    enabled: false,
    canGenerate: false,
    hasCredits: false,
    hasPaidPlan: false,
    hasPaidCredits: false,
    hasManualCredits: false,
    requiresPaidCredits: false,
    isAdmin: userRole === "admin",
    tokensPerImage: 1,
    model: null,
  };
}

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{
    embedded?: string;
    jobId?: string;
    mode?: string;
    pendingChatId?: string;
  }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const session = await auth();
  if (!session) {
    redirect("/login?callbackUrl=/chat");
  }

  const requestedMode =
    typeof resolvedSearchParams?.mode === "string"
      ? resolvedSearchParams.mode
      : null;
  const isStudyMode = requestedMode === "study";
  const isJobsMode = requestedMode === "jobs";

  const safeQuery = <T,>(label: string, promise: Promise<T>, fallback: T) =>
    withTimeout(promise, CHAT_HOME_OPTIONAL_QUERY_TIMEOUT_MS, () => {
      console.error(`[chat/home] ${label} query timed out.`, {
        timeoutMs: CHAT_HOME_OPTIONAL_QUERY_TIMEOUT_MS,
      });
    }).catch((error) => {
      console.error(`[chat/home] ${label} query failed.`, error);
      return fallback;
    });

  const [
    modelsResult,
    languageSettings,
    featureAccessSettings,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    safeQuery("languages", getActiveLanguages(), []),
    loadFeatureAccessSettingsByKeys(CHAT_HOME_FEATURE_ACCESS_KEYS, {
      source: "chat.home.feature-access",
      timeoutMs: CHAT_HOME_FEATURE_ACCESS_TIMEOUT_MS,
    }),
    withTimeout(
      getImageGenerationAvailability({
        userRole: session.user.role,
      }).then(buildImageGenerationAccessFromAvailability),
      CHAT_HOME_IMAGE_AVAILABILITY_TIMEOUT_MS,
      () => {
        console.error("[chat/home] image generation availability timed out.", {
          timeoutMs: CHAT_HOME_IMAGE_AVAILABILITY_TIMEOUT_MS,
        });
      }
    ).catch(async (error) => {
      console.error("[chat/home] image generation availability failed.", error);
      return buildUnavailableImageGenerationAccess(session.user.role);
    }),
  ]);

  const { defaultModel, models } = modelsResult;

  const pendingChatId =
    typeof resolvedSearchParams?.pendingChatId === "string" &&
    resolvedSearchParams.pendingChatId.trim().length > 0
      ? resolvedSearchParams.pendingChatId.trim()
      : null;
  const id = pendingChatId ?? generateUUID();

  const fallbackModelId = defaultModel?.id || models[0]?.id || "";
  const chatLanguageFromCookie = cookieStore.get("chat-language");
  const initialChatLanguage =
    typeof chatLanguageFromCookie?.value === "string"
      ? chatLanguageFromCookie.value
      : preferredLanguage ?? "";
  const featureAccessUnavailable = featureAccessSettings.status === "unavailable";
  const getFeatureSetting = (key: string): string | boolean | null => {
    const value = getFeatureAccessModeSettingValue(featureAccessSettings, key);
    if (typeof value === "string" || typeof value === "boolean") {
      return value;
    }
    return featureAccessUnavailable ? "enabled" : null;
  };

  const customKnowledgeSetting = getFeatureSetting(
    CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY
  );
  const customKnowledgeEnabled =
    typeof customKnowledgeSetting === "boolean"
      ? customKnowledgeSetting
      : typeof customKnowledgeSetting === "string"
        ? customKnowledgeSetting.toLowerCase() === "true"
        : false;
  const documentUploadsSetting = getFeatureSetting(
    DOCUMENT_UPLOADS_FEATURE_FLAG_KEY
  );
  const documentUploadsMode = parseDocumentUploadsAccessModeSetting(
    documentUploadsSetting
  );
  const documentUploadsEnabled = isFeatureEnabledForRole(
    documentUploadsMode,
    session.user.role
  );
  const studyModeSetting = getFeatureSetting(STUDY_MODE_FEATURE_FLAG_KEY);
  const studyModeMode = parseStudyModeAccessModeSetting(studyModeSetting);
  const studyModeEnabled = isFeatureEnabledForRole(
    studyModeMode,
    session.user.role
  );
  const jobsModeSetting = getFeatureSetting(JOBS_FEATURE_FLAG_KEY);
  const jobsMode = parseJobsAccessModeSetting(jobsModeSetting);
  const jobsModeEnabled = isFeatureEnabledForRole(jobsMode, session.user.role);
  const voiceChatSettings = resolvePlatformVoiceChatSetting({
    legacyValue: getFeatureSetting(VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY),
    webValue: getFeatureSetting(VOICE_CHAT_WEB_FEATURE_FLAG_KEY),
  });
  const voiceChatEnabled = isFeatureEnabledForRole(
    parseVoiceChatAccessModeSetting(voiceChatSettings.web),
    session.user.role
  );
  const requestedJobId =
    typeof resolvedSearchParams?.jobId === "string" &&
    resolvedSearchParams.jobId.trim().length > 0
      ? resolvedSearchParams.jobId.trim()
      : null;

  if (isStudyMode && !studyModeEnabled) {
    redirect("/chat");
  }
  if (isJobsMode && !jobsModeEnabled) {
    notFound();
  }
  const chatMode = isStudyMode ? "study" : isJobsMode ? "jobs" : "default";
  const initialJobEntry =
    chatMode === "jobs" && requestedJobId
      ? await getJobPostingById({
          id: requestedJobId,
          includeInactive: false,
          includeRagState: false,
        }).catch((error) => {
          console.error("[chat/home] job lookup failed.", error);
          return null;
        })
      : null;
  const initialJobContext = initialJobEntry ? toJobCard(initialJobEntry) : null;
  const jobsListItems: JobListItem[] = [];
  const activeLanguageSettings = languageSettings
    .filter((language) => language.isActive)
    .map((language) => ({
      id: language.id,
      code: language.code,
      name: language.name,
      isDefault: language.isDefault,
      isActive: language.isActive,
      syncUiLanguage: language.syncUiLanguage,
    }));

  const payload: CachedChatPagePayload = {
    chatId: id,
    modelConfig: {
      defaultModelId: defaultModel?.id ?? null,
      models: models.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        supportsReasoning: model.supportsReasoning,
      })),
    },
    chatLoader: {
      autoResume: false,
      customKnowledgeEnabled,
      chatMode,
      id,
      imageGeneration: {
        enabled: imageGenerationAccess.enabled,
        canGenerate: imageGenerationAccess.canGenerate,
        requiresPaidCredits: imageGenerationAccess.requiresPaidCredits ?? false,
      },
      documentUploadsEnabled,
      voiceChatEnabled,
      initialChatLanguage,
      initialChatModel: fallbackModelId,
      initialJobContext: initialJobContext ?? null,
      jobsListItems,
      initialMessages: [],
      initialMessagesDegraded: false,
      initialHasMoreHistory: false,
      initialOldestMessageAt: null,
      initialVisibilityType: "private",
      isReadonly: false,
      languageSettings: activeLanguageSettings,
      suggestedPrompts: [],
      iconPromptActions: [],
    },
  };

  return <ChatPageClient payload={payload} />;
}
