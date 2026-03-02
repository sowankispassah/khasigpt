import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ChatLoader } from "@/components/chat-loader";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { getImageGenerationAccess } from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getAppSetting, listLanguagesWithSettings } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { getJobPostingById, toJobCard } from "@/lib/jobs/service";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import {
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { generateUUID } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string; jobId?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const session = await auth();
  if (!session) {
    redirect("/login?callbackUrl=/");
  }

  const CHAT_HOME_QUERY_TIMEOUT_MS = 8_000;
  const IMAGE_ACCESS_TIMEOUT_MS = 6_000;
  const safeQuery = <T,>(label: string, promise: Promise<T>, fallback: T) =>
    withTimeout(promise, CHAT_HOME_QUERY_TIMEOUT_MS).catch((error) => {
      console.error(`[chat/home] ${label} query timed out or failed.`, error);
      return fallback;
    });

  const [
    modelsResult,
    suggestedPrompts,
    iconPromptActions,
    languageSettings,
    customKnowledgeSetting,
    documentUploadsSetting,
    studyModeSetting,
    jobsModeSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    safeQuery(
      "suggested prompts",
      loadSuggestedPrompts(preferredLanguage, session.user.role),
      []
    ),
    safeQuery(
      "icon prompt actions",
      loadIconPromptActions(preferredLanguage, session.user.role),
      []
    ),
    safeQuery("languages", listLanguagesWithSettings(), []),
    safeQuery(
      "custom knowledge flag",
      getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
      null
    ),
    safeQuery(
      "document uploads flag",
      getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
      null
    ),
    safeQuery(
      "study mode flag",
      getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
      null
    ),
    safeQuery(
      "jobs mode flag",
      getAppSetting<string | boolean>(JOBS_FEATURE_FLAG_KEY),
      null
    ),
    withTimeout(
      getImageGenerationAccess({
        userId: session.user.id,
        userRole: session.user.role,
      }),
      IMAGE_ACCESS_TIMEOUT_MS
    ).catch((error) => {
      console.error(
        `[chat/home] image generation access timed out after ${IMAGE_ACCESS_TIMEOUT_MS}ms.`,
        error
      );
      return {
        enabled: false,
        canGenerate: false,
        hasCredits: false,
        hasPaidPlan: false,
        hasPaidCredits: false,
        hasManualCredits: false,
        requiresPaidCredits: false,
        isAdmin: session.user.role === "admin",
        tokensPerImage: 1,
        model: null,
      };
    }),
  ]);

  const { defaultModel, models } = modelsResult;

  const id = generateUUID();

  const modelIdFromCookie = cookieStore.get("chat-model");
  const cookieModelValue =
    typeof modelIdFromCookie?.value === "string" ? modelIdFromCookie.value : "";
  const resolvedCookieModelId =
    cookieModelValue &&
    (models.some((model) => model.id === cookieModelValue)
      ? cookieModelValue
      : models.find((model) => model.key === cookieModelValue)?.id ??
        models.find((model) => model.providerModelId === cookieModelValue)?.id ??
        "");
  const fallbackModelId =
    resolvedCookieModelId || defaultModel?.id || models[0]?.id || "";
  const chatLanguageFromCookie = cookieStore.get("chat-language");
  const initialChatLanguage =
    typeof chatLanguageFromCookie?.value === "string"
      ? chatLanguageFromCookie.value
      : preferredLanguage ?? "";

  const customKnowledgeEnabled =
    typeof customKnowledgeSetting === "boolean"
      ? customKnowledgeSetting
      : typeof customKnowledgeSetting === "string"
        ? customKnowledgeSetting.toLowerCase() === "true"
        : false;
  const documentUploadsMode = parseDocumentUploadsAccessModeSetting(
    documentUploadsSetting
  );
  const documentUploadsEnabled = isFeatureEnabledForRole(
    documentUploadsMode,
    session.user.role
  );
  const studyModeMode = parseStudyModeAccessModeSetting(studyModeSetting);
  const studyModeEnabled = isFeatureEnabledForRole(
    studyModeMode,
    session.user.role
  );
  const jobsMode = parseJobsAccessModeSetting(jobsModeSetting);
  const jobsModeEnabled = isFeatureEnabledForRole(jobsMode, session.user.role);
  const requestedMode =
    typeof resolvedSearchParams?.mode === "string"
      ? resolvedSearchParams.mode
      : null;
  const requestedJobId =
    typeof resolvedSearchParams?.jobId === "string" &&
    resolvedSearchParams.jobId.trim().length > 0
      ? resolvedSearchParams.jobId.trim()
      : null;
  const isStudyMode = requestedMode === "study";
  const isJobsMode = requestedMode === "jobs";

  if (isStudyMode && !studyModeEnabled) {
    redirect("/chat");
  }
  if (isJobsMode && !jobsModeEnabled) {
    notFound();
  }
  const chatMode = isStudyMode ? "study" : isJobsMode ? "jobs" : "default";
  const initialJobEntry =
    chatMode === "jobs" && requestedJobId
      ? await withTimeout(
          getJobPostingById({
            id: requestedJobId,
            includeInactive: false,
          }),
          CHAT_HOME_QUERY_TIMEOUT_MS
        ).catch((error) => {
          console.error("[chat/home] job lookup timed out or failed.", error);
          return null;
        })
      : null;
  const initialJobContext = initialJobEntry ? toJobCard(initialJobEntry) : null;
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

  return (
    <ModelConfigProvider
      defaultModelId={defaultModel?.id ?? null}
      models={models.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        supportsReasoning: model.supportsReasoning,
      }))}
    >
      <ChatLoader
        autoResume={false}
        customKnowledgeEnabled={customKnowledgeEnabled}
        chatMode={chatMode}
        id={id}
        imageGeneration={{
          enabled: imageGenerationAccess.enabled,
          canGenerate: imageGenerationAccess.canGenerate,
          requiresPaidCredits: imageGenerationAccess.requiresPaidCredits ?? false,
        }}
        documentUploadsEnabled={documentUploadsEnabled}
        initialChatLanguage={initialChatLanguage}
        initialChatModel={fallbackModelId}
        initialJobContext={initialJobContext}
        initialMessages={[]}
        initialHasMoreHistory={false}
        initialOldestMessageAt={null}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
        languageSettings={activeLanguageSettings}
        suggestedPrompts={chatMode === "default" ? suggestedPrompts : []}
        iconPromptActions={chatMode === "default" ? iconPromptActions : []}
      />
    </ModelConfigProvider>
  );
}
