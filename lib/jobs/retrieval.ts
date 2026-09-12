import "server-only";

import { db } from "@/lib/db/queries";
import { ragRetrievalLog } from "@/lib/db/schema";
import { DEFAULT_JOB_LOCATION } from "@/lib/jobs/location";
import type { ChatMessage } from "@/lib/types";
import { buildJobKnowledgeUnit, type JobKnowledgeUnit } from "./knowledge";
import { toJobCard } from "./service";
import type { JobCard, JobPostingRecord } from "./types";

const DEFAULT_RETRIEVAL_LIMIT = 8;
const FOLLOW_UP_REFERENCE_PATTERN =
  /\b(this job|that job|this one|that one|same job|selected job|its|it|the job)\b/i;
const ORDINAL_REFERENCE_PATTERNS = [
  { index: 0, pattern: /\b(?:first|1st)\b/i },
  { index: 1, pattern: /\b(?:second|2nd)\b/i },
  { index: 2, pattern: /\b(?:third|3rd)\b/i },
  { index: -1, pattern: /\b(?:last|latest)\b/i },
] as const;
let jobsRetrievalLoggingUnavailable = false;

type RetrievalHistoryCard = Pick<
  JobCard,
  "id" | "title" | "company" | "location" | "salary" | "source" | "sourceUrl"
>;

export type JobsConversationState = {
  anchoredJobId: string | null;
  candidateJobIds: string[];
  reason:
    | "ambiguous"
    | "persisted"
    | "ordinal"
    | "named"
    | "follow_up"
    | "query_reference"
    | null;
};

export type JobRetrievalMatch = {
  job: JobPostingRecord;
  knowledge: JobKnowledgeUnit;
  score: number;
  signalScore: number;
  reasons: string[];
};

export type JobRetrievalResult = {
  queryText: string;
  conversationState: JobsConversationState;
  matches: JobRetrievalMatch[];
  answerText: string;
  cards: JobCard[];
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isMissingRetrievalLogTableError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /relation\s+"?RagRetrievalLog"?\s+does not exist/i.test(message);
}

