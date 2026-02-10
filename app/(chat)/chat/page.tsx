import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { getImageGenerationAccess } from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getAppSetting, listLanguagesWithSettings } from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import {
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { generateUUID } from "@/lib/utils";

export default async function Page({
  searchParams,
}: {
  searchParams?: Promise<{ mode?: string }>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const session = await auth();
  if (!session) {
    redirect("/login?callbackUrl=/");
  }

  const [
    modelsResult,
    suggestedPrompts,
    iconPromptActions,
    languageSettings,
    customKnowledgeSetting,
    documentUploadsSetting,
    studyModeSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    loadSuggestedPrompts(preferredLanguage, session.user.role),
    loadIconPromptActions(preferredLanguage, session.user.role),
    listLanguagesWithSettings(),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
    getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
    getImageGenerationAccess({
      userId: session.user.id,
      userRole: session.user.role,
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
  const requestedMode =
    typeof resolvedSearchParams?.mode === "string"
      ? resolvedSearchParams.mode
      : null;
  const isStudyMode = requestedMode === "study";

  if (isStudyMode && !studyModeEnabled) {
    redirect("/chat");
  }
  const chatMode = isStudyMode ? "study" : "default";
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

  if (!modelIdFromCookie) {
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
        <DataStreamProvider>
          <ChatLoader
            autoResume={false}
            customKnowledgeEnabled={customKnowledgeEnabled}
            chatMode={chatMode}
            id={id}
            imageGeneration={{
              enabled: imageGenerationAccess.enabled,
              canGenerate: imageGenerationAccess.canGenerate,
              requiresPaidCredits:
                imageGenerationAccess.requiresPaidCredits ?? false,
            }}
            documentUploadsEnabled={documentUploadsEnabled}
            initialChatLanguage={initialChatLanguage}
            initialChatModel={fallbackModelId}
            initialMessages={[]}
            initialHasMoreHistory={false}
            initialOldestMessageAt={null}
            initialVisibilityType="private"
            isReadonly={false}
            key={id}
            languageSettings={activeLanguageSettings}
            suggestedPrompts={chatMode === "study" ? [] : suggestedPrompts}
            iconPromptActions={chatMode === "study" ? [] : iconPromptActions}
          />
          <DataStreamHandler />
        </DataStreamProvider>
      </ModelConfigProvider>
    );
  }

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
      <DataStreamProvider>
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
          initialMessages={[]}
          initialHasMoreHistory={false}
          initialOldestMessageAt={null}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
          languageSettings={activeLanguageSettings}
          suggestedPrompts={chatMode === "study" ? [] : suggestedPrompts}
          iconPromptActions={chatMode === "study" ? [] : iconPromptActions}
        />
        <DataStreamHandler />
      </DataStreamProvider>
    </ModelConfigProvider>
  );
}
