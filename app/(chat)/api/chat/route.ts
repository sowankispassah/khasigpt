import { geolocation } from "@vercel/functions";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  extractReasoningMiddleware,
  generateText,
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
import { z } from "zod";
import { auth, type UserRole } from "@/app/(auth)/auth";
import type { VisibilityType } from "@/components/visibility-selector";
import { entitlementsByUserRole } from "@/lib/ai/entitlements";
import { createGeminiFileSearchLanguageModel } from "@/lib/ai/gemini-file-search-model";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { type RequestHints, systemPrompt } from "@/lib/ai/prompts";
import { mergeChatUiContext, readChatUiContext } from "@/lib/chat/ui-context";
import { resolveLanguageModel } from "@/lib/ai/providers";
import {
  CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY,
  DEFAULT_FREE_MESSAGES_PER_DAY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  isProductionEnvironment,
  JOBS_FEATURE_FLAG_KEY,
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
  getMessagesByChatIdPage,
  recordTokenUsage,
  saveChat,
  saveMessages,
  touchChatActivityById,
  updateChatLastContextById,
  updateChatTitleById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import { getDefaultLanguage } from "@/lib/i18n/languages";
import { parseJobsAccessModeSetting } from "@/lib/jobs/config";
import {
  buildJobsPdfExtractedSummaryLines,
  type JobsPdfExtractedData,
} from "@/lib/jobs/pdf-extraction";
import {
  isJobsMetaConversationQuery,
  logJobRetrieval,
  retrieveJobsForConversation,
} from "@/lib/jobs/retrieval";
import { extractSalaryText, resolveJobSalaryInfo } from "@/lib/jobs/salary";
import { getJobTypeLabel } from "@/lib/jobs/sector";
import {
  JOBS_CHAT_MODE,
  JOB_POSTING_RUNTIME_CONTEXT_CHARS,
  getJobKnowledgeUnitById,
  getJobPostingEntryById,
  listActiveJobPostingIdsForModel,
  listJobPostings,
  listStudyPapersForJob,
  toJobCard,
} from "@/lib/jobs/service";
import type { JobCard } from "@/lib/jobs/types";
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
import type { QuestionPaperRecord } from "@/lib/study/types";
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

const shouldUseRemoteRedis =
  process.env.DISABLE_REMOTE_REDIS === "1"
    ? false
    : process.env.NODE_ENV === "development"
      ? process.env.ENABLE_REMOTE_REDIS_IN_DEV === "1"
      : true;
const rawRedisUrl = shouldUseRemoteRedis
  ? process.env.REDIS_URL ?? process.env.KV_URL ?? null
  : null;
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
const JOBS_CONTEXT_MAX_CHARS = JOB_POSTING_RUNTIME_CONTEXT_CHARS;
const JOBS_STUDY_CONTEXT_MAX_CHARS = 60_000;
const JOBS_FOLLOWUP_PDF_MAX_CHARS = 5_000;
const rawContextMessageLimit = Number.parseInt(
  process.env.CHAT_CONTEXT_MESSAGE_LIMIT ?? "120",
  10
);
const CHAT_CONTEXT_MESSAGE_LIMIT =
  Number.isFinite(rawContextMessageLimit) && rawContextMessageLimit > 0
    ? Math.min(Math.max(rawContextMessageLimit, 20), 400)
    : 120;

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

type JobsIntent = "job_detail" | "exam_prep" | "answer_help";

function detectJobsIntent(text: string): JobsIntent {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return "job_detail";
  }

  const answerHelpPattern =
    /\b(answer|solution|solve|explain( this| why)?|doubt|correct option|which option|just answer|final answer)\b/;
  if (answerHelpPattern.test(normalized)) {
    return "answer_help";
  }

  const examPrepPattern =
    /\b(exam|syllabus|pattern|expected question|what type of question|mock|practice|topic|preparation|previous year|past year)\b/;
  if (examPrepPattern.test(normalized)) {
    return "exam_prep";
  }

  return "job_detail";
}

function wantsDirectExamAnswer(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return /\b(just answer|only answer|direct answer|final answer)\b/.test(
    normalized
  );
}

const jobsRagSelectionSchema = z.object({
  answer: z.string().trim().min(1),
  jobIds: z.array(z.string().uuid()).max(20).default([]),
});
const JOB_UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