function normalizeComparableText(value: string | null | undefined) {
  return normalizeWhitespace((value ?? "").toLowerCase())
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toDisplayLocation(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMessageText(message: ChatMessage) {
  return message.parts
    .filter((part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
      part.type === "text"
    )
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function extractJobCardsFromMessage(message: ChatMessage): RetrievalHistoryCard[] {
  const jobCards = message.parts
    .filter(
      (
        part
      ): part is Extract<
        (typeof message.parts)[number],
        { type: "data-jobCards" }
      > => part.type === "data-jobCards"
    )
    .flatMap((part) =>
      Array.isArray(part.data?.jobs) ? (part.data.jobs as RetrievalHistoryCard[]) : []
    );

  return jobCards.filter(
    (card) => typeof card?.id === "string" && card.id.trim().length > 0
  );
}

function buildAssistantJobCardHistory(messages: ChatMessage[]) {
  return messages
    .filter((message) => message.role === "assistant")
    .map((message) => ({
      cards: extractJobCardsFromMessage(message),
    }))
    .filter((entry) => entry.cards.length > 0);
}

function isFreshJobsSearchQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (FOLLOW_UP_REFERENCE_PATTERN.test(normalized)) {
    return false;
  }

  return (
    /\b(any jobs?|jobs? in|jobs? around|jobs? from|show me|list|find|search|vacanc(?:y|ies)|openings?|roles?)\b/i.test(
      normalized
    ) ||
    /\b(government jobs?|private jobs?|jobs? around|jobs? near|jobs? under|jobs? with salary)\b/i.test(
      normalized
    )
  );
}

export function isJobsMetaConversationQuery(query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return [
    /\bwho are you\b/,
    /\bwhat can you do\b/,
    /\bhow can you help\b/,
    /\bhelp me\b/,
    /^(hi|hello|hey)\b/,
    /\bhow are you\b/,
    /\bthank you\b/,
    /\bthanks\b/,
  ].some((pattern) => pattern.test(normalized));
}

function queryRequestsOtherSources(query: string) {
  return /\b(other|different)\s+sources?\b/i.test(query);
}

function getSourceKey({
  source,
  sourceUrl,
}: {
  source?: string | null;
  sourceUrl?: string | null;
}) {
  const normalizedSource = normalizeComparableText(source);
  if (normalizedSource) {
    return normalizedSource;
  }

  const rawUrl = sourceUrl?.trim() ?? "";
  if (!rawUrl) {
    return "";
  }

  try {
    return normalizeComparableText(new URL(rawUrl).hostname.replace(/^www\./i, ""));
  } catch {
    return normalizeComparableText(rawUrl);
  }
}

function findExplicitReferencedCard({
  query,
  cards,
}: {
  query: string;
  cards: RetrievalHistoryCard[];
}) {
  const normalizedQuery = normalizeComparableText(query);
  if (!normalizedQuery || cards.length === 0) {
    return null;
  }

  let best:
    | {
        id: string;
        score: number;
      }
    | null = null;

  for (const card of cards) {
    const title = normalizeComparableText(card.title);
    const company = normalizeComparableText(card.company);
    const location = normalizeComparableText(card.location);
    const source = normalizeComparableText(card.source ?? "");
    let score = 0;

    if (title && normalizedQuery.includes(title)) {
      score += 500;
    } else if (title) {
      const titleTokens = title.split(" ").filter(Boolean);
      const matchedTitleTokens = titleTokens.filter(
        (token) => token.length >= 4 && normalizedQuery.includes(token)
      );
      if (matchedTitleTokens.length >= 3) {
        score += 220 + matchedTitleTokens.length * 20;
      }
    }

    if (company && normalizedQuery.includes(company)) {
      score += 180;
    }

    if (source && normalizedQuery.includes(source)) {
      score += 140;
    }

    if (location && normalizedQuery.includes(location)) {
      score += 60;
    }

    if (!best || score > best.score) {
      best = {
        id: card.id,
        score,
      };
    }
  }

  return best && best.score >= 160 ? best.id : null;
}

function tokenizeSearchText(value: string) {
  return Array.from(
    new Set(
      normalizeWhitespace(value.toLowerCase())
        .match(/[a-z0-9]{2,}/g)
        ?.filter(
          (token) =>
            ![
              "the",
              "this",
              "that",
              "those",
              "these",
              "with",
              "jobs",
              "job",
              "show",
              "find",
              "give",
              "list",
              "which",
              "what",
              "about",
              "there",
              "from",
              "into",
              "your",
            ].includes(token)
        ) ?? []
    )
  );
}

function extractHistoryHints(messages: ChatMessage[]) {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map(getMessageText)
    .filter(Boolean);
  return userTexts.slice(-3);
}

function resolveConversationState({
  query,
  messages,
  persistedJobId,
}: {
  query: string;
  messages: ChatMessage[];
  persistedJobId: string | null;
}): JobsConversationState {
  const normalizedQuery = query.trim().toLowerCase();
  const assistantHistory = buildAssistantJobCardHistory(messages);
  const latestCardBatch = assistantHistory.at(-1)?.cards ?? [];

  const explicitReferencedCardId = findExplicitReferencedCard({
    query,
    cards: latestCardBatch,
  });
  if (explicitReferencedCardId) {
    return {
      anchoredJobId: explicitReferencedCardId,
      candidateJobIds: latestCardBatch.map((card) => card.id),
      reason: "query_reference",
    };
  }

  for (const rule of ORDINAL_REFERENCE_PATTERNS) {
    if (!rule.pattern.test(normalizedQuery) || latestCardBatch.length === 0) {
      continue;
    }
    const resolvedIndex =
      rule.index === -1 ? latestCardBatch.length - 1 : rule.index;
    const selected = latestCardBatch[resolvedIndex];
    if (selected?.id) {
      return {
        anchoredJobId: selected.id,
        candidateJobIds: latestCardBatch.map((card) => card.id),
        reason: "ordinal",
      };
    }
  }

  for (const card of latestCardBatch) {
    const title = card.title.trim().toLowerCase();
    const company = card.company.trim().toLowerCase();
    if (
      (title && normalizedQuery.includes(title)) ||
      (company && normalizedQuery.includes(company))
    ) {
      return {
        anchoredJobId: card.id,
        candidateJobIds: latestCardBatch.map((entry) => entry.id),
        reason: "named",
      };
    }
  }

  if (FOLLOW_UP_REFERENCE_PATTERN.test(normalizedQuery) && persistedJobId) {
    return {
      anchoredJobId: persistedJobId,
      candidateJobIds: latestCardBatch.map((card) => card.id),
      reason: "follow_up",
    };
  }

  if (FOLLOW_UP_REFERENCE_PATTERN.test(normalizedQuery) && latestCardBatch.length === 1) {
    return {
      anchoredJobId: latestCardBatch[0]?.id ?? null,
      candidateJobIds: latestCardBatch.map((card) => card.id),
      reason: "follow_up",
    };
  }

  if (FOLLOW_UP_REFERENCE_PATTERN.test(normalizedQuery) && latestCardBatch.length > 1) {
    return {
      anchoredJobId: null,
      candidateJobIds: latestCardBatch.map((card) => card.id),
      reason: "ambiguous",
    };
  }

  if (isFreshJobsSearchQuery(normalizedQuery)) {
    return {
      anchoredJobId: null,
      candidateJobIds: latestCardBatch.map((card) => card.id),
      reason: null,
    };
  }

  return {
    anchoredJobId: persistedJobId,
    candidateJobIds: latestCardBatch.map((card) => card.id),
    reason: persistedJobId ? "persisted" : null,
  };
}

function getRequestedMonth(query: string, referenceDate: Date) {
  const normalized = query.toLowerCase();
  if (/\bnext month\b/.test(normalized)) {
    const month = (referenceDate.getMonth() + 1) % 12;
    const year =
      month === 0 ? referenceDate.getFullYear() + 1 : referenceDate.getFullYear();
    return { month, year };
  }

  const monthEntries = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const matchedIndex = monthEntries.findIndex((month) => normalized.includes(month));
  if (matchedIndex < 0) {
    return null;
  }

  const currentMonth = referenceDate.getMonth();
  const currentYear = referenceDate.getFullYear();
  return {
    month: matchedIndex,
    year: matchedIndex < currentMonth ? currentYear + 1 : currentYear,
  };
}

function queryMentionsSalary(query: string) {
  return /\b(salary|pay|stipend|ctc|emoluments?|remuneration)\b/i.test(query);
}

function queryMentionsGovernment(query: string) {
  return /\b(government|govt|public sector|psu)\b/i.test(query);
}

function queryMentionsQualification(query: string) {
  return /\b(qualification|eligibility|requirement|requirements|education)\b/i.test(
    query
  );
}

function queryMentionsDeadline(query: string) {
  return /\b(last date|deadline|closing date|apply before|last day)\b/i.test(query);
}

function extractLocationTerm(query: string, jobs: JobPostingRecord[]) {
  const normalized = query.toLowerCase();
  const locations = Array.from(
    new Set(
      jobs
        .map((job) => job.location.trim())
        .filter(Boolean)
        .sort((left, right) => right.length - left.length)
    )
  );

  for (const location of locations) {
    if (normalized.includes(location.toLowerCase())) {
      return location;
    }
  }

  const inferredMatch = normalized.match(
    /\b(?:jobs?\s+(?:in|around|near|from)|openings?\s+in|vacanc(?:y|ies)\s+in)\s+([a-z][a-z\s-]{1,40})/i
  );
  if (inferredMatch?.[1]) {
    const raw = inferredMatch[1]
      .replace(/\b(?:with|around|near|salary|pay|stipend|ctc|source|sources)\b.*$/i, "")
      .trim();
    if (raw) {
      return toDisplayLocation(raw);
    }
  }

  return null;
}

function knowledgeMatchesRequestedLocation(
  knowledge: JobKnowledgeUnit,
  requestedLocation: string
) {
  const normalizedRequestedLocation = requestedLocation.trim().toLowerCase();
  if (!normalizedRequestedLocation) {
    return false;
  }

  if (knowledge.location.toLowerCase().includes(normalizedRequestedLocation)) {
    return true;
  }

  return knowledge.locationEntries.some((entry) =>
    entry.location.trim().toLowerCase().includes(normalizedRequestedLocation)
  );
}

function isAllDistrictsJob(knowledge: JobKnowledgeUnit) {
  if (knowledge.location.trim().toLowerCase() === "all districts") {
    return true;
  }

  return knowledge.locationEntries.some(
    (entry) => entry.location.trim().toLowerCase() === "all districts"
  );
}

function buildAllDistrictFallbackText({
  requestedLocation,
  cards,
}: {
  requestedLocation: string;
  cards: JobCard[];
}) {
  if (cards.length === 1) {
    return `I couldn't find any current jobs specifically in ${requestedLocation}, but this all-districts job may still apply there.`;
  }

  return `I couldn't find any current jobs specifically in ${requestedLocation}, but these all-districts jobs may still apply there.`;
}

function parseSalaryAnchorValues(value: string) {
  const normalized = value.toLowerCase();
  const directMatches = Array.from(
    normalized.matchAll(/\b\d[\d,]{2,}\b/g),
    (match) => Number.parseInt(match[0].replace(/,/g, ""), 10)
  ).filter((amount) => Number.isFinite(amount) && amount >= 1_000 && amount <= 10_000_000);

  const compactMatches = Array.from(
    normalized.matchAll(/\b(\d+(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|lacs)\b/g),
    (match) => {
      const base = Number.parseFloat(match[1]);
      const unit = match[2];
      if (!Number.isFinite(base)) {
        return null;
      }
      if (unit === "k" || unit === "thousand") {
        return Math.round(base * 1_000);
      }
      return Math.round(base * 100_000);
    }
  ).filter((amount): amount is number => Boolean(amount && amount >= 1_000));

  return Array.from(new Set([...directMatches, ...compactMatches]));
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

  if (/\b(?:around|about|near|approx(?:imately)?|close to)\b/.test(normalized)) {
    const tolerance = Math.max(2_000, Math.round(firstValue * 0.25));
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

  if (
    /\b(?:salary|pay|stipend|ctc|remuneration|emoluments?)\b/.test(normalized) ||
    amountValues.length === 1
  ) {
    const tolerance = Math.max(2_000, Math.round(firstValue * 0.25));
    return {
      min: Math.max(0, firstValue - tolerance),
      max: firstValue + tolerance,
    };
  }

  return null;
}

function knowledgeMatchesSalaryRange(
  knowledge: JobKnowledgeUnit,
  salaryRange: { min: number; max: number }
) {
  const salaryAnchors = parseSalaryAnchorValues(
    [knowledge.salary ?? "", ...knowledge.salaryEntries.map((entry) => entry.salary)].join(" ")
  );
  if (salaryAnchors.length === 0) {
    return false;
  }

  const min = Math.min(...salaryAnchors);
  const max = Math.max(...salaryAnchors);
  return max >= salaryRange.min && min <= salaryRange.max;
}

function scoreJob({
  knowledge,
  job,
  query,
  historyHints,
  state,
  referenceDate,
  requestedLocation,
  requestedSalaryRange,
}: {
  knowledge: JobKnowledgeUnit;
  job: JobPostingRecord;
  query: string;
  historyHints: string[];
  state: JobsConversationState;
  referenceDate: Date;
  requestedLocation: string | null;
  requestedSalaryRange: { min: number; max: number } | null;
}) {
  let score = 0;
  let signalScore = 0;
  const reasons: string[] = [];
  const lowerSearchText = knowledge.searchText.toLowerCase();
  const queryTokens = tokenizeSearchText([query, ...historyHints].join(" "));

  if (state.anchoredJobId && state.anchoredJobId === knowledge.jobId) {
    score += 400;
    signalScore += 400;
    reasons.push("conversation-anchor");
  }

  if (
    state.candidateJobIds.length > 0 &&
    state.candidateJobIds.includes(knowledge.jobId)
  ) {
    score += 60;
    signalScore += 60;
    reasons.push("recent-job-cards");
  }

  if (
    requestedLocation &&
    knowledge.location.toLowerCase().includes(requestedLocation.toLowerCase())
  ) {
    score += 160;
    signalScore += 160;
    reasons.push("location");
  }

  if (queryMentionsGovernment(query) && knowledge.sector === "government") {
    score += 140;
    signalScore += 140;
    reasons.push("government");
  }

  if (queryMentionsSalary(query) && knowledge.hasSalary) {
    score += 120;
    signalScore += 120;
    reasons.push("salary");
  }

  if (requestedSalaryRange && knowledgeMatchesSalaryRange(knowledge, requestedSalaryRange)) {
    score += 220;
    signalScore += 220;
    reasons.push("salary-range");
  }

  if (queryMentionsQualification(query) && knowledge.facts.qualification) {
    score += 100;
    signalScore += 100;
    reasons.push("qualification");
  }

  if (queryMentionsDeadline(query) && knowledge.dates.applicationLastDateLabel) {
    score += 100;
    signalScore += 100;
    reasons.push("deadline");
  }

  const requestedMonth = getRequestedMonth(query, referenceDate);
  if (
    requestedMonth &&
    knowledge.dates.applicationLastDateTimestamp !== null
  ) {
    const deadline = new Date(knowledge.dates.applicationLastDateTimestamp);
    if (
      deadline.getUTCMonth() === requestedMonth.month &&
      deadline.getUTCFullYear() === requestedMonth.year
    ) {
      score += 180;
      signalScore += 180;
      reasons.push("deadline-month");
    }
  }

  for (const token of queryTokens) {
    if (!token) {
      continue;
    }

    if (lowerSearchText.includes(token)) {
      score += 12;
      signalScore += 12;
    }
    if (job.title.toLowerCase().includes(token)) {
      score += 24;
      signalScore += 24;
    }
    if (job.company.toLowerCase().includes(token)) {
      score += 16;
      signalScore += 16;
    }
    if (knowledge.location.toLowerCase().includes(token)) {
      score += 16;
      signalScore += 16;
    }
  }

  const daysOld = Math.max(
    0,
    Math.floor((referenceDate.getTime() - job.createdAt.getTime()) / (24 * 60 * 60 * 1000))
  );
  score += Math.max(0, 18 - Math.min(daysOld, 18));

  if (!knowledge.location || knowledge.location === DEFAULT_JOB_LOCATION) {
    score -= 4;
  }

  return {
    score,
    signalScore,
    reasons: Array.from(new Set(reasons)),
  };
}

function buildSummaryText({
  query,
  cards,
  matches,
  requestedLocation,
  conversationState,
}: {
  query: string;
  cards: JobCard[];
  matches: JobRetrievalMatch[];
  requestedLocation: string | null;
  conversationState: JobsConversationState;
}) {
  if (conversationState.reason === "ambiguous") {
    const count = conversationState.candidateJobIds.length;
    return `Which job do you mean? I found ${count} job${count === 1 ? "" : "s"} in the previous result. Use Ask on a card or paste the exact title.`;
  }

  if (cards.length === 0) {
    if (conversationState.reason !== null) {
      return "I couldn't resolve which previously shown job you meant. Please use Ask on the card or paste the exact title again.";
    }
    if (requestedLocation) {
      return `I couldn't find any current jobs for ${requestedLocation}.`;
    }
    if (queryMentionsGovernment(query)) {
      return "I couldn't find any matching government jobs right now.";
    }
    if (queryMentionsSalary(query)) {
      return "I couldn't find any matching jobs that clearly mention salary right now.";
    }
    if (queryMentionsDeadline(query)) {
      return "I couldn't find any jobs matching that deadline request right now.";
    }
    return "I couldn't find matching jobs in the current listings.";
  }

  if (cards.length === 1) {
    const first = cards[0];
    const match = matches[0];
    const dateLabel =
      match?.knowledge.dates.applicationLastDateLabel ?? "not mentioned";
    const salary = first.salary ?? "not mentioned";

    if (queryMentionsQualification(query)) {
      const qualification =
        match?.knowledge.facts.qualification ??
        match?.knowledge.facts.eligibility ??
        "not mentioned";
      return `${first.title} at ${first.company} requires ${qualification}.`;
    }

    if (queryMentionsDeadline(query)) {
      return `${first.title} at ${first.company} has a last date to apply of ${dateLabel}.`;
    }

    if (queryMentionsSalary(query)) {
      if (salary === "not mentioned") {
        return `The listing does not mention salary for ${first.title} at ${first.company}.`;
      }
      return `${first.title} at ${first.company} mentions salary: ${salary}.`;
    }

    return `I found 1 matching job: ${first.title} at ${first.company}.`;
  }

  if (queryMentionsGovernment(query)) {
    return `I found ${cards.length} government job${cards.length === 1 ? "" : "s"}.`;
  }
  if (queryMentionsSalary(query)) {
    return `I found ${cards.length} job${cards.length === 1 ? "" : "s"} that mention salary.`;
  }
  if (queryMentionsQualification(query)) {
    return `I found ${cards.length} job${cards.length === 1 ? "" : "s"} with relevant qualification details.`;
  }
  if (queryMentionsDeadline(query)) {
    return `I found ${cards.length} job${cards.length === 1 ? "" : "s"} matching that last-date request.`;
  }
  if (requestedLocation) {
    return `I found ${cards.length} job${cards.length === 1 ? "" : "s"} in ${requestedLocation}.`;
  }

  return `I found ${cards.length} relevant job${cards.length === 1 ? "" : "s"}.`;
}

export async function logJobRetrieval({
  chatId,
  userId,
  modelConfigId,
  modelKey,
  queryText,
  matches,
}: {
  chatId: string;
  userId: string;
  modelConfigId: string;
  modelKey: string;
  queryText: string;
  matches: JobRetrievalMatch[];
}) {
  if (matches.length === 0 || jobsRetrievalLoggingUnavailable) {
    return;
  }

  try {
    await db.insert(ragRetrievalLog).values(
      matches.slice(0, 8).map((match) => ({
        ragEntryId: match.job.id,
        chatId,
        modelConfigId,
        modelKey,
        userId,
        score: match.score,
        queryText,
        applied: true,
        metadata: {
          retriever: "jobs-hybrid-v2",
          reasons: match.reasons,
          jobs_kind: "job_posting",
        },
      }))
    );
  } catch (error) {
    if (isMissingRetrievalLogTableError(error)) {
      jobsRetrievalLoggingUnavailable = true;
      return;
    }
    console.warn("[jobs-retrieval] failed to persist retrieval log", {
      chatId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function retrieveJobsForConversation({
  query,
  jobs,
  messages,
  persistedJobId,
  limit = DEFAULT_RETRIEVAL_LIMIT,
  referenceDate = new Date(),
}: {
  query: string;
  jobs: JobPostingRecord[];
  messages: ChatMessage[];
  persistedJobId: string | null;
  limit?: number;
  referenceDate?: Date;
}): JobRetrievalResult {
  const latestCardBatch = buildAssistantJobCardHistory(messages).at(-1)?.cards ?? [];
  const state = resolveConversationState({
    query,
    messages,
    persistedJobId,
  });
  const historyHints = extractHistoryHints(messages);
  const requestedLocation = extractLocationTerm(query, jobs);
  const requestedSalaryRange = findRequestedSalaryRange(query);
  const normalizedLimit = Math.max(1, Math.min(limit, 12));
  const isDirectReferenceResolution =
    state.reason !== null && state.reason !== "ambiguous";
  const queryTokens = tokenizeSearchText(query);
  const hasFreshSearchIntent = isFreshJobsSearchQuery(query);
  const hasSearchConstraints = Boolean(
    requestedLocation ||
      requestedSalaryRange ||
      queryMentionsGovernment(query) ||
      queryMentionsQualification(query) ||
      queryMentionsDeadline(query) ||
      queryMentionsSalary(query) ||
      queryTokens.length > 0 ||
      hasFreshSearchIntent
  );
  const excludedSourceKeys = queryRequestsOtherSources(query)
    ? new Set(
        latestCardBatch
          .map((card) =>
            getSourceKey({
              source: card.source,
              sourceUrl: card.sourceUrl,
            })
          )
          .filter(Boolean)
      )
    : new Set<string>();

  const visibleJobs = state.anchoredJobId
    ? jobs.filter((job) => job.id === state.anchoredJobId)
    : state.reason === "ambiguous"
      ? jobs.filter((job) => state.candidateJobIds.includes(job.id))
      : state.candidateJobIds.length > 0 &&
          /\b(which one|which job|that one|this one|among these|among them)\b/i.test(query)
        ? jobs.filter((job) => state.candidateJobIds.includes(job.id))
        : jobs;

  if (state.reason === "ambiguous") {
    const cards = visibleJobs.map((job) => toJobCard(job)).slice(0, normalizedLimit);
    return {
      queryText: query,
      conversationState: state,
      matches: [],
      answerText: buildSummaryText({
        query,
        cards,
        matches: [],
        requestedLocation,
        conversationState: state,
      }),
      cards,
    };
  }

  const matches = visibleJobs
    .filter((job) => {
      if (excludedSourceKeys.size === 0) {
        return true;
      }
      const sourceKey = getSourceKey({
        source: job.source,
        sourceUrl: job.sourceUrl,
      });
      return !sourceKey || !excludedSourceKeys.has(sourceKey);
    })
    .map((job) => {
      const knowledge = buildJobKnowledgeUnit(job);
      const scored = scoreJob({
        knowledge,
        job,
        query,
        historyHints,
        state,
        referenceDate,
        requestedLocation,
        requestedSalaryRange,
      });

      return {
        job,
        knowledge,
        score: scored.score,
        signalScore: scored.signalScore,
        reasons: scored.reasons,
      };
    })
    .filter((match) => match.score > 0)
    .filter((match) => {
      if (!isDirectReferenceResolution && hasSearchConstraints) {
        return match.signalScore > 0;
      }
      return true;
    })
    .filter((match) => {
      if (!isDirectReferenceResolution && requestedLocation) {
        return knowledgeMatchesRequestedLocation(
          match.knowledge,
          requestedLocation
        );
      }
      return true;
    })
    .filter((match) => {
      if (!isDirectReferenceResolution && requestedSalaryRange) {
        return knowledgeMatchesSalaryRange(match.knowledge, requestedSalaryRange);
      }
      if (!isDirectReferenceResolution && queryMentionsSalary(query)) {
        return match.knowledge.hasSalary;
      }
      return true;
    })
    .sort((left, right) => {
      if (left.score !== right.score) {
        return right.score - left.score;
      }
      return right.job.createdAt.getTime() - left.job.createdAt.getTime();
    })
    .slice(0, normalizedLimit);

  if (
    matches.length === 0 &&
    requestedLocation &&
    !isDirectReferenceResolution
  ) {
    const allDistrictMatches = visibleJobs
      .map((job) => {
        const knowledge = buildJobKnowledgeUnit(job);
        return {
          job,
          knowledge,
        };
      })
      .filter((match) => isAllDistrictsJob(match.knowledge))
      .filter((match) => {
        if (excludedSourceKeys.size > 0) {
          const sourceKey = getSourceKey({
            source: match.job.source,
            sourceUrl: match.job.sourceUrl,
          });
          if (sourceKey && excludedSourceKeys.has(sourceKey)) {
            return false;
          }
        }
        if (requestedSalaryRange) {
          return knowledgeMatchesSalaryRange(match.knowledge, requestedSalaryRange);
        }
        if (queryMentionsSalary(query)) {
          return match.knowledge.hasSalary;
        }
        if (queryMentionsGovernment(query)) {
          return match.knowledge.sector === "government";
        }
        if (queryMentionsQualification(query)) {
          return Boolean(match.knowledge.facts.qualification);
        }
        if (queryMentionsDeadline(query)) {
          return Boolean(match.knowledge.dates.applicationLastDateLabel);
        }
        return true;
      })
      .sort(
        (left, right) =>
          right.job.createdAt.getTime() - left.job.createdAt.getTime()
      )
      .slice(0, normalizedLimit)
      .map((match) => ({
        ...match,
        score: 0,
        signalScore: 0,
        reasons: ["all-districts-fallback"],
      }));

    if (allDistrictMatches.length > 0) {
      const fallbackCards = allDistrictMatches.map((match) => toJobCard(match.job));
      return {
        queryText: query,
        conversationState: state,
        matches: allDistrictMatches,
        answerText: buildAllDistrictFallbackText({
          requestedLocation,
          cards: fallbackCards,
        }),
        cards: fallbackCards,
      };
    }
  }

  const cards = matches.map((match) => toJobCard(match.job));

  return {
    queryText: query,
    conversationState: state,
    matches,
    answerText: buildSummaryText({
      query,
      cards,
      matches,
      requestedLocation,
      conversationState: state,
    }),
    cards,
  };
}
