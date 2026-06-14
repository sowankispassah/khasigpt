import { unstable_cache } from "next/cache";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ChatPageClient } from "@/components/chat-page-client";
import { EditableTranslation } from "@/components/translation-edit-provider";
import {
  buildImageGenerationAccessFromAvailability,
  getImageGenerationAvailability,
} from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import type { CachedChatPagePayload } from "@/lib/chat/page-payload";
import { readChatOriginUiContext } from "@/lib/chat/ui-context";
import {
  CHAT_HISTORY_PAGE_SIZE,
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  getChatById,
  getMessagesByChatIdPage,
} from "@/lib/db/queries";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  getFallbackTranslationBundle,
  getTranslationBundle,
} from "@/lib/i18n/dictionary";
import { getActiveLanguages } from "@/lib/i18n/languages";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import { getJobPostingById } from "@/lib/jobs/service";
import type { JobListItem } from "@/lib/jobs/types";
import { getSiteUrl } from "@/lib/seo/site";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";
import {
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import { convertToUIMessages } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import {
  parseVoiceChatAccessModeSetting,
  resolvePlatformVoiceChatSetting,
} from "@/lib/voice/config";

const chatPageInitialLimitRaw = Number.parseInt(
  process.env.CHAT_PAGE_INITIAL_MESSAGE_LIMIT ?? "",
  10
);
const CHAT_PAGE_INITIAL_MESSAGE_LIMIT =
  Number.isFinite(chatPageInitialLimitRaw) && chatPageInitialLimitRaw > 0
    ? Math.max(10, Math.min(chatPageInitialLimitRaw, CHAT_HISTORY_PAGE_SIZE))
    : CHAT_HISTORY_PAGE_SIZE;
const CHAT_PAGE_CHAT_CACHE_REVALIDATE_SECONDS = 15;
const CHAT_PAGE_PENDING_WINDOW_MS = 15_000;
const CHAT_PAGE_OPTIONAL_QUERY_TIMEOUT_MS = 4000;
const CHAT_PAGE_CRITICAL_QUERY_TIMEOUT_MS = 8000;
const CHAT_PAGE_FEATURE_ACCESS_TIMEOUT_MS = 2000;
const CHAT_PAGE_FEATURE_ACCESS_KEYS = [
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

const getChatByIdCached = unstable_cache(
  async (chatId: string) => getChatById({ id: chatId, includeDeleted: true }),
  ["chat-page:get-chat-by-id"],
  { revalidate: CHAT_PAGE_CHAT_CACHE_REVALIDATE_SECONDS }
);

function parseRecentChatIdCookieValue(value: string | undefined) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const [chatId, timestampRaw] = value.split("|");
  const timestamp = Number(timestampRaw);
  if (!chatId || !Number.isFinite(timestamp)) {
    return null;
  }

  return { chatId, timestamp };
}

export default async function Page(props: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
}) {
  const params = await props.params;
  const resolvedSearchParams = props.searchParams
    ? await props.searchParams
    : undefined;
  const { id } = params;
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const recentChatCookie = parseRecentChatIdCookieValue(
    cookieStore.get("recent-chat-id")?.value
  );
  const requestedMode =
    typeof resolvedSearchParams?.mode === "string"
      ? resolvedSearchParams.mode
      : null;
  const session = await auth();

  // Avoid hitting the database at all for logged-out users.
  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
  }

  const chatLookupResult = await withTimeout(
    getChatByIdCached(id),
    CHAT_PAGE_CRITICAL_QUERY_TIMEOUT_MS,
    () => {
      console.error("[chat] chat lookup timed out.", {
        chatId: id,
        timeoutMs: CHAT_PAGE_CRITICAL_QUERY_TIMEOUT_MS,
      });
    }
  ).catch((error) => {
    console.error("[chat] chat lookup failed.", {
      chatId: id,
      error: error instanceof Error ? error.message : error,
    });
    return "unavailable" as const;
  });
  if (chatLookupResult === "unavailable") {
    return <ChatLoadFailure />;
  }
  const chat = chatLookupResult;

  const isPendingRecentChat =
    recentChatCookie?.chatId === id &&
    Date.now() - recentChatCookie.timestamp <= CHAT_PAGE_PENDING_WINDOW_MS;
  const userRole = session.user?.role ?? null;
  const isAdmin = userRole === "admin";

  if (!chat && !isPendingRecentChat) {
    redirect("/chat");
  }

  if (chat?.deletedAt && !isAdmin) {
    redirect("/");
  }

  if (chat?.visibility === "private" && !isAdmin) {
    if (!session.user?.id || session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const deletedBanner = Boolean(chat?.deletedAt) && isAdmin;
  const messagesPromise = chat
    ? withTimeout(
        getMessagesByChatIdPage({
          id,
          limit: CHAT_PAGE_INITIAL_MESSAGE_LIMIT,
        }),
        CHAT_PAGE_CRITICAL_QUERY_TIMEOUT_MS,
        () => {
          console.error("[chat] initial messages query timed out.", {
            chatId: id,
            timeoutMs: CHAT_PAGE_CRITICAL_QUERY_TIMEOUT_MS,
          });
        }
      )
    : Promise.resolve({ messages: [], hasMore: false });
  const safeOptionalQuery = <T,>(
    label: string,
    promise: Promise<T>,
    fallback: T
  ) =>
    withTimeout(promise, CHAT_PAGE_OPTIONAL_QUERY_TIMEOUT_MS, () => {
      console.error(`[chat] ${label} query timed out.`, {
        timeoutMs: CHAT_PAGE_OPTIONAL_QUERY_TIMEOUT_MS,
      });
    }).catch((error) => {
      console.error(`[chat] ${label} query failed.`, error);
      return fallback;
    });
  const [
    modelsResult,
    translationBundle,
    languageSettings,
    featureAccessSettings,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    deletedBanner
      ? safeOptionalQuery(
          "translation bundle",
          getTranslationBundle(preferredLanguage),
          getFallbackTranslationBundle(preferredLanguage)
        )
      : Promise.resolve({ dictionary: {} }),
    // Cached via `unstable_cache` and avoids a per-request DB query.
    safeOptionalQuery("languages", getActiveLanguages(), []),
    loadFeatureAccessSettingsByKeys(CHAT_PAGE_FEATURE_ACCESS_KEYS, {
      source: "chat.detail.feature-access",
      timeoutMs: CHAT_PAGE_FEATURE_ACCESS_TIMEOUT_MS,
    }),
    withTimeout(
      getImageGenerationAvailability({ userRole }).then(
        buildImageGenerationAccessFromAvailability
      ),
      CHAT_PAGE_OPTIONAL_QUERY_TIMEOUT_MS,
      () => {
        console.error("[chat] image generation availability timed out.", {
          timeoutMs: CHAT_PAGE_OPTIONAL_QUERY_TIMEOUT_MS,
        });
      }
    ).catch((error) => {
      console.error("[chat] image generation availability failed.", error);
      return buildUnavailableImageGenerationAccess(userRole);
    }),
  ]);
  const { dictionary } = translationBundle;
  const featureAccessUnavailable = featureAccessSettings.status === "unavailable";
  const getFeatureSetting = (key: string) => {
    const value = getFeatureAccessModeSettingValue(featureAccessSettings, key);
    if (value !== undefined) {
      return value;
    }
    return featureAccessUnavailable ? "enabled" : null;
  };
  const customKnowledgeSetting = getFeatureSetting(
    CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY
  );
  const documentUploadsSetting = getFeatureSetting(
    DOCUMENT_UPLOADS_FEATURE_FLAG_KEY
  );
  const studyModeSetting = getFeatureSetting(STUDY_MODE_FEATURE_FLAG_KEY);
  const jobsModeSetting = getFeatureSetting(JOBS_FEATURE_FLAG_KEY);
  const voiceChatWebSetting = getFeatureSetting(VOICE_CHAT_WEB_FEATURE_FLAG_KEY);
  const voiceChatLegacySetting = getFeatureSetting(
    VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY
  );
  const customKnowledgeEnabled =
    typeof customKnowledgeSetting === "boolean"
      ? customKnowledgeSetting
      : typeof customKnowledgeSetting === "string"
        ? customKnowledgeSetting.toLowerCase() === "true"
        : featureAccessUnavailable;
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
  const voiceChatSettings = resolvePlatformVoiceChatSetting({
    legacyValue: voiceChatLegacySetting,
    webValue: voiceChatWebSetting,
  });
  const voiceChatEnabled = isFeatureEnabledForRole(
    parseVoiceChatAccessModeSetting(voiceChatSettings.web),
    userRole
  );
  const activeLanguageSettings = languageSettings.map((language) => ({
    id: language.id,
    code: language.code,
    name: language.name,
    isDefault: language.isDefault,
    isActive: language.isActive,
    syncUiLanguage: language.syncUiLanguage,
  }));
  const { defaultModel, models } = modelsResult;

  const fallbackChatMode =
    requestedMode === "study"
      ? "study"
      : requestedMode === "jobs"
        ? "jobs"
        : "default";
  const chatMode = chat?.mode ?? fallbackChatMode;
  if (chatMode === "study" && !studyModeEnabled) {
    return <StudyModeDisabledNotice />;
  }
  if (chatMode === "jobs" && !jobsModeEnabled) {
    return notFound();
  }
  if (chat && chatMode === "jobs") {
    const originUiContext = readChatOriginUiContext(chat.lastContext);
    const originJobPostingId = originUiContext.jobPostingId;

    if (originJobPostingId) {
      const originJob = await getJobPostingById({
        id: originJobPostingId,
        includeInactive: false,
        includeRagState: false,
      }).catch((error) => {
        console.error("[chat] Failed to load origin job for redirect", error);
        return null;
      });

      if (originJob) {
        redirect(`/jobs/${originJob.id}?chatId=${chat.id}`);
      }
    }
  }
  const jobsListItems: JobListItem[] = [];

  let initialMessagesDegraded = false;
  const { messages: messagesFromDb, hasMore: hasMoreMessages } =
    await messagesPromise.catch((error) => {
      initialMessagesDegraded = true;
      console.error("[chat] initial messages query failed.", {
        chatId: id,
        error: error instanceof Error ? error.message : error,
      });
      return { messages: [], hasMore: false };
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

  const fallbackModelId = defaultModel?.id || models[0]?.id || "";
  const chatLanguageFromCookie = cookieStore.get("chat-language");
  const initialChatLanguage =
    typeof chatLanguageFromCookie?.value === "string"
      ? chatLanguageFromCookie.value
      : preferredLanguage ?? "";

  const resolvedChatId = chat?.id ?? id;
  const payload: CachedChatPagePayload = {
    chatId: resolvedChatId,
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
      autoResume: Boolean(chat),
      customKnowledgeEnabled,
      chatMode,
      id: resolvedChatId,
      imageGeneration: {
        enabled: imageGenerationAccess.enabled,
        canGenerate: imageGenerationAccess.canGenerate,
        requiresPaidCredits: imageGenerationAccess.requiresPaidCredits ?? false,
      },
      documentUploadsEnabled,
      voiceChatEnabled,
      initialChatLanguage,
      initialChatModel: fallbackModelId,
      jobsListItems,
      initialJobContext: null,
      initialMessages: uiMessages,
      initialMessagesDegraded,
      initialHasMoreHistory: hasMoreMessages,
      initialOldestMessageAt: oldestMessageAt,
      initialVisibilityType: chat?.visibility ?? "private",
      isReadonly: chat ? session?.user?.id !== chat.userId : false,
      languageSettings: activeLanguageSettings,
      suggestedPrompts: [],
      iconPromptActions: [],
    },
  };

  return (
    <>
      {deletedBanner && <DeletedNotice dictionary={dictionary} />}
      <ChatPageClient payload={payload} cacheChatId={resolvedChatId} />
    </>
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

function ChatLoadFailure() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-md rounded-lg border bg-card p-6 text-center shadow-sm">
        <h2 className="font-semibold text-lg">
          <EditableTranslation
            defaultText="This chat could not be loaded"
            description="Title for the chat detail recovery state when chat data cannot be loaded."
            translationKey="chat.detail.load_failed.title"
          />
        </h2>
        <p className="mt-2 text-muted-foreground text-sm">
          <EditableTranslation
            defaultText="The saved chat data could not be confirmed. You can retry or return to chat."
            description="Description for the chat detail recovery state when chat data cannot be loaded."
            translationKey="chat.detail.load_failed.description"
          />
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Link
            className="inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm transition hover:bg-muted"
            href=""
          >
            <EditableTranslation
              defaultText="Retry"
              description="Retry link label for the chat detail recovery state."
              translationKey="chat.detail.load_failed.retry"
            />
          </Link>
          <Link
            className="inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm transition hover:bg-muted"
            href="/chat"
          >
            <EditableTranslation
              defaultText="Back to chat"
              description="Back link label for the chat detail recovery state."
              translationKey="chat.detail.load_failed.back"
            />
          </Link>
        </div>
      </div>
    </div>
  );
}