function sanitizeJobsAnswerText(value: string) {
  return value
    .replace(/\s*\[cite:[^\]]+\]/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function findMentionedJobsLocation(
  text: string,
  jobs: Array<{ location: string }>
): string | null {
  const normalizedText = text.trim().toLowerCase();
  if (!normalizedText) {
    return null;
  }

  const knownLocations = Array.from(
    new Set(jobs.map((job) => job.location.trim()).filter(Boolean))
  ).sort((a, b) => b.length - a.length);

  for (const location of knownLocations) {
    const normalizedLocation = location.toLowerCase();
    if (normalizedLocation && normalizedText.includes(normalizedLocation)) {
      return location;
    }
  }

  return null;
}

function parseSalaryAnchorValues(value: string) {
  const matches = Array.from(
    value.matchAll(/\b\d[\d,]{3,}\b/g),
    (match) => Number.parseInt(match[0].replace(/,/g, ""), 10)
  ).filter((amount) => Number.isFinite(amount) && amount >= 1_000 && amount <= 10_000_000);

  return matches;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findRequestedSalaryRange(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const amountValues = parseSalaryAnchorValues(normalized);
  if (amountValues.length === 0) {
    return null;
  }

  const [firstValue, secondValue] = amountValues;
  if (/\bbetween\b/.test(normalized) && typeof secondValue === "number") {
    return {
      min: Math.min(firstValue, secondValue),
      max: Math.max(firstValue, secondValue),
    };
  }

  if (/\b(?:around|about|near|approx(?:imately)?)\b/.test(normalized)) {
    const tolerance = Math.max(1_000, Math.round(firstValue * 0.2));
    return {
      min: Math.max(0, firstValue - tolerance),
      max: firstValue + tolerance,
    };
  }

  if (/\b(?:under|below|less than|up to|upto)\b/.test(normalized)) {
    return {
      min: 0,
      max: firstValue,
    };
  }

  if (/\b(?:above|over|more than|at least|minimum)\b/.test(normalized)) {
    return {
      min: firstValue,
      max: Number.MAX_SAFE_INTEGER,
    };
  }

  if (/\b(?:salary|pay|stipend|ctc|remuneration|emoluments?)\b/.test(normalized)) {
    const tolerance = Math.max(1_000, Math.round(firstValue * 0.2));
    return {
      min: Math.max(0, firstValue - tolerance),
      max: firstValue + tolerance,
    };
  }

  return null;
}

function jobMayMatchRequestedSalary({
  job,
  salaryRange,
}: {
  job: {
    salary?: string | null;
    content?: string | null;
    pdfContent?: string | null;
    pdfExtractedData?: JobsPdfExtractedData | null;
  };
  salaryRange: { min: number; max: number };
}) {
  const salarySummary = resolveJobSalaryInfo({
    salary: job.salary,
    content: job.content ?? null,
    pdfContent: job.pdfContent ?? null,
    extractedData: job.pdfExtractedData,
  }).summary;
  const anchors = parseSalaryAnchorValues(salarySummary);
  if (anchors.length === 0) {
    return false;
  }

  const min = Math.min(...anchors);
  const max = Math.max(...anchors);
  return max >= salaryRange.min && min <= salaryRange.max;
}

function buildJobsCatalogCandidates({
  jobs,
  text,
  requestedLocation,
  requestedSalaryRange,
  limit = 250,
}: {
  jobs: Array<{
    id: string;
    title: string;
    company: string;
    location: string;
    salary?: string | null;
    content?: string | null;
    pdfContent?: string | null;
    pdfExtractedData?: JobsPdfExtractedData | null;
    employmentType: string;
  }>;
  text: string;
  requestedLocation: string | null;
  requestedSalaryRange: { min: number; max: number } | null;
  limit?: number;
}) {
  const normalizedQuery = text.trim().toLowerCase();
  const terms = Array.from(
    new Set(
      (normalizedQuery.match(/[a-z]{3,}/g) ?? []).filter(
        (term) =>
          ![
            "any",
            "jobs",
            "job",
            "latest",
            "recent",
            "new",
            "around",
            "about",
            "near",
            "salary",
            "salaries",
            "pay",
            "roles",
            "role",
            "show",
            "find",
            "list",
            "there",
            "with",
            "from",
            "that",
            "this",
            "can",
            "get",
          ].includes(term)
      )
    )
  );

  return jobs
    .map((job, index) => {
      let score = 0;
      if (
        requestedLocation &&
        job.location.trim().toLowerCase().includes(requestedLocation.toLowerCase())
      ) {
        score += 120;
      }
      if (
        requestedSalaryRange &&
        jobMayMatchRequestedSalary({
          job,
          salaryRange: requestedSalaryRange,
        })
      ) {
        score += 90;
      }

      const primaryHaystack = [
        job.title,
        job.company,
        job.location,
        job.salary ?? "",
        getJobTypeLabel(job.employmentType),
      ]
        .join(" ")
        .toLowerCase();
      const secondaryHaystack = [job.content ?? "", job.pdfContent ?? ""]
        .join(" ")
        .toLowerCase();

      for (const term of terms) {
        if (primaryHaystack.includes(term)) {
          score += 8;
        } else if (secondaryHaystack.includes(term)) {
          score += 3;
        }
      }

      // Prefer more recent jobs when query-specific signals tie.
      const baseScore = Math.max(0, 20 - Math.floor(index / 20));
      score += baseScore;

      return {
        job,
        index,
        score,
        baseScore,
      };
    })
    .filter((entry) => {
      const hasSearchSignals =
        Boolean(requestedLocation || requestedSalaryRange) || terms.length > 0;
      if (!hasSearchSignals) {
        return true;
      }
      return entry.score > entry.baseScore;
    })
    .sort((a, b) => {
      if (a.score !== b.score) {
        return b.score - a.score;
      }
      return a.index - b.index;
    })
    .slice(0, limit)
    .map((entry) => entry.job);
}

function normalizeJobsSelectionAnswer({
  query,
  answer,
  matchedCards,
}: {
  query: string;
  answer: string;
  matchedCards: JobCard[];
}) {
  let normalized = sanitizeJobsAnswerText(answer);
  if (!normalized) {
    return normalized;
  }

  if (matchedCards.length === 0) {
    return normalized;
  }

  const approximateQuery =
    /\b(?:around|about|near|approx(?:imately)?|close to)\b/i.test(query);
  const requestedLocation = findMentionedJobsLocation(query, matchedCards);
  const sentences =
    normalized
      .match(/[^.!?]+[.!?]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [];

  if (sentences.length > 1) {
    const firstSentence = sentences[0] ?? "";
    const isNegativeLead = [
      /\bI (?:couldn't|could not|didn't|did not|can't|cannot) find\b/i,
      /\bThere (?:are|were) no\b/i,
      /\bI found no\b/i,
      /\bI did not find\b/i,
    ].some((pattern) => pattern.test(firstSentence));
    const mentionsExact = /\bexact\b/i.test(firstSentence);
    const mentionsSpecificity = /\bspecifically\b/i.test(firstSentence);
    const mentionsRequestedLocation =
      requestedLocation &&
      new RegExp(`\\b${escapeRegExp(requestedLocation)}\\b`, "i").test(firstSentence);

    if (
      isNegativeLead &&
      (approximateQuery || mentionsExact || mentionsSpecificity || mentionsRequestedLocation)
    ) {
      sentences.shift();
      if (sentences.length > 0) {
        sentences[0] = sentences[0].replace(/^(however|but|still|instead)\s*,?\s*/i, "");
      }
      normalized = sentences.join(" ").replace(/\s{2,}/g, " ").trim();
    }
  }

  if (normalized.length > 0) {
    return normalized;
  }

  if (requestedLocation) {
    return `I found ${matchedCards.length} job${matchedCards.length === 1 ? "" : "s"} in ${requestedLocation}.`;
  }

  if (approximateQuery) {
    return `I found ${matchedCards.length} job${matchedCards.length === 1 ? "" : "s"} close to that amount.`;
  }

  return `I found ${matchedCards.length} relevant job${matchedCards.length === 1 ? "" : "s"}.`;
}

function formatJobsSalaryAnchor(value: number) {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
}

function buildStructuredJobsListingText({
  matchedCards,
  requestedLocation,
  requestedSalaryRange,
}: {
  matchedCards: JobCard[];
  requestedLocation: string | null;
  requestedSalaryRange: { min: number; max: number } | null;
}) {
  if (matchedCards.length === 0) {
    if (requestedSalaryRange) {
      if (requestedSalaryRange.min === requestedSalaryRange.max) {
        return `I couldn't find any jobs around ${formatJobsSalaryAnchor(requestedSalaryRange.min)} in the current listings.`;
      }

      return `I couldn't find any jobs in the ${formatJobsSalaryAnchor(requestedSalaryRange.min)}-${formatJobsSalaryAnchor(requestedSalaryRange.max)} range in the current listings.`;
    }

    if (requestedLocation) {
      return `I couldn't find any current jobs for ${requestedLocation}.`;
    }

    return "I couldn't find any matching jobs in the current listings.";
  }

  if (requestedSalaryRange && requestedLocation) {
    return `I found ${matchedCards.length} job${matchedCards.length === 1 ? "" : "s"} around that salary in ${requestedLocation}.`;
  }

  if (requestedSalaryRange) {
    const anchor =
      requestedSalaryRange.min === requestedSalaryRange.max
        ? formatJobsSalaryAnchor(requestedSalaryRange.min)
        : `${formatJobsSalaryAnchor(requestedSalaryRange.min)}-${formatJobsSalaryAnchor(requestedSalaryRange.max)}`;
    return `I found ${matchedCards.length} job${matchedCards.length === 1 ? "" : "s"} around ${anchor}.`;
  }

  if (requestedLocation) {
    return `I found ${matchedCards.length} job${matchedCards.length === 1 ? "" : "s"} in ${requestedLocation}.`;
  }

  return `I found ${matchedCards.length} matching job${matchedCards.length === 1 ? "" : "s"}.`;
}

function supportsGeminiFileSearchModel(providerModelId: string) {
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
}

const DEFAULT_GEMINI_FILE_SEARCH_MODEL_ID = "gemini-2.5-flash";

function resolveGeminiFileSearchModelId(
  ...candidates: Array<string | null | undefined>
) {
  for (const candidate of candidates) {
    const normalized = candidate?.trim();
    if (normalized && supportsGeminiFileSearchModel(normalized)) {
      return normalized;
    }
  }

  return DEFAULT_GEMINI_FILE_SEARCH_MODEL_ID;
}

function parseJobsRagSelection(rawText: string) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }

  const sanitizeCandidate = (candidate: string) =>
    candidate
      .trim()
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'");

  const parseCandidate = (candidate: string) => {
    try {
      const parsedJson = JSON.parse(sanitizeCandidate(candidate));
      const parsed = jobsRagSelectionSchema.parse(parsedJson);
      return {
        ...parsed,
        answer: sanitizeJobsAnswerText(parsed.answer),
      };
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(trimmed);
  if (direct) {
    return direct;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fencedMatch?.[1]) {
    const fenced = parseCandidate(fencedMatch[1]);
    if (fenced) {
      return fenced;
    }
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch?.[0]) {
    const objectParsed = parseCandidate(objectMatch[0]);
    if (objectParsed) {
      return objectParsed;
    }
  }

  const recoveredJobIds = Array.from(
    new Set((trimmed.match(JOB_UUID_PATTERN) ?? []).map((id) => id.toLowerCase()))
  ).slice(0, 20);
  const answerMatch = trimmed.match(/"answer"\s*:\s*"([\s\S]*?)"/i);
  const recoveredAnswer =
    answerMatch?.[1]
      ?.replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .trim() ?? "";

  if (!recoveredAnswer && recoveredJobIds.length === 0) {
    return null;
  }

  const fallbackAnswer =
    recoveredAnswer.length > 0
      ? sanitizeJobsAnswerText(recoveredAnswer)
      : "Here are the most relevant jobs I found.";

  return jobsRagSelectionSchema.parse({
    answer: fallbackAnswer,
    jobIds: recoveredJobIds,
  });
}

function resolveDocumentMediaTypeFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith(".pdf")) {
      return "application/pdf";
    }
    if (pathname.endsWith(".docx")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    if (pathname.endsWith(".xlsx")) {
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    }
    return null;
  } catch {
    return null;
  }
}

function extractLabelledValueFromText({
  text,
  labels,
}: {
  text: string;
  labels: string[];
}) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(
      `(?:${escaped})\\s*[:\\-]?\\s*([^\\n\\r]{3,180})`,
      "i"
    );
    const match = text.match(expression);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }
  }
  return null;
}

