import {
  type FeatureAccessMode,
  parseFeatureAccessMode,
} from "@/lib/feature-access";
import type { ChatMessage } from "@/lib/types";

export const NEWS_CHAT_MODE = "news" as const;
export const NEWS_ACCESS_MODE_FALLBACK: FeatureAccessMode = "admin_only";

export function parseNewsAccessModeSetting(value: unknown): FeatureAccessMode {
  return parseFeatureAccessMode(value, NEWS_ACCESS_MODE_FALLBACK);
}

const NEWS_FOLLOW_UP_SEARCH_PATTERNS = [
  /\b(?:any\s+)?updates?(?:\s+since\s+then)?\b/i,
  /\b(?:tell|show|give)\s+me\s+more\b/i,
  /\bmore\s+(?:about|details?|information)\b/i,
  /\b(?:first|second|third|fourth|fifth|last|that|this)\s+(?:story|headline|report|item)\b/i,
  /\bwhat(?:'s|\s+is)\s+happening\b/i,
  /\b(?:new|latest|breaking)\s+(?:developments?|headlines?|reports?)\b/i,
];

export function buildNewsInitialPrompt(now = new Date()) {
  const requestDate = new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeZone: "Asia/Kolkata",
  }).format(now);

  return [
    `Find and summarize the latest important news as of ${requestDate}.`,
    "Use current web search results; do not answer from stored knowledge alone.",
    "Prioritize Shillong first, then major developments across Meghalaya, and then nearby regional stories only when they are important to Meghalaya.",
    "Prefer reports published today, then the last few days. Clearly label older background and do not present stale stories as current.",
    "Prefer established Meghalaya outlets, official government, police or administration sources, and recognized regional or national news organizations.",
    "Deduplicate reports about the same event and cross-check major stories when multiple reliable sources are available.",
    "If there are no recent Shillong-specific reports, say so briefly and continue with the most important current Meghalaya stories.",
    "Make the response easy to scan with short sections for Shillong and Meghalaya, concise numbered headlines, summaries, and source citations.",
    "Begin directly with the news. Do not introduce or describe KhasiGPT, the app, its team, origin, mission, or capabilities unless the user explicitly asks about them.",
    "Respond in the user's configured chat language.",
  ].join("\n");
}

export function formatNewsRequestDate(value?: Date | string | null) {
  const parsedDate = value instanceof Date ? value : value ? new Date(value) : new Date();
  const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

export function buildNewsChatTitle(
  languageCode: string | null | undefined,
  now = new Date()
) {
  const normalizedLanguage = languageCode?.trim().toLowerCase() ?? "";
  const isKhasi = normalizedLanguage === "kha" || normalizedLanguage === "khasi";
  const date = formatNewsRequestDate(now);
  return `${isKhasi ? "Khubor" : "Today's news"} — ${date}`;
}

export function isNewsInitialMessage(
  message: Pick<ChatMessage, "parts"> | { parts?: ChatMessage["parts"] }
) {
  return Array.isArray(message.parts) && message.parts.some(
    (part) => part.type === "data-newsInitial" && part.data?.hidden === true
  );
}

export function shouldStartNewsInitialRequest({
  chatId,
  chatMode,
  initialMessageCount,
  isReadonly,
  lastStartedChatId,
  status,
}: {
  chatId: string;
  chatMode: "default" | "study" | "jobs" | "news";
  initialMessageCount: number;
  isReadonly: boolean;
  lastStartedChatId: string | null;
  status: string;
}) {
  return (
    chatMode === NEWS_CHAT_MODE &&
    !isReadonly &&
    initialMessageCount === 0 &&
    status === "ready" &&
    lastStartedChatId !== chatId
  );
}

export function shouldSearchNewsFollowUp(text: string) {
  const normalized = text.trim();
  return (
    normalized.length > 0 &&
    NEWS_FOLLOW_UP_SEARCH_PATTERNS.some((pattern) => pattern.test(normalized))
  );
}
