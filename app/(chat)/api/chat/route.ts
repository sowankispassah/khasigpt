import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  type LanguageModelUsage,
  type StepResult,
  smoothStream,
  streamText,
  wrapLanguageModel,
} from "ai";
import { unstable_cache as cache } from "next/cache";
import { after } from "next/server";
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from "resumable-stream";
import type { ModelCatalog } from "tokenlens/core";
import { fetchModels } from "tokenlens/fetch";
import { getUsage } from "tokenlens/helpers";
import { auth, type UserRole } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserRole } from "@/lib/ai/entitlements";
import { createGeminiFileSearchLanguageModel } from "@/lib/ai/gemini-file-search-model";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { resolveLanguageModel } from "@/lib/ai/providers";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DEFAULT_FREE_MESSAGES_PER_DAY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  isProductionEnvironment,
  STUDY_MODE_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import {
  createStreamId,
  deleteChatById,
  getActiveSubscriptionForUser,
  getAppSetting,
  getChatById,
  getLanguageByCodeRaw,
  getMessageCountByUserId,
  getMessagesByChatId,
  recordTokenUsage,
  saveChat,
  saveMessages,
  updateChatLastContextById,
  updateChatTitleById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import { getDefaultLanguage } from "@/lib/i18n/languages";
import { getGeminiFileSearchStoreName } from "@/lib/rag/gemini-file-search";
import { listActiveRagEntryIdsForModel } from "@/lib/rag/service";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { parseStudyModeAccessModeSetting } from "@/lib/study/config";
import {
  getStudyQuestionIndexCached,
  lookupStudyAnswerByNumber,
  lookupStudyQuestionByNumber,
  resolveQuestionNumberFromText,
  resolveStudyNumberIntent,
} from "@/lib/study/question-index";
import {
  STUDY_CHAT_MODE,
  extractStudyYear,
  QUESTION_PAPER_RUNTIME_CONTEXT_CHARS,
  getQuestionPaperEntryById,
  listActiveQuestionPaperIdsForModel,
  listQuestionPaperChips,
  listQuestionPaperFacets,
  listQuestionPapers,
  resolveStudyFilters,
  toStudyCard,
} from "@/lib/study/service";
import type { ChatMessage } from "@/lib/types";
import { resolveDocumentBlobUrl } from "@/lib/uploads/document-access";
import { extractDocumentText } from "@/lib/uploads/document-parser";
import {
  isDocumentMimeType,
  parseDocumentUploadsAccessModeSetting,
} from "@/lib/uploads/document-uploads";
import type { AppUsage } from "@/lib/usage";
import {
  convertToUIMessages,
  generateUUID,
  getTextFromMessage,
} from "@/lib/utils";
import { generateTitleFromUserMessage } from "../../actions";
import { type PostRequestBody, postRequestBodySchema } from "./schema";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

let globalStreamContext: ResumableStreamContext | null = null;
let streamContextDisabled = false;

const rawRedisUrl = process.env.REDIS_URL ?? process.env.KV_URL ?? null;
const redisUrl = (() => {
  if (!rawRedisUrl) {
    return null;
  }
  try {
    new URL(rawRedisUrl);
    return rawRedisUrl;
  } catch {
    if (typeof process !== "undefined" && process.env.NODE_ENV === "development") {
      console.warn("[chat-stream] Ignoring invalid Redis URL");
    }
    return null;
  }
})();

const DEFAULT_CHAT_TITLE = "New Chat";
const STREAM_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};
const ONE_MINUTE = 60 * 1000;
const CHAT_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};
const STUDY_CONTEXT_MAX_CHARS = QUESTION_PAPER_RUNTIME_CONTEXT_CHARS;

const getUsageNumber = (value: unknown): number =>
  typeof value === "number" ? value : 0;

const getTokenlensCatalog = cache(
  async (): Promise<ModelCatalog | undefined> => {
    try {
      return await fetchModels();
    } catch (err) {
      console.warn(
        "TokenLens: catalog fetch failed, using default catalog",
        err
      );
      return; // tokenlens helpers will fall back to defaultCatalog
    }
  },
  ["tokenlens-catalog"],
  { revalidate: 24 * 60 * 60 } // 24 hours
);

function hasRedisConnection() {
  return Boolean(redisUrl);
}

export function getStreamContext() {
  if (streamContextDisabled || !hasRedisConnection()) {
    if (!streamContextDisabled) {
      console.log(
        " > Resumable streams are disabled due to missing REDIS_URL/KV_URL"
      );
      streamContextDisabled = true;
    }
    return null;
  }

  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error) {
      console.error(error);
      streamContextDisabled = true;
      globalStreamContext = null;
      return null;
    }
  }

  return globalStreamContext;
}

const IST_OFFSET_MINUTES = 5.5 * 60;

function getStartOfTodayInIST() {
  const now = new Date();
  const istMillis = now.getTime() + IST_OFFSET_MINUTES * 60 * 1000;
  const istStart = new Date(istMillis);
  istStart.setUTCHours(0, 0, 0, 0);
  return new Date(istStart.getTime() - IST_OFFSET_MINUTES * 60 * 1000);
}