function extractJobFactsFromText(text: string) {
  const normalized = text.replace(/\r\n/g, "\n");
  const salary = extractSalaryText(normalized);

  const qualification = extractLabelledValueFromText({
    text: normalized,
    labels: [
      "qualification",
      "essential qualification",
      "educational qualification",
      "eligibility",
      "education",
    ],
  });
  const experience = extractLabelledValueFromText({
    text: normalized,
    labels: ["experience", "work experience", "minimum experience"],
  });
  const ageLimit = extractLabelledValueFromText({
    text: normalized,
    labels: ["age limit", "maximum age", "minimum age"],
  });
  const applicationFee = extractLabelledValueFromText({
    text: normalized,
    labels: ["application fee", "exam fee", "registration fee", "fee"],
  });
  const selectionProcess = extractLabelledValueFromText({
    text: normalized,
    labels: ["selection process", "mode of selection", "selection procedure"],
  });
  const applicationLastDate = extractLabelledValueFromText({
    text: normalized,
    labels: [
      "last date",
      "last date of receipt",
      "application deadline",
      "submission deadline",
      "closing date",
      "apply before",
    ],
  });
  const notificationDate = extractLabelledValueFromText({
    text: normalized,
    labels: [
      "notification date",
      "date of notification",
      "advertisement date",
      "date of publication",
      "published on",
      "issue date",
    ],
  });

  const facts: string[] = [];
  if (salary) {
    facts.push(`Salary: ${salary}`);
  }
  if (qualification) {
    facts.push(`Qualification: ${qualification}`);
  }
  if (experience) {
    facts.push(`Experience: ${experience}`);
  }
  if (ageLimit) {
    facts.push(`Age Limit: ${ageLimit}`);
  }
  if (applicationFee) {
    facts.push(`Application Fee: ${applicationFee}`);
  }
  if (selectionProcess) {
    facts.push(`Selection Process: ${selectionProcess}`);
  }
  if (applicationLastDate) {
    facts.push(`Application Last Date: ${applicationLastDate}`);
  }
  if (notificationDate) {
    facts.push(`Notification Date: ${notificationDate}`);
  }

  return facts;
}

