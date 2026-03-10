import { cookies } from "next/headers";
import { unstable_cache } from "next/cache";
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
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { readChatUiContext } from "@/lib/chat/ui-context";
import {
  getAppSetting,
  getChatById,
  getMessagesByChatIdPage,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { getActiveLanguages } from "@/lib/i18n/languages";
import { loadIconPromptActions } from "@/lib/icon-prompts";
import { toJobListItems } from "@/lib/jobs/list-items";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { getJobPostingById, listJobPostings, toJobCard } from "@/lib/jobs/service";
import { getSiteUrl } from "@/lib/seo/site";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";
import {
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { withTimeout } from "@/lib/utils/async";
import { convertToUIMessages } from "@/lib/utils";

const chatPageTimeoutRaw = Number.parseInt(
  process.env.CHAT_PAGE_LOAD_TIMEOUT_MS ?? "",
  10
);
const CHAT_PAGE_LOAD_TIMEOUT_MS =
  Number.isFinite(chatPageTimeoutRaw) && chatPageTimeoutRaw > 0
    ? chatPageTimeoutRaw
    : 15000;
const IMAGE_ACCESS_TIMEOUT_MS = 6_000;

const chatPageInitialLimitRaw = Number.parseInt(
  process.env.CHAT_PAGE_INITIAL_MESSAGE_LIMIT ?? "",
  10
);
const CHAT_PAGE_INITIAL_MESSAGE_LIMIT =
  Number.isFinite(chatPageInitialLimitRaw) && chatPageInitialLimitRaw > 0
    ? Math.max(10, Math.min(chatPageInitialLimitRaw, CHAT_HISTORY_PAGE_SIZE))
    : CHAT_HISTORY_PAGE_SIZE;
const CHAT_PAGE_CHAT_CACHE_REVALIDATE_SECONDS = 15;
const CHAT_PAGE_MESSAGE_CACHE_REVALIDATE_SECONDS = 10;

const getChatByIdCached = unstable_cache(
  async (chatId: string) => getChatById({ id: chatId, includeDeleted: true }),
  ["chat-page:get-chat-by-id"],
  { revalidate: CHAT_PAGE_CHAT_CACHE_REVALIDATE_SECONDS }
);

const getInitialMessagesByChatIdCached = unstable_cache(
  async ({ chatId, limit }: { chatId: string; limit: number }) =>
    getMessagesByChatIdPage({
      id: chatId,
      limit,
    }),
  ["chat-page:get-messages-by-chat-id"],
  { revalidate: CHAT_PAGE_MESSAGE_CACHE_REVALIDATE_SECONDS }
);

function isTimeoutError(error: unknown) {
  return error instanceof Error && error.message === "timeout";
}

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const session = await auth();

  // Avoid hitting the database at all for logged-out users.
  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
  }

  const chat = await withTimeout(
    getChatByIdCached(id),
    CHAT_PAGE_LOAD_TIMEOUT_MS,
    () => {
      console.warn(`[chat] getChatById timed out after ${CHAT_PAGE_LOAD_TIMEOUT_MS}ms`);
    }
  ).catch((error) => {
    if (isTimeoutError(error)) {
      return null;
    }
    throw error;
  });

  if (!chat) {
    redirect("/chat");
  }
  const [
    modelsResult,
    translationBundle,
    languageSettings,
    customKnowledgeSetting,
    documentUploadsSetting,
    studyModeSetting,
    jobsModeSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    getTranslationBundle(preferredLanguage),
    // Cached via `unstable_cache` and avoids a per-request DB query.
    getActiveLanguages(),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
    getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
    getAppSetting<string | boolean>(JOBS_FEATURE_FLAG_KEY),
    withTimeout(
      getImageGenerationAccess({
        userId: session?.user?.id ?? null,
        userRole: session?.user?.role ?? null,
      }),
      IMAGE_ACCESS_TIMEOUT_MS
    ).catch((error) => {
      if (!isTimeoutError(error)) {
        console.error("[chat] image generation access failed.", error);
      }
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
  const jobsMode = parseJobsAccessModeSetting(jobsModeSetting);
  const jobsModeEnabled = isFeatureEnabledForRole(jobsMode, userRole);
  const [suggestedPrompts, iconPromptActions] = await Promise.all([
    loadSuggestedPrompts(preferredLanguage, userRole),
    loadIconPromptActions(preferredLanguage, userRole),
  ]);
  const activeLanguageSettings = languageSettings.map((language) => ({
    id: language.id,
    code: language.code,
    name: language.name,
    isDefault: language.isDefault,
    isActive: language.isActive,
    syncUiLanguage: language.syncUiLanguage,
  }));
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
  const persistedUiContext = readChatUiContext(chat.lastContext);
  if (chatMode === "study" && !studyModeEnabled) {
    return <StudyModeDisabledNotice />;
  }
  if (chatMode === "jobs" && !jobsModeEnabled) {
    return notFound();
  }
  const initialJobEntry =
    chatMode === "jobs" && persistedUiContext.jobPostingId
      ? await withTimeout(
          getJobPostingById({
            id: persistedUiContext.jobPostingId,
            includeInactive: false,
          }),
          CHAT_PAGE_LOAD_TIMEOUT_MS,
          () => {
            console.warn(
              `[chat] getJobPostingById timed out after ${CHAT_PAGE_LOAD_TIMEOUT_MS}ms`
            );
          }
        ).catch((error) => {
          if (!isTimeoutError(error)) {
            console.error("[chat] Failed to load persisted jobs context", error);
          }
          return null;
        })
      : null;
  const initialJobContext = initialJobEntry ? toJobCard(initialJobEntry) : null;
  const jobsListItems =
    chatMode === "jobs"
      ? await withTimeout(
          listJobPostings({ includeInactive: false }),
          CHAT_PAGE_LOAD_TIMEOUT_MS,
          () => {
            console.warn(
              `[chat] listJobPostings timed out after ${CHAT_PAGE_LOAD_TIMEOUT_MS}ms`
            );
          }
        )
          .then((jobs) => toJobListItems(jobs))
          .catch((error) => {
            if (!isTimeoutError(error)) {
              console.error("[chat] Failed to load jobs list for jobs mode", error);
            }
            return [];
          })
      : [];

  const { messages: messagesFromDb, hasMore: hasMoreMessages } =
    await withTimeout(
      getInitialMessagesByChatIdCached({
        chatId: id,
        limit: CHAT_PAGE_INITIAL_MESSAGE_LIMIT,
      }),
      CHAT_PAGE_LOAD_TIMEOUT_MS,
      () => {
        console.warn(
          `[chat] getMessagesByChatIdPage timed out after ${CHAT_PAGE_LOAD_TIMEOUT_MS}ms (limit=${CHAT_PAGE_INITIAL_MESSAGE_LIMIT})`
        );
      }
    ).catch((error) => {
      if (isTimeoutError(error)) {
        return { messages: [], hasMore: false };
      }
      throw error;
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
        jobsListItems={jobsListItems}
        initialJobContext={initialJobContext}
        initialMessages={uiMessages}
        initialHasMoreHistory={hasMoreMessages}
        initialOldestMessageAt={oldestMessageAt}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        languageSettings={activeLanguageSettings}
        suggestedPrompts={chatMode === "default" ? suggestedPrompts : []}
        iconPromptActions={chatMode === "default" ? iconPromptActions : []}
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