async function resolveLanguageConfig(code?: string | null) {
  const normalized = typeof code === "string" ? code.trim().toLowerCase() : "";
  const languageConfig = normalized
    ? await getLanguageByCodeRaw(normalized)
    : null;

  if (languageConfig?.isActive) {
    return languageConfig;
  }

  const fallback = await getDefaultLanguage().catch(() => null);
  if (!fallback?.code) {
    return null;
  }

  const fallbackConfig = await getLanguageByCodeRaw(fallback.code);
  return fallbackConfig?.isActive ? fallbackConfig : null;
}

function buildFallbackTitleFromMessage(message: ChatMessage) {
  const text = getTextFromMessage(message).trim();
  if (!text) {
    return DEFAULT_CHAT_TITLE;
  }

  const normalized = text.replace(/\s+/g, " ");
  if (normalized.length <= 80) {
    return normalized;
  }

  return `${normalized.slice(0, 77).trim()}...`;
}

function findRecentReferencedQuestionNumber(messages: ChatMessage[]): number | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const entry = messages[index];
    const text = getTextFromMessage(entry).trim();
    if (!text) {
      continue;
    }
    const number = resolveQuestionNumberFromText(text);
    if (number) {
      return number;
    }
  }
  return null;
}

async function enforceChatRateLimit(
  request: Request
): Promise<Response | null> {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `api:chat:${clientKey}`,
    CHAT_RATE_LIMIT
  );

  if (allowed) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    Math.ceil((resetAt - Date.now()) / 1000),
    1
  ).toString();

  return new Response(
    JSON.stringify({
      code: "rate_limit:api",
      message: "Too many requests. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds,
      },
    }
  );
}

