import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { getImageGenerationAccess } from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import {
  CHAT_HISTORY_PAGE_SIZE,
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  getAppSetting,
  getChatById,
  getMessagesByChatIdPage,
} from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { getSiteUrl } from "@/lib/seo/site";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";
import { parseDocumentUploadsEnabledSetting } from "@/lib/uploads/document-uploads";
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
    suggestedPrompts,
    iconPromptActions,
    translationBundle,
    customKnowledgeSetting,
    documentUploadsSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    loadSuggestedPrompts(preferredLanguage),
    loadIconPromptActions(preferredLanguage),
    getTranslationBundle(preferredLanguage),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
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
  const documentUploadsEnabled = parseDocumentUploadsEnabledSetting(
    documentUploadsSetting
  );

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

  const deletedBanner = chat.deletedAt && isAdmin;

  if (!chatModelFromCookie) {
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
          {deletedBanner && <DeletedNotice dictionary={dictionary} />}
          <ChatLoader
            autoResume={true}
            customKnowledgeEnabled={customKnowledgeEnabled}
            id={chat.id}
            imageGeneration={{
              enabled: imageGenerationAccess.enabled,
              canGenerate: imageGenerationAccess.canGenerate,
              requiresPaidCredits:
                imageGenerationAccess.requiresPaidCredits ?? false,
            }}
            documentUploadsEnabled={documentUploadsEnabled}
            initialChatModel={fallbackModelId}
            initialMessages={uiMessages}
            initialHasMoreHistory={hasMoreMessages}
            initialOldestMessageAt={oldestMessageAt}
            initialVisibilityType={chat.visibility}
            isReadonly={session?.user?.id !== chat.userId}
            suggestedPrompts={suggestedPrompts}
            iconPromptActions={iconPromptActions}
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
        {deletedBanner && <DeletedNotice dictionary={dictionary} />}
        <ChatLoader
          autoResume={true}
          customKnowledgeEnabled={customKnowledgeEnabled}
          id={chat.id}
          imageGeneration={{
            enabled: imageGenerationAccess.enabled,
            canGenerate: imageGenerationAccess.canGenerate,
            requiresPaidCredits: imageGenerationAccess.requiresPaidCredits ?? false,
          }}
          documentUploadsEnabled={documentUploadsEnabled}
          initialChatModel={fallbackModelId}
          initialMessages={uiMessages}
          initialHasMoreHistory={hasMoreMessages}
          initialOldestMessageAt={oldestMessageAt}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
          suggestedPrompts={suggestedPrompts}
          iconPromptActions={iconPromptActions}
        />
        <DataStreamHandler />
      </DataStreamProvider>
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