async function resolveJobPdfSupplementalContext(job: {
  title: string;
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  pdfExtractedData?: JobsPdfExtractedData | null;
}) {
  const structuredFacts = buildJobsPdfExtractedSummaryLines(job.pdfExtractedData);
  const candidateUrls = [job.pdfCachedUrl, job.pdfSourceUrl, job.sourceUrl]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);
  const pdfUrl = candidateUrls.find((value) =>
    value.toLowerCase().includes(".pdf")
  );
  if (!pdfUrl) {
    return structuredFacts.length > 0
      ? `Stored PDF extracted details:\n${structuredFacts.join("\n")}`
      : "";
  }

  try {
    const parsed = await extractDocumentText(
      {
        name: `${job.title || "job-posting"}.pdf`,
        url: pdfUrl,
        mediaType: "application/pdf",
      },
      {
        maxTextChars: JOBS_FOLLOWUP_PDF_MAX_CHARS,
        downloadTimeoutMs: 25_000,
      }
    );
    const pdfText = parsed.text.trim();
    if (!pdfText) {
      return structuredFacts.length > 0
        ? `Stored PDF extracted details:\n${structuredFacts.join("\n")}`
        : "";
    }

    const facts = Array.from(
      new Set([...structuredFacts, ...extractJobFactsFromText(pdfText)])
    );
    const excerpt = pdfText.replace(/\s+/g, " ").trim().slice(0, 1_200);
    const sections: string[] = [];
    if (facts.length > 0) {
      sections.push(`PDF extracted details:\n${facts.join("\n")}`);
    }
    if (excerpt.length > 0) {
      sections.push(`PDF excerpt: ${excerpt}`);
    }

    return sections.join("\n\n");
  } catch (error) {
    console.warn("[jobs-chat] pdf_followup_extract_failed", {
      title: job.title,
      pdfUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

async function resolveStudyPaperContextText({
  paper,
  maxChars,
}: {
  paper: QuestionPaperRecord;
  maxChars: number;
}) {
  const paperContentRaw =
    typeof paper.content === "string" ? paper.content.trim() : "";
  const hasPlaceholderContent =
    paperContentRaw.startsWith("Question paper uploaded") ||
    paperContentRaw.length === 0;
  let resolvedPaperContent = paperContentRaw;

  if (
    hasPlaceholderContent &&
    paper.sourceUrl &&
    typeof paper.sourceUrl === "string"
  ) {
    try {
      const url = paper.sourceUrl;
      const lowerUrl = url.toLowerCase();
      const mediaType = lowerUrl.endsWith(".docx")
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        : lowerUrl.endsWith(".xlsx")
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf";
      const parsed = await extractDocumentText(
        {
          name: paper.title ?? "question-paper",
          url,
          mediaType,
        },
        { maxTextChars: maxChars }
      );
      resolvedPaperContent = parsed.text.trim();
    } catch (error) {
      console.warn("Failed to extract linked study paper content", error);
    }
  }

  if (!resolvedPaperContent.length) {
    return "";
  }

  return resolvedPaperContent.length > maxChars
    ? `${resolvedPaperContent.slice(0, maxChars)}\n[Content truncated]`
    : resolvedPaperContent;
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
      jobPostingId,
    }: {
      id: string;
      message: ChatMessage;
      selectedChatModel: string;
      selectedLanguage?: string;
      selectedVisibilityType: VisibilityType;
      hiddenPrompt?: string;
      chatMode?: "default" | "study" | "jobs";
      studyPaperId?: string | null;
      studyQuizActive?: boolean;
      jobPostingId?: string | null;
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
      jobsModeSetting,
    ] = await Promise.all([
      loadFreeMessageSettings(),
      getModelRegistry(),
      getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
      getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(STUDY_MODE_FEATURE_FLAG_KEY),
      getAppSetting<string | boolean>(JOBS_FEATURE_FLAG_KEY),
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
    const jobsMode = parseJobsAccessModeSetting(jobsModeSetting);
    const jobsModeEnabled = isFeatureEnabledForRole(jobsMode, session.user.role);
    const requestedChatMode =
      chatModeInput === STUDY_CHAT_MODE
        ? STUDY_CHAT_MODE
        : chatModeInput === JOBS_CHAT_MODE
          ? JOBS_CHAT_MODE
          : "default";

    const chat = await getChatById({ id });
    const resolvedChatMode = chat?.mode ?? requestedChatMode;
    let persistedChatLastContext = chat?.lastContext ?? null;

    if (resolvedChatMode === STUDY_CHAT_MODE && !studyModeEnabled) {
      return new ChatSDKError(
        "not_found:chat",
        "Study mode is disabled"
      ).toResponse();
    }
    if (resolvedChatMode === JOBS_CHAT_MODE && !jobsModeEnabled) {
      return new ChatSDKError(
        "not_found:chat",
        "Jobs mode is disabled"
      ).toResponse();
    }
    const resolvedLanguageConfig = await resolveLanguageConfig(selectedLanguage);
    const selectedLanguageSystemPrompt =
      typeof resolvedLanguageConfig?.systemPrompt === "string" &&
      resolvedLanguageConfig.systemPrompt.trim().length > 0
        ? resolvedLanguageConfig.systemPrompt.trim()
        : null;

    if (chat) {
      if (chat.userId !== session.user.id) {
        return new ChatSDKError("forbidden:chat").toResponse();
      }

      await touchChatActivityById({ chatId: chat.id });
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

      if (
        resolvedChatMode === "default" ||
        resolvedChatMode === JOBS_CHAT_MODE
      ) {
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

    const normalizedJobPostingId =
      typeof jobPostingId === "string" && jobPostingId.trim().length > 0
        ? jobPostingId.trim()
        : null;
    const normalizedStudyPaperId =
      typeof studyPaperId === "string" && studyPaperId.trim().length > 0
        ? studyPaperId.trim()
        : null;
    const isStudyQuizActive = Boolean(studyQuizActive);

    const buildJobsResponse = async ({
      text,
      cards,
      jobPostingIdOverride,
    }: {
      text?: string;
      cards?: JobCard[];
      jobPostingIdOverride?: string | null;
    }) => {
      const userCreatedAt = new Date();
      const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
      const assistantMessageId = generateUUID();
      const assistantParts: ChatMessage["parts"] = [];

      const nextContext = mergeChatUiContext({
        currentContext: persistedChatLastContext,
        uiContext: {
          jobPostingId:
            resolvedChatMode === JOBS_CHAT_MODE
              ? jobPostingIdOverride !== undefined
                ? jobPostingIdOverride
                : effectiveJobPostingId ?? null
              : null,
          studyPaperId: null,
        },
      });
      const previousUiContext = readChatUiContext(persistedChatLastContext);
      const nextUiContext = readChatUiContext(nextContext);
      if (
        previousUiContext.jobPostingId !== nextUiContext.jobPostingId ||
        previousUiContext.studyPaperId !== nextUiContext.studyPaperId
      ) {
        await updateChatLastContextById({
          chatId: id,
          context: nextContext,
        });
        persistedChatLastContext = nextContext;
      }

      if (text) {
        assistantParts.push({ type: "text", text });
      }
      if (cards) {
        assistantParts.push({
          type: "data-jobCards",
          data: { jobs: cards },
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
            createdAt: userCreatedAt,
          },
          {
            chatId: id,
            id: assistantMessageId,
            role: "assistant",
            parts: assistantParts,
            attachments: [],
            createdAt: assistantCreatedAt,
          },
        ],
      });

      const stream = createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          writer.write({
            type: "start",
            messageId: assistantMessageId,
            messageMetadata: { createdAt: assistantCreatedAt.toISOString() },
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
            if (part.type === "data-jobCards") {
              writer.write({
                type: "data-jobCards",
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

    const buildStudyResponse = async ({
      text,
      cards,
      assistChips,
    }: {
      text?: string;
      cards?: ReturnType<typeof toStudyCard>[];
      assistChips?: { question: string; chips: string[] } | null;
    }) => {
      const userCreatedAt = new Date();
      const assistantCreatedAt = new Date(userCreatedAt.getTime() + 1);
      const assistantMessageId = generateUUID();
      const assistantParts: ChatMessage["parts"] = [];

      const nextContext = mergeChatUiContext({
        currentContext: persistedChatLastContext,
        uiContext: {
          jobPostingId: null,
          studyPaperId:
            resolvedChatMode === STUDY_CHAT_MODE ? effectiveStudyPaperId ?? null : null,
        },
      });
      const previousUiContext = readChatUiContext(persistedChatLastContext);
      const nextUiContext = readChatUiContext(nextContext);
      if (
        previousUiContext.jobPostingId !== nextUiContext.jobPostingId ||
        previousUiContext.studyPaperId !== nextUiContext.studyPaperId
      ) {
        await updateChatLastContextById({
          chatId: id,
          context: nextContext,
        });
        persistedChatLastContext = nextContext;
      }

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
            createdAt: userCreatedAt,
          },
          {
            chatId: id,
            id: assistantMessageId,
            role: "assistant",
            parts: assistantParts,
            attachments: [],
            createdAt: assistantCreatedAt,
          },
        ],
      });

      const stream = createUIMessageStream<ChatMessage>({
        execute: ({ writer }) => {
          writer.write({
            type: "start",
            messageId: assistantMessageId,
            messageMetadata: { createdAt: assistantCreatedAt.toISOString() },
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

    const jobPostingIdsForModel =
      resolvedChatMode === JOBS_CHAT_MODE
        ? await listActiveJobPostingIdsForModel({
            modelConfigId: modelConfig.id,
            modelKey: modelConfig.key,
          })
        : null;
    const implicitJobPostingId =
      !normalizedJobPostingId &&
      resolvedChatMode === JOBS_CHAT_MODE &&
      jobPostingIdsForModel &&
      jobPostingIdsForModel.length === 1
        ? jobPostingIdsForModel[0]
        : null;
    const effectiveJobPostingId =
      normalizedJobPostingId ?? implicitJobPostingId;
    const jobEntry =
      resolvedChatMode === JOBS_CHAT_MODE && effectiveJobPostingId
        ? await getJobPostingEntryById({ id: effectiveJobPostingId })
        : null;
    const jobKnowledge =
      resolvedChatMode === JOBS_CHAT_MODE && effectiveJobPostingId
        ? await getJobKnowledgeUnitById({
            id: effectiveJobPostingId,
            includeInactive: true,
          })
        : null;
    const jobContentRaw =
      typeof jobKnowledge?.retrievalText === "string" &&
      jobKnowledge.retrievalText.trim().length > 0
        ? jobKnowledge.retrievalText.trim()
        : typeof jobEntry?.content === "string"
          ? jobEntry.content.trim()
          : "";
    const hasJobPlaceholderContent =
      jobContentRaw.startsWith("Job posting uploaded") || jobContentRaw.length === 0;
    const hasThinJobContent = jobContentRaw.length > 0 && jobContentRaw.length < 900;
    let resolvedJobContent = jobContentRaw;

    const shouldExtractJobDocumentContent =
      !jobKnowledge &&
      (hasJobPlaceholderContent || hasThinJobContent) &&
      resolvedChatMode === JOBS_CHAT_MODE &&
      Boolean(jobEntry);
    if (shouldExtractJobDocumentContent && jobEntry) {
      try {
        const candidates = [
          jobEntry.pdfCachedUrl,
          jobEntry.pdfSourceUrl,
          jobEntry.sourceUrl,
        ]
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter((value) => value.length > 0);

        for (const url of candidates) {
          const mediaType = resolveDocumentMediaTypeFromUrl(url);
          if (!mediaType) {
            continue;
          }
          const parsed = await extractDocumentText(
            {
              name: jobEntry.title ?? "job-posting",
              url,
              mediaType,
            },
            { maxTextChars: JOBS_CONTEXT_MAX_CHARS }
          );
          const extracted = parsed.text.trim();
          if (extracted.length > 0) {
            resolvedJobContent = extracted;
            break;
          }
        }
      } catch (error) {
        console.warn("Failed to extract job posting content", error);
      }
    }

    const jobsContextText =
      resolvedJobContent.length > 0
        ? [
            "Job posting content:",
            resolvedJobContent.length > JOBS_CONTEXT_MAX_CHARS
              ? `${resolvedJobContent.slice(0, JOBS_CONTEXT_MAX_CHARS)}\n[Content truncated]`
              : resolvedJobContent,
          ].join("\n\n")
        : "";

    const studyPaperIdsForModel =
      resolvedChatMode === STUDY_CHAT_MODE || resolvedChatMode === JOBS_CHAT_MODE
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

    const jobsUserText =
      resolvedChatMode === JOBS_CHAT_MODE ? getTextFromMessage(message).trim() : "";
    const jobsIntent: JobsIntent | null =
      resolvedChatMode === JOBS_CHAT_MODE ? detectJobsIntent(jobsUserText) : null;
    const jobsDirectAnswerRequested =
      resolvedChatMode === JOBS_CHAT_MODE && jobsIntent === "answer_help"
        ? wantsDirectExamAnswer(jobsUserText)
        : false;
    const canUseSelectedJobPosting =
      resolvedChatMode !== JOBS_CHAT_MODE ||
      !effectiveJobPostingId ||
      (jobPostingIdsForModel ?? []).length === 0 ||
      (jobPostingIdsForModel ?? []).includes(effectiveJobPostingId);

    let jobsLinkedStudyPapers: QuestionPaperRecord[] = [];
    let jobsLinkedStudySource: "exact" | "exam_role" | "tags" | "none" = "none";
    let jobsLinkedStudyContextText = "";

    const shouldResolveJobStudyLinking =
      resolvedChatMode === JOBS_CHAT_MODE &&
      canUseSelectedJobPosting &&
      Boolean(effectiveJobPostingId) &&
      (jobsIntent === "exam_prep" || jobsIntent === "answer_help");

    if (shouldResolveJobStudyLinking && effectiveJobPostingId) {
      const linkResult = await listStudyPapersForJob({
        jobPostingId: effectiveJobPostingId,
        limit: 6,
      });
      const allowedStudyIds = new Set(studyPaperIdsForModel ?? []);
      const papersForModel =
        allowedStudyIds.size > 0
          ? linkResult.papers.filter((paper) => allowedStudyIds.has(paper.id))
          : linkResult.papers;

      jobsLinkedStudyPapers = papersForModel.slice(0, 4);
      jobsLinkedStudySource =
        jobsLinkedStudyPapers.length > 0 ? linkResult.source : "none";

      if (jobsLinkedStudyPapers.length > 0) {
        const maxPapers = Math.min(jobsLinkedStudyPapers.length, 3);
        const perPaperLimit = Math.max(
          Math.floor(JOBS_STUDY_CONTEXT_MAX_CHARS / Math.max(maxPapers, 1)),
          8_000
        );

        const blocks: string[] = [];
        for (const paper of jobsLinkedStudyPapers.slice(0, 3)) {
          const excerpt = await resolveStudyPaperContextText({
            paper,
            maxChars: perPaperLimit,
          });
          if (!excerpt) {
            continue;
          }

          blocks.push(
            [
              `Paper: ${paper.title}`,
              `Exam/Role/Year: ${paper.exam} / ${paper.role} / ${
                paper.year > 0 ? paper.year : "Unknown"
              }`,
              excerpt,
            ].join("\n")
          );
        }

        if (blocks.length > 0) {
          const mappedPapersSummary = jobsLinkedStudyPapers
            .slice(0, 4)
            .map((paper) =>
              `${paper.title} (${paper.exam} / ${paper.role}${
                paper.year > 0 ? ` / ${paper.year}` : ""
              })`
            )
            .join("\n- ");

          jobsLinkedStudyContextText = [
            "Matched study papers for the selected job:",
            `- ${mappedPapersSummary}`,
            "Use the following excerpts for exam-prep and answer-help requests:",
            blocks.join("\n\n---\n\n"),
          ].join("\n\n");
        }
      }
    }

    if (resolvedChatMode === JOBS_CHAT_MODE && !effectiveJobPostingId) {
      const { messages: jobsMessagesFromDb } = await getMessagesByChatIdPage({
        id,
        limit: CHAT_CONTEXT_MESSAGE_LIMIT,
      });
      const jobsUiMessagesFromDb = convertToUIMessages(jobsMessagesFromDb);
      const jobsHistoryMessages = jobsUiMessagesFromDb.map((entry) => ({
        ...entry,
        parts: entry.parts.filter((part) => part.type === "text"),
      }));

      const activeJobs = await listJobPostings({
        includeInactive: false,
        includeRagState: false,
      });
      const applyModelScope = (jobs: typeof activeJobs) =>
        (jobPostingIdsForModel ?? []).length > 0
          ? jobs.filter((job) => (jobPostingIdsForModel ?? []).includes(job.id))
          : jobs;

      const scopedActiveJobs = applyModelScope(activeJobs);
      let visibleJobs =
        scopedActiveJobs.length > 0 ? scopedActiveJobs : activeJobs;

      if (visibleJobs.length === 0) {
        const allJobs = await listJobPostings({
          includeInactive: true,
          includeRagState: false,
        });
        const scopedAllJobs = applyModelScope(allJobs);
        visibleJobs = scopedAllJobs.length > 0 ? scopedAllJobs : allJobs;
      }

      if (visibleJobs.length === 0) {
        return buildJobsResponse({
          text: "No Meghalaya jobs from the latest scrape are available yet. Please try again later.",
        });
      }

      const persistedJobsUiContext = readChatUiContext(persistedChatLastContext);
      const jobsPromptText =
        jobsUserText.length > 0 ? jobsUserText : "Show me relevant jobs.";
      if (isJobsMetaConversationQuery(jobsPromptText)) {
        const metaConversationResult = await generateText({
          model: resolveLanguageModel(modelConfig),
          ...(modelConfig.provider === "google" ? { maxRetries: 0 } : {}),
          system: [
            selectedLanguageSystemPrompt ?? "",
            "You are a modern conversational assistant inside Meghalaya Jobs mode.",
            "Reply naturally and briefly like a normal LLM assistant.",
            "Do not return job cards for greetings or meta conversation.",
            "You may mention that you can help search Meghalaya jobs by place, salary, qualification, deadline, or source when relevant.",
            "Always answer in the user's selected language unless the user explicitly asks for a different one.",
          ].join("\n"),
          messages: convertToModelMessages([
            ...jobsHistoryMessages,
            {
              ...message,
              parts: [{ type: "text", text: jobsPromptText }],
            },
          ]),
        });
        const metaUsage = metaConversationResult.usage as
          | {
              inputTokens?: number;
              outputTokens?: number;
              promptTokens?: number;
              completionTokens?: number;
            }
          | undefined;
        const metaInputTokens =
          typeof metaUsage?.inputTokens === "number"
            ? metaUsage.inputTokens
            : typeof metaUsage?.promptTokens === "number"
              ? metaUsage.promptTokens
              : 0;
        const metaOutputTokens =
          typeof metaUsage?.outputTokens === "number"
            ? metaUsage.outputTokens
            : typeof metaUsage?.completionTokens === "number"
              ? metaUsage.completionTokens
              : 0;
        if (metaInputTokens > 0 || metaOutputTokens > 0) {
          await recordTokenUsage({
            userId: session.user.id,
            chatId: id,
            modelConfigId: modelConfig.id,
            inputTokens: metaInputTokens,
            outputTokens: metaOutputTokens,
            deductCredits: hasActiveCredits,
          }).catch((tokenError) => {
            console.warn("[jobs-chat] failed to record meta conversation usage", {
              chatId: id,
              error:
                tokenError instanceof Error
                  ? tokenError.message
                  : String(tokenError),
            });
          });
        }

        return buildJobsResponse({
          text: sanitizeJobsAnswerText(metaConversationResult.text),
          cards: undefined,
          jobPostingIdOverride: null,
        });
      }
      const retrieval = retrieveJobsForConversation({
        query: jobsPromptText,
        jobs: visibleJobs,
        messages: jobsUiMessagesFromDb,
        persistedJobId: persistedJobsUiContext.jobPostingId,
        limit: 8,
      });

      await logJobRetrieval({
        chatId: id,
        userId: session.user.id,
        modelConfigId: modelConfig.id,
        modelKey: modelConfig.key,
        queryText: jobsPromptText,
        matches: retrieval.matches,
      });

      const singleRetrievedJobId =
        retrieval.cards.length === 1 ? retrieval.cards[0]?.id ?? null : null;
      const isDetailStyleJobsFollowUp =
        /\b(details?|detail|more about|overview|responsibilit(?:y|ies)|description|summary|information|info|tell me more|about that job|about this job|what(?:'s| is) the post|role)\b/i.test(
          jobsPromptText
        );
      const generateLocalizedJobsListingText = async () => {
        const listingCardsSummary =
          retrieval.cards.length > 0
            ? retrieval.cards
                .slice(0, 6)
                .map((card) =>
                  [
                    `Title: ${card.title}`,
                    `Company: ${card.company}`,
                    `Location: ${card.location}`,
                    card.salary ? `Salary: ${card.salary}` : "",
                    card.source ? `Source: ${card.source}` : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")
                )
                .join("\n")
            : "No job cards were returned.";

        const listingSummaryResult = await generateText({
          model: resolveLanguageModel(modelConfig),
          ...(modelConfig.provider === "google" ? { maxRetries: 0 } : {}),
          system: [
            selectedLanguageSystemPrompt ?? "",
            "You are summarizing Meghalaya job search results for a chat UI.",
            "Always answer in the user's selected language unless the user explicitly asks for another one.",
            "Keep the response concise, natural, and human.",
            "Do not translate or rewrite job titles, company names, source names, or locations from the result cards unless necessary.",
            "Do not mention internal retrieval, ranking, filtering, or system behavior.",
            "If there are no direct matches but statewide or all-district jobs are suggested, explain that naturally.",
            "Do not invent salary, location, or eligibility details.",
          ].join("\n"),
          messages: convertToModelMessages([
            ...jobsHistoryMessages,
            {
              ...message,
              parts: [
                {
                  type: "text",
                  text: [
                    `User request: ${jobsPromptText}`,
                    `Base retrieval summary: ${retrieval.answerText}`,
                    "Visible result cards:",
                    listingCardsSummary,
                  ].join("\n\n"),
                },
              ],
            },
          ]),
        });
        const listingUsage = listingSummaryResult.usage as
          | {
              inputTokens?: number;
              outputTokens?: number;
              promptTokens?: number;
              completionTokens?: number;
            }
          | undefined;
        const listingInputTokens =
          typeof listingUsage?.inputTokens === "number"
            ? listingUsage.inputTokens
            : typeof listingUsage?.promptTokens === "number"
              ? listingUsage.promptTokens
              : 0;
        const listingOutputTokens =
          typeof listingUsage?.outputTokens === "number"
            ? listingUsage.outputTokens
            : typeof listingUsage?.completionTokens === "number"
              ? listingUsage.completionTokens
              : 0;
        if (listingInputTokens > 0 || listingOutputTokens > 0) {
          await recordTokenUsage({
            userId: session.user.id,
            chatId: id,
            modelConfigId: modelConfig.id,
            inputTokens: listingInputTokens,
            outputTokens: listingOutputTokens,
            deductCredits: hasActiveCredits,
          }).catch((tokenError) => {
            console.warn("[jobs-chat] failed to record listing summary usage", {
              chatId: id,
              error:
                tokenError instanceof Error
                  ? tokenError.message
                  : String(tokenError),
            });
          });
        }

        return sanitizeJobsAnswerText(listingSummaryResult.text);
      };
      const shouldGenerateFollowUpAnswer =
        retrieval.conversationState.reason !== null &&
        retrieval.matches.length > 0 &&
        (
          isDetailStyleJobsFollowUp ||
          /\b(what|which|when|why|how|can|does|is|are|eligibility|qualification|salary|deadline|apply|experience|instructions|requirement)\b/i.test(
            jobsPromptText
          )
        );

      if (shouldGenerateFollowUpAnswer) {
        const knowledgeBlocks = retrieval.matches.slice(0, 3).map((match) =>
          [
            `Job: ${match.job.title}`,
            `Company: ${match.job.company}`,
            `Location: ${match.job.location}`,
            match.knowledge.retrievalText,
          ].join("\n")
        );
        const followUpPrompt: ChatMessage = {
          ...message,
          parts: [
            {
              type: "text",
              text: [
                `User request: ${jobsPromptText}`,
                "Use only the retrieved job knowledge below.",
                knowledgeBlocks.join("\n\n---\n\n"),
              ].join("\n\n"),
            },
          ],
        };

        const followUpResult = await generateText({
          model: resolveLanguageModel(modelConfig),
          ...(modelConfig.provider === "google" ? { maxRetries: 0 } : {}),
          system: [
            selectedLanguageSystemPrompt ?? "",
            "You are answering a jobs question from retrieved Meghalaya job knowledge.",
            "Use only the provided job knowledge.",
            "If a requested detail is missing, say the listing does not mention it.",
            "Do not mention retrieval, search, or internal ranking.",
            "Format the answer in concise Markdown.",
            "Always answer in the user's selected language unless the user explicitly asks for a different one.",
          ].join("\n"),
          messages: convertToModelMessages([
            ...jobsHistoryMessages,
            followUpPrompt,
          ]),
        });
        const followUpUsage = followUpResult.usage as
          | {
              inputTokens?: number;
              outputTokens?: number;
              promptTokens?: number;
              completionTokens?: number;
            }
          | undefined;
        const followUpInputTokens =
          typeof followUpUsage?.inputTokens === "number"
            ? followUpUsage.inputTokens
            : typeof followUpUsage?.promptTokens === "number"
              ? followUpUsage.promptTokens
              : 0;
        const followUpOutputTokens =
          typeof followUpUsage?.outputTokens === "number"
            ? followUpUsage.outputTokens
            : typeof followUpUsage?.completionTokens === "number"
              ? followUpUsage.completionTokens
              : 0;
        if (followUpInputTokens > 0 || followUpOutputTokens > 0) {
          await recordTokenUsage({
            userId: session.user.id,
            chatId: id,
            modelConfigId: modelConfig.id,
            inputTokens: followUpInputTokens,
            outputTokens: followUpOutputTokens,
            deductCredits: hasActiveCredits,
          }).catch((tokenError) => {
            console.warn("[jobs-chat] failed to record retrieval follow-up usage", {
              chatId: id,
              error:
                tokenError instanceof Error
                  ? tokenError.message
                  : String(tokenError),
            });
          });
        }

        return buildJobsResponse({
          text: sanitizeJobsAnswerText(followUpResult.text),
          cards:
            singleRetrievedJobId !== null && isDetailStyleJobsFollowUp
              ? undefined
              : retrieval.cards.slice(0, 6),
          jobPostingIdOverride: singleRetrievedJobId,
        });
      }

      const localizedListingText = await generateLocalizedJobsListingText().catch(
        (error) => {
          console.warn("[jobs-chat] localized_listing_summary_failed", {
            chatId: id,
            error: error instanceof Error ? error.message : String(error),
          });
          return retrieval.answerText;
        }
      );

      return buildJobsResponse({
        text: localizedListingText,
        cards: retrieval.cards.slice(0, 12),
        jobPostingIdOverride: singleRetrievedJobId,
      });
    }

    if (resolvedChatMode === JOBS_CHAT_MODE && effectiveJobPostingId) {
      if (!jobEntry) {
        return new ChatSDKError(
          "not_found:chat",
          "Job posting not found or unavailable."
        ).toResponse();
      }
    }

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

    const { messages: messagesFromDb } = await getMessagesByChatIdPage({
      id,
      limit: CHAT_CONTEXT_MESSAGE_LIMIT,
    });
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
    if (resolvedChatMode === JOBS_CHAT_MODE && jobsIntent === "exam_prep") {
      if (jobsLinkedStudyPapers.length > 0) {
        const linkedTitles = jobsLinkedStudyPapers
          .slice(0, 4)
          .map(
            (paper) =>
              `${paper.title} (${paper.exam} / ${paper.role}${
                paper.year > 0 ? ` / ${paper.year}` : ""
              })`
          )
          .join("\n- ");
        modelParts = [
          ...modelParts,
          {
            type: "text" as const,
            text: [
              "Use these matched study papers while answering exam-prep requests:",
              `- ${linkedTitles}`,
            ].join("\n"),
          },
        ];
      } else {
        modelParts = [
          ...modelParts,
          {
            type: "text" as const,
            text: [
              "No matched study paper was found for this selected job.",
              "Provide model-generated expected exam questions and clearly label the output as model-generated guidance.",
            ].join("\n"),
          },
        ];
      }
    }
    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    const languageSystemPrompt =
      typeof resolvedLanguageConfig?.systemPrompt === "string" &&
      resolvedLanguageConfig.systemPrompt.trim().length > 0
        ? resolvedLanguageConfig.systemPrompt.trim()
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
      resolvedChatMode === JOBS_CHAT_MODE
        ? "You are in Jobs mode. Use only the retrieved job knowledge and selected job posting context as the source for eligibility, responsibilities, requirements, salary, location, and important dates."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE
        ? "Format job responses in clean Markdown with clear sections (for example: Overview, Eligibility, Salary, Location, Important dates) and consistent bullet points."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE
        ? "When job details are missing, respond naturally (for example: The listing does not mention salary details) instead of replying with only: I don't know."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE && effectiveJobPostingId
        ? "Answer using the selected job posting knowledge unit. If a detail is not present in the posting, clearly say the listing does not mention it instead of guessing."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE && jobsIntent === "exam_prep"
        ? "The user is asking exam-prep questions for the selected job. Prefer matched study papers as the source for expected question types, preparation topics, and exam strategy."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE &&
      jobsIntent === "exam_prep" &&
      jobsLinkedStudySource === "none"
        ? "No matched study papers were found for this job. Provide model-generated exam guidance and clearly state that the suggestions are model-generated."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE && jobsIntent === "answer_help"
        ? "The user is asking for answer help. Use a cautious tutoring style: explain reasoning first, then provide a direct final answer only when explicitly requested and confidence is high."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE &&
      jobsIntent === "answer_help" &&
      jobsDirectAnswerRequested
        ? "The user explicitly asked for a direct answer. Provide the answer first only if confidence is high, then add a short explanation."
        : "",
      resolvedChatMode === JOBS_CHAT_MODE &&
      jobsIntent === "answer_help" &&
      !jobsDirectAnswerRequested
        ? "Do not jump straight to final answers. Start with explanation, steps, and checks."
        : "",
    ].filter(Boolean);
    const systemInstruction =
      systemInstructionParts.length > 0
        ? systemInstructionParts.join("\n\n")
        : null;

    const escapeFilterValue = (value: string) =>
      value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

    const fileSearchStoreName = getGeminiFileSearchStoreName();
    const geminiFileSearchModelId = resolveGeminiFileSearchModelId(
      modelConfig.provider === "google" ? modelConfig.providerModelId : null,
      process.env.RAG_GEMINI_MODEL_ID,
      process.env.GEMINI_FILE_SEARCH_MODEL_ID,
      resolvedChatMode === JOBS_CHAT_MODE
        ? process.env.JOBS_RAG_GEMINI_MODEL_ID
        : null
    );
    const allowModeSpecificFileSearch =
      resolvedChatMode === STUDY_CHAT_MODE || resolvedChatMode === JOBS_CHAT_MODE;
    const canUseGeminiFileSearch =
      (customKnowledgeEnabled || allowModeSpecificFileSearch) &&
      typeof fileSearchStoreName === "string" &&
      supportsGeminiFileSearchModel(geminiFileSearchModelId);

    const activeEntryIds = canUseGeminiFileSearch
      ? resolvedChatMode === STUDY_CHAT_MODE
        ? studyPaperIdsForModel ?? []
        : resolvedChatMode === JOBS_CHAT_MODE
          ? Array.from(
              new Set([
                ...(jobPostingIdsForModel ?? []),
                ...(studyPaperIdsForModel ?? []),
              ])
            )
        : await listActiveRagEntryIdsForModel({
            modelConfigId: modelConfig.id,
            modelKey: modelConfig.key,
          })
      : [];
    const jobsLinkedStudyPaperIds =
      resolvedChatMode === JOBS_CHAT_MODE &&
      (jobsIntent === "exam_prep" || jobsIntent === "answer_help")
        ? jobsLinkedStudyPapers.map((paper) => paper.id)
        : [];
    const filteredEntryIds =
      resolvedChatMode === STUDY_CHAT_MODE
        ? effectiveStudyPaperId
          ? [effectiveStudyPaperId]
          : []
        : resolvedChatMode === JOBS_CHAT_MODE
          ? effectiveJobPostingId
            ? Array.from(
                new Set([effectiveJobPostingId, ...jobsLinkedStudyPaperIds])
              )
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
          modelId: geminiFileSearchModelId,
          storeName: geminiFileSearchStoreName,
          metadataFilter,
        })
      : resolveLanguageModel(modelConfig);

    if (
      useGeminiFileSearch &&
      modelConfig.provider === "google" &&
      geminiFileSearchModelId === modelConfig.providerModelId &&
      modelConfig.supportsReasoning &&
      modelConfig.reasoningTag
    ) {
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
    const shouldAttachJobsContext =
      jobsContextText &&
      (!useGeminiFileSearch || jobEntry?.embeddingStatus !== "ready");
    const jobsLinkedStudyEmbeddingsReady =
      jobsLinkedStudyPapers.length > 0 &&
      jobsLinkedStudyPapers.every((paper) => paper.embeddingStatus === "ready");
    const shouldAttachJobsLinkedStudyContext =
      jobsLinkedStudyContextText &&
      (!useGeminiFileSearch || !jobsLinkedStudyEmbeddingsReady);

    if (shouldAttachStudyContext) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: studyContextText,
        },
      ];
    }
    if (shouldAttachJobsContext) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: jobsContextText,
        },
      ];
    }
    if (shouldAttachJobsLinkedStudyContext) {
      modelParts = [
        ...modelParts,
        {
          type: "text" as const,
          text: jobsLinkedStudyContextText,
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
          const nextContext = mergeChatUiContext({
            currentContext: persistedChatLastContext,
            usageContext: usage,
            uiContext: {
              jobPostingId:
                resolvedChatMode === JOBS_CHAT_MODE
                  ? effectiveJobPostingId ?? null
                  : null,
              studyPaperId:
                resolvedChatMode === STUDY_CHAT_MODE
                  ? effectiveStudyPaperId ?? null
                  : null,
            },
          });
          await updateChatLastContextById({
            chatId: id,
            context: nextContext,
          });
          persistedChatLastContext = nextContext;
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
    };

    let usageReportPromise: Promise<void> | null = null;
    const queueUsageReport = (
      usage: LanguageModelUsage,
      { persistContext }: { persistContext: boolean }
    ) => {
      if (!usageReportPromise) {
        usageReportPromise = handleUsageReport(usage, { persistContext })
          .catch((error) => {
            if (error instanceof ChatSDKError) {
              console.warn(
                "Unable to record usage due to chat sdk error",
                { chatId: id },
                error
              );
              return;
            }
            console.warn("Unable to handle usage report", { chatId: id }, error);
          })
          .finally(() => {
            resolveUsageReady?.();
          });
      }

      return usageReportPromise;
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
        void (async () => {
          await persistAssistantSnapshot(latestStepResult ?? undefined);
          void queueUsageReport(latestStepUsage, { persistContext: false });
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

        void (async () => {
          try {
            await persistAssistantSnapshot(undefined, partialText);
            await recordUsageReport(fallbackUsage, { persistContext: false });
          } catch (error) {
            console.warn(
              "Unable to persist fallback usage report",
              { chatId: id },
              error
            );
          } finally {
            resolveUsageReady?.();
          }
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
      onFinish: ({ usage }) => {
        void queueUsageReport(usage, { persistContext: !clientAborted });
      },
      onStepFinish: (stepResult) => {
        latestStepUsage = stepResult?.usage ?? null;
        latestStepResult = stepResult ?? null;
      },
      onAbort: ({ steps }) => {
        if (clientAbortHandled) {
          return;
        }
        void (async () => {
          const lastStep = steps.at(-1);
          await persistAssistantSnapshot(lastStep);
          const usage = lastStep?.usage ?? latestStepUsage;
          if (!usage) {
            resolveUsageReady?.();
            return;
          }
          void queueUsageReport(usage, { persistContext: !clientAborted });
        })();
      },
    });

    result.usage
      .then((usage) => {
        if (!usageRecorded && usage) {
          void queueUsageReport(usage, { persistContext: !clientAborted });
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

        if (!finalMergedUsage && !usageReportPromise) {
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