export async function POST(request: Request) {
  const rateLimited = await enforceChatRateLimit(request);

  if (rateLimited) {
    return rateLimited;
  }

  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedLanguage,
      selectedVisibilityType,
      hiddenPrompt,
      chatMode: chatModeInput,
      studyPaperId,
      studyQuizActive,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: string;
      selectedLanguage?: string;
      selectedVisibilityType: VisibilityType;
      hiddenPrompt?: string;
      chatMode?: "default" | "study";
      studyPaperId?: string | null;
      studyQuizActive?: boolean;
    } = requestBody;

    const session = await auth();

    if (!session?.user) {
      return new ChatSDKError("unauthorized:chat").toResponse();
    }

    const userRole: UserRole = session.user.role;
    const { maxMessagesPerDay } = entitlementsByUserRole[userRole];

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      since: getStartOfTodayInIST(),
    });

    if (maxMessagesPerDay !== null && messageCount >= maxMessagesPerDay) {
      return new ChatSDKError("rate_limit:chat").toResponse();
    }

    const [
      freeMessageSettings,
      registry,
      customKnowledgeSetting,
      documentUploadsSetting,
      studyModeSetting,
    ] = await Promise.all([
      loadFreeMessageSettings(),
      getModelRegistry(),
      getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
      getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
    ]);
    const enabledConfigs = registry.configs.filter(
      (config) => config.isEnabled
    );
    const modelConfig =
      enabledConfigs.find((config) => config.id === selectedChatModel) ??
      enabledConfigs.find((config) => config.key === selectedChatModel) ??
      enabledConfigs.find(
        (config) => config.providerModelId === selectedChatModel
      ) ??
      enabledConfigs.find((config) => config.isDefault) ??
      enabledConfigs[0];

    if (!modelConfig) {
      return new ChatSDKError(
        "bad_request:api",
        "No chat models are enabled. Please contact an administrator."
      ).toResponse();
    }

    const activeSubscription = await getActiveSubscriptionForUser(
      session.user.id
    );

    const activeTokenBalance = activeSubscription?.tokenBalance ?? 0;
    const hasActiveCredits = activeTokenBalance > 0;
    const perModelAllowance = Math.max(
      0,
      modelConfig.freeMessagesPerDay ?? DEFAULT_FREE_MESSAGES_PER_DAY
    );
    const globalAllowance = Math.max(0, freeMessageSettings.globalLimit);
    const freeMessagesForModel =
      freeMessageSettings.mode === "global"
        ? globalAllowance
        : perModelAllowance;

    const hasFreeDailyAllowance =
      !hasActiveCredits && messageCount < freeMessagesForModel;

    if (!hasActiveCredits && !hasFreeDailyAllowance) {
      return new ChatSDKError(
        "payment_required:credits",
        "You have no active credits remaining. Please recharge to continue."
      ).toResponse();
    }

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
    const requestedChatMode =
      chatModeInput === STUDY_CHAT_MODE ? STUDY_CHAT_MODE : "default";

    const chat = await getChatById({ id });
    const resolvedChatMode = chat?.mode ?? requestedChatMode;

    if (resolvedChatMode === STUDY_CHAT_MODE && !studyModeEnabled) {
      return new ChatSDKError(
        "not_found:chat",
        "Study mode is disabled"
      ).toResponse();
    }

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }
    } else {
      const fallbackTitle =
        resolvedChatMode === STUDY_CHAT_MODE
          ? "Study"
          : buildFallbackTitleFromMessage(message);

      await saveChat({
        id,
        userId: session.user.id,
        title: fallbackTitle,
        visibility: selectedVisibilityType,
        mode: resolvedChatMode,
      });

      if (resolvedChatMode !== STUDY_CHAT_MODE) {
        (async () => {
          try {
            const generatedTitle = await generateTitleFromUserMessage({
              message,
              modelConfig,
            });
            const normalizedTitle = generatedTitle.trim();

            if (normalizedTitle.length > 0 && normalizedTitle !== fallbackTitle) {
              await updateChatTitleById({
                chatId: id,
                title: normalizedTitle,
              });
            }
          } catch (error) {
            console.warn("Failed to refresh chat title", { chatId: id }, error);
          }
        })();
      }
    }

    const normalizedStudyPaperId =
      typeof studyPaperId === "string" && studyPaperId.trim().length > 0
        ? studyPaperId.trim()
        : null;
    const isStudyQuizActive = Boolean(studyQuizActive);

    const buildStudyResponse = async ({
      text,
      cards,
      assistChips,
    }: {
      text?: string;
      cards?: ReturnType<typeof toStudyCard>[];
      assistChips?: { question: string; chips: string[] } | null;
    }) => {
      const createdAt = new Date();
      const assistantMessageId = generateUUID();
      const assistantParts: ChatMessage["parts"] = [];

      if (text) {
        assistantParts.push({ type: "text", text });
      }
      if (cards && cards.length > 0) {
        assistantParts.push({
          type: "data-studyCards",
          data: { papers: cards },
        } as ChatMessage["parts"][number]);
      }
      if (assistChips && assistChips.chips.length > 0) {
        assistantParts.push({
          type: "data-studyAssistChips",
          data: assistChips,
        } as ChatMessage["parts"][number]);
      }

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: message.id,
            role: "user",
            parts: message.parts,
            attachments: [],
            createdAt: new Date(),
          },
          {
            chatId: id,
            id: assistantMessageId,
            role: "assistant",
            parts: assistantParts,
            attachments: [],
            createdAt,
          },
        ],
      });

      const stream = createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          writer.write({
            type: "start",
            messageId: assistantMessageId,
            messageMetadata: { createdAt: createdAt.toISOString() },
          });
          writer.write({ type: "start-step" });
          let textIndex = 0;
          for (const part of assistantParts) {
            if (part.type === "text") {
              const textId = `text-${textIndex}`;
              textIndex += 1;
              writer.write({ type: "text-start", id: textId });
              writer.write({ type: "text-delta", id: textId, delta: part.text });
              writer.write({ type: "text-end", id: textId });
              continue;
            }
            if (part.type === "data-studyCards") {
              writer.write({
                type: "data-studyCards",
                data: part.data,
              });
              continue;
            }
            if (part.type === "data-studyAssistChips") {
              writer.write({
                type: "data-studyAssistChips",
                data: part.data,
              });
            }
          }
          writer.write({ type: "finish-step" });
          writer.write({ type: "finish" });
        },
      });

      return createUIMessageStreamResponse({
        stream,
        headers: STREAM_HEADERS,
      });
    };

    const studyPaperIdsForModel =
      resolvedChatMode === STUDY_CHAT_MODE
        ? await listActiveQuestionPaperIdsForModel({
            modelConfigId: modelConfig.id,
            modelKey: modelConfig.key,
          })
        : null;
    const implicitStudyPaperId =
      !normalizedStudyPaperId &&
      resolvedChatMode === STUDY_CHAT_MODE &&
      studyPaperIdsForModel &&
      studyPaperIdsForModel.length === 1
        ? studyPaperIdsForModel[0]
        : null;
    const effectiveStudyPaperId =
      normalizedStudyPaperId ?? implicitStudyPaperId;
    const studyEntry =
      resolvedChatMode === STUDY_CHAT_MODE && effectiveStudyPaperId
        ? await getQuestionPaperEntryById({ id: effectiveStudyPaperId })
        : null;
    const studyContentRaw =
      typeof studyEntry?.content === "string" ? studyEntry.content.trim() : "";
    const hasPlaceholderContent =
      studyContentRaw.startsWith("Question paper uploaded") ||
      studyContentRaw.length === 0;
    let resolvedStudyContent = studyContentRaw;

    if (
      hasPlaceholderContent &&
      studyEntry?.sourceUrl &&
      typeof studyEntry.sourceUrl === "string"
    ) {
      try {
        const url = studyEntry.sourceUrl;
        const lowerUrl = url.toLowerCase();
        const mediaType = lowerUrl.endsWith(".docx")
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : lowerUrl.endsWith(".xlsx")
            ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            : "application/pdf";
        const parsed = await extractDocumentText(
          {
            name: studyEntry.title ?? "question-paper",
            url,
            mediaType,
          },
          { maxTextChars: STUDY_CONTEXT_MAX_CHARS }
        );
        resolvedStudyContent = parsed.text.trim();
      } catch (error) {
        console.warn("Failed to extract study paper content", error);
      }
    }

    const studyContextText =
      resolvedStudyContent.length > 0
        ? [
            "Question paper content:",
            resolvedStudyContent.length > STUDY_CONTEXT_MAX_CHARS
              ? `${resolvedStudyContent.slice(0, STUDY_CONTEXT_MAX_CHARS)}\n[Content truncated]`
              : resolvedStudyContent,
          ].join("\n\n")
        : "";

    if (resolvedChatMode === STUDY_CHAT_MODE && !normalizedStudyPaperId) {
      const studyText = getTextFromMessage(message).trim();
      const normalizedStudyText = studyText.toLowerCase();
      const wantsStudyResponse =
        /\bpaper(s)?\b|previous year|past year|syllabus|quiz|practice|mock/.test(
          normalizedStudyText
        );
      const facets = await listQuestionPaperFacets({ includeInactive: false });
      const resolvedFilters = resolveStudyFilters({
        text: studyText,
        exams: facets.exams,
        roles: facets.roles,
      });
      const resolvedYear = extractStudyYear(studyText);
      const hasFilters = Boolean(
        resolvedFilters.exam || resolvedFilters.role || resolvedYear
      );

      if (wantsStudyResponse || hasFilters) {
        if (!hasFilters) {
          const availablePapers = await listQuestionPapers({
            includeInactive: false,
          });
          if (availablePapers.length === 1) {
            return buildStudyResponse({
              text: "Here is the available question paper.",
              cards: availablePapers.map(toStudyCard),
            });
          }
        }

        if (!resolvedFilters.exam) {
          const chipGroups = await listQuestionPaperChips({});
          const chips = chipGroups[0]?.chips ?? [];
          return buildStudyResponse({
            text: "Which exam are you preparing for?",
            assistChips: chips.length
              ? { question: "Choose an exam", chips }
              : null,
          });
        }

        if (!resolvedFilters.role) {
          const chipGroups = await listQuestionPaperChips({
            exam: resolvedFilters.exam,
          });
          const chips = chipGroups[0]?.chips ?? [];
          return buildStudyResponse({
            text: `Which post or role for ${resolvedFilters.exam}?`,
            assistChips: chips.length
              ? { question: "Choose a role", chips }
              : null,
          });
        }

        if (!resolvedYear) {
          const chipGroups = await listQuestionPaperChips({
            exam: resolvedFilters.exam,
            role: resolvedFilters.role,
          });
          const chips = chipGroups[0]?.chips ?? [];
          return buildStudyResponse({
            text: "Which year are you looking for?",
            assistChips: chips.length
              ? { question: "Pick a year", chips }
              : null,
          });
        }

        const papers = await listQuestionPapers({
          includeInactive: false,
          exam: resolvedFilters.exam ?? undefined,
          role: resolvedFilters.role ?? undefined,
          year: resolvedYear ?? undefined,
        });

        if (papers.length === 0) {
          if (!hasFilters) {
            const availablePapers = await listQuestionPapers({
              includeInactive: false,
            });
            if (availablePapers.length === 1) {
              return buildStudyResponse({
                text: "Here is the available question paper.",
                cards: availablePapers.map(toStudyCard),
              });
            }
          }
          const chipGroups = await listQuestionPaperChips({
            exam: resolvedFilters.exam ?? null,
            role: resolvedFilters.role ?? null,
          });
          const chips = chipGroups[0]?.chips ?? [];
          return buildStudyResponse({
            text: "I couldn't find that paper. Try another year.",
            assistChips: chips.length
              ? { question: "Try one of these", chips }
              : null,
          });
        }

        const cards = papers.map(toStudyCard);
        const introText =
          cards.length === 1
            ? "Here is the matching question paper."
            : "Here are the matching question papers.";
        return buildStudyResponse({ text: introText, cards });
      }
    }

    if (resolvedChatMode === STUDY_CHAT_MODE && !effectiveStudyPaperId) {
      const availableIds = studyPaperIdsForModel ?? [];
      const papers = await listQuestionPapers({ includeInactive: false });
      const visiblePapers =
        availableIds.length > 0
          ? papers.filter((paper) => availableIds.includes(paper.id))
          : papers;

      if (visiblePapers.length === 0) {
        return buildStudyResponse({
          text: "No question papers are available yet. Please upload one first.",
        });
      }

      if (visiblePapers.length === 1) {
        return buildStudyResponse({
          text: "Here is the available question paper.",
          cards: visiblePapers.map(toStudyCard),
        });
      }

      const chipGroups = await listQuestionPaperChips({});
      const chips = chipGroups[0]?.chips ?? [];
      return buildStudyResponse({
        text: "I found multiple question papers. Please select one paper first, then ask your question.",
        cards: visiblePapers.slice(0, 12).map(toStudyCard),
        assistChips: chips.length ? { question: "Choose an exam", chips } : null,
      });
    }

    if (resolvedChatMode === STUDY_CHAT_MODE && effectiveStudyPaperId) {
      const availableIds = studyPaperIdsForModel ?? [];
      if (!availableIds.includes(effectiveStudyPaperId)) {
        return new ChatSDKError(
          "not_found:chat",
          "Question paper not found or unavailable."
        ).toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const stripDocumentParts = (entry: ChatMessage) => ({
      ...entry,
      parts: entry.parts.filter(
        (part) => !(part.type === "file" && isDocumentMimeType(part.mediaType ?? ""))
      ),
    });
    const uiMessagesFromDb = convertToUIMessages(messagesFromDb);
    const baseUiMessages = uiMessagesFromDb.map(stripDocumentParts);
    const normalizedHiddenPrompt =
      typeof hiddenPrompt === "string" ? hiddenPrompt.trim() : "";
    const studyUserText = getTextFromMessage(message).trim();
    let studyAnswerLlmFallback:
      | { questionNumber: number; questionText: string; reason: string }
      | null = null;

    if (resolvedChatMode === STUDY_CHAT_MODE && effectiveStudyPaperId) {
      const intent = resolveStudyNumberIntent(studyUserText);
      if (intent.type !== "other") {
        const inferredQuestionNumber =
          intent.questionNumber ??
          (intent.type === "ask_answer_by_number"
            ? findRecentReferencedQuestionNumber(uiMessagesFromDb)
            : null);

        if (!inferredQuestionNumber) {
          return buildStudyResponse({
            text: "Please specify the question number (for example, question 5).",
          });
        }

        if (!resolvedStudyContent) {
          return buildStudyResponse({
            text: "I couldn't read enough content from the selected paper to identify question numbers.",
          });
        }

        const paperVersion =
          studyEntry?.updatedAt instanceof Date
            ? studyEntry.updatedAt.toISOString()
            : studyEntry?.updatedAt
              ? new Date(studyEntry.updatedAt).toISOString()
              : null;
        const questionIndex = getStudyQuestionIndexCached({
          paperId: effectiveStudyPaperId,
          paperVersion,
          content: resolvedStudyContent,
        });

        if (intent.type === "ask_question_by_number") {
          const questionLookup = lookupStudyQuestionByNumber(
            questionIndex,
            inferredQuestionNumber
          );

          if (questionLookup.status === "found") {
            return buildStudyResponse({
              text: `Question ${inferredQuestionNumber}:\n${questionLookup.question}`,
            });
          }

          if (questionLookup.status === "ambiguous") {
            return buildStudyResponse({
              text: `I found multiple entries for question ${inferredQuestionNumber} in this paper. Please share the exact section or paste the question text.`,
            });
          }

          return buildStudyResponse({
            text: `I couldn't find question ${inferredQuestionNumber} in the selected paper. Please verify the number.`,
          });
        }

        const answerLookup = lookupStudyAnswerByNumber(
          questionIndex,
          inferredQuestionNumber
        );

        if (answerLookup.status === "found") {
          return buildStudyResponse({
            text: `Answer for question ${inferredQuestionNumber} (verified): ${answerLookup.answer}`,
          });
        }

        if (answerLookup.status === "ambiguous") {
          return buildStudyResponse({
            text: `I found conflicting answers for question ${inferredQuestionNumber} in this paper, so I won't guess. Please share the exact answer-key section.`,
          });
        }
        const questionLookup = lookupStudyQuestionByNumber(
          questionIndex,
          inferredQuestionNumber
        );
        if (questionLookup.status !== "found") {
          return buildStudyResponse({
            text: `I couldn't reliably identify question ${inferredQuestionNumber} in this paper. Please share the exact question text.`,
          });
        }

        studyAnswerLlmFallback = {
          questionNumber: inferredQuestionNumber,
          questionText: questionLookup.question,
          reason: answerLookup.hasAnyAnswerEvidence
            ? "No verified answer was found for this number in the parsed key."
            : "No clear answer key was found in this paper.",
        };
      }
    }

    const documentParts = message.parts.filter(
      (part): part is Extract<ChatMessage["parts"][number], { type: "file" }> =>
        part.type === "file" && isDocumentMimeType(part.mediaType ?? "")
    );
    const recentDocumentParts =
      documentParts.length > 0
        ? documentParts
        : [...uiMessagesFromDb]
            .reverse()
            .flatMap((entry) =>
              entry.parts.filter(
                (
                  part
                ): part is Extract<
                  ChatMessage["parts"][number],
                  { type: "file" }
                > =>
                  part.type === "file" &&
                  isDocumentMimeType(part.mediaType ?? "")
              )
            );

    if (documentParts.length > 0 && !documentUploadsEnabled) {
      return new ChatSDKError(
        "bad_request:api",
        "Document uploads are disabled."
      ).toResponse();
    }

    const resolveDocumentPart = (
      part: Extract<ChatMessage["parts"][number], { type: "file" }>
    ) => {
      const resolved = resolveDocumentBlobUrl({
        sourceUrl: part.url ?? "",
        userId: session.user.id,
        baseUrl: request.url,
        isAdmin: session.user.role === "admin",
      });
      if (!resolved) {
        return null;
      }

      const partData = part as unknown as {
        name?: unknown;
        filename?: unknown;
      };
      const name =
        typeof partData.name === "string"
          ? partData.name
          : typeof partData.filename === "string"
            ? partData.filename
            : null;

      return {
        name,
        url: resolved.blobUrl,
        mediaType: part.mediaType ?? "",
      };
    };

    let documentContextText = "";
    if (documentUploadsEnabled && recentDocumentParts.length > 0) {
      const resolvedParts = [];
      let invalidUpload = false;

      for (const part of recentDocumentParts) {
        const resolved = resolveDocumentPart(part);
        if (!resolved) {
          if (documentParts.length > 0) {
            invalidUpload = true;
            break;
          }
          continue;
        }
        resolvedParts.push(resolved);
      }

      if (invalidUpload) {
        return new ChatSDKError(
          "bad_request:api",
          "Invalid document attachment."
        ).toResponse();
      }

      try {
        const parsedDocuments = await Promise.all(
          resolvedParts.map((part) =>
            extractDocumentText({
              name: part.name,
              url: part.url,
              mediaType: part.mediaType,
            })
          )
        );

        const blocks = parsedDocuments.map((doc) => {
          const suffix = doc.truncated ? "\n[Content truncated]" : "";
          return `Document: ${doc.name}\n${doc.text}${suffix}`;
        });
        documentContextText = [
          "The user uploaded document content. Use it to answer the question.",
          ...blocks,
        ].join("\n\n");
      } catch (error) {
        console.warn("Failed to extract document text", error);
        return new ChatSDKError(
          "bad_request:api",
          "Unable to read the uploaded document."
        ).toResponse();
      }
    }

    const studyQuestionReferencePart = message.parts.find(
      (
        part
      ): part is Extract<
        ChatMessage["parts"][number],
        { type: "data-studyQuestionReference" }
      > => part.type === "data-studyQuestionReference"
    );
    const studyQuestionReferenceData = studyQuestionReferencePart?.data;
    const studyQuestionReferenceText =
      resolvedChatMode === STUDY_CHAT_MODE &&
      studyQuestionReferenceData &&
      typeof studyQuestionReferenceData.title === "string" &&
      typeof studyQuestionReferenceData.preview === "string"
        ? [
            "The user referenced a specific question from the selected paper.",
            `Reference title: ${studyQuestionReferenceData.title}`,
            `Reference preview: ${studyQuestionReferenceData.preview}`,
          ].join("\n")
        : "";

    const baseParts = message.parts.filter((part) => {
      if (part.type === "text") {
        return true;
      }
      if (part.type === "file") {
        return !isDocumentMimeType(part.mediaType ?? "");
      }
      return false;
    });
    let modelParts =
      normalizedHiddenPrompt.length > 0
        ? [
            ...baseParts.filter((part) => part.type !== "text"),
            {
              type: "text" as const,
              text: normalizedHiddenPrompt,
            },
          ]
        : baseParts;
    if (documentContextText) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: documentContextText,
        },
      ];
    }
    if (studyQuestionReferenceText) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: studyQuestionReferenceText,
        },
      ];
    }
    if (studyAnswerLlmFallback) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: [
            "The user explicitly asked for an answer to a numbered question.",
            `Question number: ${studyAnswerLlmFallback.questionNumber}`,
            `Question text: ${studyAnswerLlmFallback.questionText}`,
            `Verification status: ${studyAnswerLlmFallback.reason}`,
            "Use model knowledge to answer only if you are confident. If not confident, say exactly: I don't know.",
          ].join("\n"),
        },
      ];
    }
    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const languageConfig = await resolveLanguageConfig(selectedLanguage);
    const languageSystemPrompt =
      typeof languageConfig?.systemPrompt === "string" &&
      languageConfig.systemPrompt.trim().length > 0
        ? languageConfig.systemPrompt.trim()
        : null;

    const baseInstruction = systemPrompt({
      selectedChatModel,
      requestHints,
      modelSystemPrompt: modelConfig.systemPrompt ?? null,
    });
    const documentInstruction = documentContextText
      ? "When the user asks for lists or tables from uploaded documents, return the full set of rows/items from the document. Do not summarize or truncate unless the user requests a subset. If the response would be too long, ask how to split it."
      : null;
    const systemInstructionParts = [
      typeof baseInstruction === "string" ? baseInstruction.trim() : "",
      languageSystemPrompt ?? "",
      documentInstruction ?? "",
      resolvedChatMode === STUDY_CHAT_MODE
        ? "You are in Study mode. Use the selected question paper as your primary source. If the user asks for the answer to a numbered question and no verified answer key is available, you may use model knowledge only when confident; otherwise respond exactly: I don't know."
        : "",
      resolvedChatMode === STUDY_CHAT_MODE && effectiveStudyPaperId
        ? "Use the selected question paper to answer. For numbered question-answer requests, prefer explicit answer-key evidence when available. If no clear answer key exists and the user explicitly asks for the answer, you may answer from model knowledge only when confident; otherwise respond with: I don't know."
        : "",
      resolvedChatMode === STUDY_CHAT_MODE && studyAnswerLlmFallback
        ? "The current response is an explicit fallback request for a numbered question answer with no verified key. Give a concise best answer from model knowledge if confident. If not confident, respond exactly: I don't know."
        : "",
      resolvedChatMode === STUDY_CHAT_MODE && isStudyQuizActive
        ? "Quiz mode is active. Ask one question at a time from the selected paper, wait for the user's answer, then provide feedback and a brief explanation grounded in the paper. Keep score within this session."
        : "",
    ].filter(Boolean);
    const systemInstruction =
      systemInstructionParts.length > 0
        ? systemInstructionParts.join("\n\n")
        : null;

    const escapeFilterValue = (value: string) =>
      value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const supportsGeminiFileSearchModel = (providerModelId: string) => {
      const normalized = providerModelId.includes("/")
        ? providerModelId.split("/").at(-1) ?? providerModelId
        : providerModelId;

      return (
        normalized === "gemini-pro-latest" ||
        normalized === "gemini-flash-latest" ||
        normalized === "gemini-3-pro-preview" ||
        normalized.startsWith("gemini-3-pro-preview-") ||
        normalized === "gemini-2.5-pro" ||
        normalized.startsWith("gemini-2.5-pro-") ||
        normalized === "gemini-2.5-flash" ||
        normalized.startsWith("gemini-2.5-flash-") ||
        normalized === "gemini-2.5-flash-lite" ||
        normalized.startsWith("gemini-2.5-flash-lite-")
      );
    };

    const fileSearchStoreName = getGeminiFileSearchStoreName();
    const allowStudyFileSearch = resolvedChatMode === STUDY_CHAT_MODE;
    const canUseGeminiFileSearch =
      (customKnowledgeEnabled || allowStudyFileSearch) &&
      modelConfig.provider === "google" &&
      typeof fileSearchStoreName === "string" &&
      supportsGeminiFileSearchModel(modelConfig.providerModelId);

    const activeEntryIds = canUseGeminiFileSearch
      ? resolvedChatMode === STUDY_CHAT_MODE
        ? studyPaperIdsForModel ?? []
        : await listActiveRagEntryIdsForModel({
            modelConfigId: modelConfig.id,
            modelKey: modelConfig.key,
          })
      : [];
    const filteredEntryIds =
      resolvedChatMode === STUDY_CHAT_MODE
        ? effectiveStudyPaperId
          ? [effectiveStudyPaperId]
          : []
        : activeEntryIds;

    const metadataFilter =
      canUseGeminiFileSearch && filteredEntryIds.length > 0
        ? filteredEntryIds
            .map((entryId) => `rag_entry_id = "${escapeFilterValue(entryId)}"`)
            .join(" OR ")
        : null;

    const useGeminiFileSearch =
      canUseGeminiFileSearch &&
      typeof metadataFilter === "string" &&
      metadataFilter.trim().length > 0;

    const geminiFileSearchStoreName =
      useGeminiFileSearch && typeof fileSearchStoreName === "string"
        ? fileSearchStoreName
        : null;

    let languageModel = geminiFileSearchStoreName
      ? createGeminiFileSearchLanguageModel({
          modelId: modelConfig.providerModelId,
          storeName: geminiFileSearchStoreName,
          metadataFilter,
        })
      : resolveLanguageModel(modelConfig);

    if (useGeminiFileSearch && modelConfig.supportsReasoning && modelConfig.reasoningTag) {
      languageModel = wrapLanguageModel({
        model: languageModel,
        middleware: extractReasoningMiddleware({
          tagName: modelConfig.reasoningTag,
        }),
      });
    }

    const shouldAttachStudyContext =
      studyContextText &&
      (!useGeminiFileSearch || studyEntry?.embeddingStatus !== "ready");

    if (shouldAttachStudyContext) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: studyContextText,
        },
      ];
    }

    const modelMessage = { ...message, parts: modelParts };
    const uiMessagesForModel = [...baseUiMessages, modelMessage];

    const promptText = uiMessagesForModel
      .map((entry) => getTextFromMessage(entry))
      .join(" ");
    const estimateTokensFromText = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed.length) {
        return 0;
      }
      return Math.max(1, Math.ceil(trimmed.length / 4));
    };
    const estimatedInputTokens = estimateTokensFromText(promptText);
    const persistUserMessagePromise = saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: "user",
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    }).catch((error) => {
      console.warn("Failed to persist user message", { chatId: id }, error);
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    let finalMergedUsage: AppUsage | undefined;
    let latestStepUsage: LanguageModelUsage | null = null;
    let clientAborted = false;
    request.signal.addEventListener(
      "abort",
      () => {
        clientAborted = true;
      },
      { once: true }
    );
    let usageRecorded = false;
    let resolveUsageReady: (() => void) | null = null;
    const usageReady = new Promise<void>((resolve) => {
      resolveUsageReady = resolve;
    });
    after(async () => {
      try {
        await usageReady;
      } catch (error) {
        console.warn("Usage tracking did not complete", { chatId: id }, error);
      }
    });

    const recordUsageReport = async (
      usage: AppUsage,
      { persistContext }: { persistContext: boolean }
    ) => {
      finalMergedUsage = usage;

      if (persistContext) {
        try {
          await updateChatLastContextById({
            chatId: id,
            context: usage,
          });
        } catch (err) {
          console.warn("Unable to persist last usage for chat", id, err);
        }
      }

      if (usageRecorded) {
        return;
      }

      try {
        const usageFallback = usage as unknown as {
          promptTokens?: number;
          completionTokens?: number;
        };

        const inputTokens =
          typeof usage.inputTokens === "number"
            ? usage.inputTokens
            : getUsageNumber(usageFallback.promptTokens);

        const outputTokens =
          typeof usage.outputTokens === "number"
            ? usage.outputTokens
            : getUsageNumber(usageFallback.completionTokens);

        if (inputTokens > 0 || outputTokens > 0) {
          await recordTokenUsage({
            userId: session.user.id,
            chatId: id,
            modelConfigId: modelConfig.id,
            inputTokens,
            outputTokens,
            deductCredits: hasActiveCredits,
          });
          usageRecorded = true;
        }
      } catch (err) {
        if (err instanceof ChatSDKError) {
          throw err;
        }
        console.warn("Unable to record token usage", { chatId: id }, err);
      }
    };

    const handleUsageReport = async (
      usage: LanguageModelUsage,
      { persistContext }: { persistContext: boolean }
    ) => {
      let mergedUsage: AppUsage;

      try {
        const providers = await getTokenlensCatalog();
        const modelId = modelConfig.providerModelId;

        if (providers) {
          const summary = getUsage({ modelId, usage, providers });
          mergedUsage = { ...usage, ...summary, modelId } as AppUsage;
        } else {
          mergedUsage = usage as AppUsage;
        }
      } catch (err) {
        console.warn("TokenLens enrichment failed", err);
        mergedUsage = usage as AppUsage;
      }

      await recordUsageReport(mergedUsage, { persistContext });
      resolveUsageReady?.();
    };

    const extractTextFromStep = (step?: StepResult<any>) => {
      if (!step?.content?.length) {
        return "";
      }
      const textSegments: string[] = [];
      for (const part of step.content) {
        if (typeof (part as any)?.text === "string") {
          textSegments.push((part as any).text);
        } else if (
          typeof (part as any)?.data === "object" &&
          typeof (part as any)?.data?.text === "string"
        ) {
          textSegments.push((part as any).data.text);
        }
      }
      return textSegments.join("").trim();
    };

    const persistAssistantSnapshot = async (
      step?: StepResult<any>,
      overrideText?: string
    ) => {
      const text = overrideText ?? extractTextFromStep(step);
      if (!text) {
        return;
      }

      await saveMessages({
        messages: [
          {
            chatId: id,
            id: generateUUID(),
            role: "assistant",
            parts: [{ type: "text", text }],
            attachments: [],
            createdAt: new Date(),
          },
        ],
      }).catch((error) => {
        console.warn("Failed to persist partial assistant message", error, {
          chatId: id,
        });
      });
    };

    let latestStepResult: StepResult<any> | null = null;
    let streamedText = "";
    let clientAbortHandled = false;

    const handleClientAbort = () => {
      clientAborted = true;

      if (clientAbortHandled) {
        return;
      }
      clientAbortHandled = true;

      if (latestStepUsage) {
        (async () => {
          await persistAssistantSnapshot(latestStepResult ?? undefined);
          await handleUsageReport(latestStepUsage, { persistContext: false });
        })();
        return;
      }

      const partialText = streamedText.trim();
      if (partialText.length > 0) {
        const estimatedOutputTokens = estimateTokensFromText(partialText);
        const inputTokens = Math.max(1, estimatedInputTokens || 1);
        const fallbackUsage: AppUsage = {
          inputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: inputTokens + estimatedOutputTokens,
          modelId: modelConfig.providerModelId,
        };

        (async () => {
          await persistAssistantSnapshot(undefined, partialText);
          await recordUsageReport(fallbackUsage, { persistContext: false });
        })();
        return;
      }

      resolveUsageReady?.();
    };

    request.signal.addEventListener(
      "abort",
      () => {
        handleClientAbort();
      },
      { once: true }
    );

    const result = streamText({
      model: languageModel,
      ...(systemInstruction ? { system: systemInstruction } : {}),
      ...(modelConfig.provider === "google" ? { maxRetries: 0 } : {}),
      messages: convertToModelMessages(uiMessagesForModel),
      experimental_transform: smoothStream({ chunking: "word" }),
      experimental_telemetry: {
        isEnabled: isProductionEnvironment,
        functionId: "stream-text",
      },
      onChunk: ({ chunk }) => {
        if (chunk.type === "text-delta") {
          streamedText += chunk.text;
        }
      },
      abortSignal: request.signal,
      onFinish: async ({ usage }) => {
        await handleUsageReport(usage, { persistContext: !clientAborted });
      },
      onStepFinish: (stepResult) => {
        latestStepUsage = stepResult?.usage ?? null;
        latestStepResult = stepResult ?? null;
      },
      onAbort: async ({ steps }) => {
        if (clientAbortHandled) {
          return;
        }
        const lastStep = steps.at(-1);
        await persistAssistantSnapshot(lastStep);
        const usage = lastStep?.usage ?? latestStepUsage;
        if (!usage) {
          resolveUsageReady?.();
          return;
        }
        await handleUsageReport(usage, { persistContext: !clientAborted });
      },
    });

    result.usage
      .then(async (usage) => {
        if (!usageRecorded && usage) {
          await handleUsageReport(usage, { persistContext: !clientAborted });
        }
      })
      .catch((error) => {
        console.warn("Unable to resolve stream usage", { chatId: id }, error);
      });

    const uiStream = result.toUIMessageStream({
      sendReasoning: modelConfig.supportsReasoning,
      onFinish: ({ messages }) => {
        void saveMessages({
          messages: messages.map((currentMessage) => ({
            id:
              typeof currentMessage.id === "string" &&
              currentMessage.id.length > 0
                ? currentMessage.id
                : generateUUID(),
            role: currentMessage.role,
            parts: currentMessage.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        }).catch((error) => {
          console.warn(
            "Failed to persist assistant messages",
            { chatId: id },
            error
          );
        });

        void persistUserMessagePromise;

        if (!finalMergedUsage) {
          resolveUsageReady?.();
        }
      },
      onError: (error) => {
        const text = error instanceof Error ? error.message : String(error);
        const match = text.match(/retry in ([0-9]+(?:\\.[0-9]+)?)s/i);
        if (match?.[1]) {
          const seconds = Math.max(1, Math.ceil(Number(match[1])));
          return `Gemini rate limit reached. Please retry in ~${seconds}s.`;
        }
        if (text.toLowerCase().includes("quota")) {
          return "Gemini quota exceeded. Please wait and try again.";
        }
        return "Oops, an error occurred!";
      },
    });

    const combinedStream = new ReadableStream({
      start(controller) {
        const reader = uiStream.getReader();

        (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) {
                break;
              }
              controller.enqueue(value);
            }

            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        })();
      },
    });

    const streamResponse = createUIMessageStreamResponse({
      stream: combinedStream,
      headers: STREAM_HEADERS,
    });

    return streamResponse;
  } catch (error) {
    const vercelId = request.headers.get("x-vercel-id");

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    // Check for Vercel AI Gateway credit card error
    if (
      error instanceof Error &&
      error.message?.includes(
        "AI Gateway requires a valid credit card on file to service requests"
      )
    ) {
      return new ChatSDKError("bad_request:activate_gateway").toResponse();
    }

    console.error("Unhandled error in chat API:", error, { vercelId });
    return new ChatSDKError("offline:chat").toResponse();
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id });

  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
