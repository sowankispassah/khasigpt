import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ChatLoader } from "@/components/chat-loader";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { getImageGenerationAccess } from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import {
  CHAT_HISTORY_PAGE_SIZE,
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  getAppSetting,
  getChatById,
  getMessagesByChatIdPage,
  listLanguagesWithSettings,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { getSiteUrl } from "@/lib/seo/site";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";
import {
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { convertToUIMessages } from "@/lib/utils";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id, includeDeleted: true });

  if (!chat) {
    notFound();
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const session = await auth();
  const [
    modelsResult,
    translationBundle,
    languageSettings,
    customKnowledgeSetting,
    documentUploadsSetting,
    studyModeSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    getTranslationBundle(preferredLanguage),
    listLanguagesWithSettings(),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
    getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
    getImageGenerationAccess({
      userId: session?.user?.id ?? null,
      userRole: session?.user?.role ?? null,
    }),
  ]);
  const { dictionary } = translationBundle;
  const customKnowledgeEnabled =
    typeof customKnowledgeSetting === "boolean"
      ? customKnowledgeSetting
      : typeof customKnowledgeSetting === "string"
        ? customKnowledgeSetting.toLowerCase() === "true"
        : false;
  const userRole = session?.user?.role ?? null;
  const documentUploadsMode = parseDocumentUploadsAccessModeSetting(
    documentUploadsSetting
  );
  const documentUploadsEnabled = isFeatureEnabledForRole(
    documentUploadsMode,
    userRole
  );
  const studyModeMode = parseStudyModeAccessModeSetting(studyModeSetting);
  const studyModeEnabled = isFeatureEnabledForRole(studyModeMode, userRole);
  const [suggestedPrompts, iconPromptActions] = await Promise.all([
    loadSuggestedPrompts(preferredLanguage, userRole),
    loadIconPromptActions(preferredLanguage, userRole),
  ]);
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

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
  }
  const isAdmin = session.user?.role === "admin";

  if (chat.deletedAt && !isAdmin) {
    redirect("/");
  }

  const { defaultModel, models } = modelsResult;

  if (chat.visibility === "private" && !isAdmin) {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const chatMode = chat.mode ?? "default";
  if (chatMode === "study" && !studyModeEnabled) {
    return <StudyModeDisabledNotice />;
  }

  const { messages: messagesFromDb, hasMore: hasMoreMessages } =
    await getMessagesByChatIdPage({
      id,
      limit: CHAT_HISTORY_PAGE_SIZE,
    });

  const uiMessages = rewriteDocumentUrlsForViewer({
    messages: convertToUIMessages(messagesFromDb),
    viewerUserId: session?.user?.id ?? null,
    isAdmin,
    baseUrl: getSiteUrl(),
  });
  const oldestMessageAt =
    messagesFromDb[0]?.createdAt instanceof Date
      ? messagesFromDb[0].createdAt.toISOString()
      : messagesFromDb[0]?.createdAt
        ? new Date(messagesFromDb[0].createdAt as unknown as string)
            .toISOString()
        : null;

  const chatModelFromCookie = cookieStore.get("chat-model");
  const cookieModelValue =
    typeof chatModelFromCookie?.value === "string" ? chatModelFromCookie.value : "";
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

  const deletedBanner = chat.deletedAt && isAdmin;

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
      {deletedBanner && <DeletedNotice dictionary={dictionary} />}
      <ChatLoader
        autoResume={true}
        customKnowledgeEnabled={customKnowledgeEnabled}
        chatMode={chatMode}
        id={chat.id}
        imageGeneration={{
          enabled: imageGenerationAccess.enabled,
          canGenerate: imageGenerationAccess.canGenerate,
          requiresPaidCredits: imageGenerationAccess.requiresPaidCredits ?? false,
        }}
        documentUploadsEnabled={documentUploadsEnabled}
        initialChatLanguage={initialChatLanguage}
        initialChatModel={fallbackModelId}
        initialMessages={uiMessages}
        initialHasMoreHistory={hasMoreMessages}
        initialOldestMessageAt={oldestMessageAt}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        languageSettings={activeLanguageSettings}
        suggestedPrompts={chatMode === "study" ? [] : suggestedPrompts}
        iconPromptActions={chatMode === "study" ? [] : iconPromptActions}
      />
    </ModelConfigProvider>
  );
}

function DeletedNotice({ dictionary }: { dictionary: Record<string, string> }) {
  return (
    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
      {dictionary["chat.deleted_notice"] ??
        "This chat has been deleted. You are viewing it in read-only mode."}
    </div>
  );
}

function StudyModeDisabledNotice() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h2 className="font-semibold text-lg">Study mode is disabled</h2>
        <p className="mt-2 text-muted-foreground text-sm">
          Ask an administrator to enable Study mode to access question papers.
        </p>
        <Link
          className="mt-4 inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm transition hover:bg-muted"
          href="/chat"
        >
          Back to chat
        </Link>
      </div>
    </div>
  );
}
