import crypto from "node:crypto";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const RELATIVE_DATE_PATTERN =
  /\b(?:(\d{1,2})\s+(minute|hour|day|week|month|year)s?\s+ago|yesterday|today|just now)\b/i;

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
] as const;

const MEGHALAYA_LOCATION_KEYWORDS = [
  "meghalaya",
  "shillong",
  "tura",
  "jowai",
  "east khasi hills",
] as const;

type PdfStructuredFields = {
  salary: string | null;
  eligibility: string | null;
  instructions: string | null;
  applicationLastDate: string | null;
  notificationDate: string | null;
};

const DATE_PATTERN =
  "(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{2,4})";

const BLOCKED_PAGE_HINTS = [
  "captcha",
  "access denied",
  "temporarily unavailable",
  "request blocked",
  "unusual traffic",
  "cloudflare",
  "forbidden",
  "bot detected",
];

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function parsePositiveInt(
  rawValue: string | number | undefined,
  fallback: number,
  min = 1
) {
  const parsed =
    typeof rawValue === "number"
      ? rawValue
      : typeof rawValue === "string"
        ? Number.parseInt(rawValue, 10)
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return Math.trunc(parsed);
}

export function parseBoolean(
  rawValue: string | boolean | undefined,
  fallback: boolean
) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }
  if (typeof rawValue !== "string") {
    return fallback;
  }
  const normalized = rawValue.trim().toLowerCase();
  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }
  return fallback;
}

export function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeMultiline(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function truncateText(value: string, maxChars: number) {
  if (!(Number.isFinite(maxChars) && maxChars > 0)) {
    return value;
  }
  if (value.length <= maxChars) {
    return value;
  }
  return value.slice(0, maxChars);
}

export function hashText(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function resolveUrl(baseUrl: string, value: string | null | undefined) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

export function hostnameFromUrl(value: string | null | undefined) {
  if (!value) {
    return "";
  }
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function isPdfUrl(value: string | null | undefined) {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    return parsed.pathname.toLowerCase().includes(".pdf");
  } catch {
    return false;
  }
}

export function parseRetryAfterMs(value: string | null, fallbackMs: number) {
  if (!value) {
    return fallbackMs;
  }
  const trimmed = value.trim();
  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return fallbackMs;
}

export function looksBlockedHtml(html: string) {
  const normalized = normalizeWhitespace(html).toLowerCase();
  return BLOCKED_PAGE_HINTS.some((hint) => normalized.includes(hint));
}

function monthIndexFromText(value: string) {
  const normalized = value.trim().toLowerCase().slice(0, 3);
  return MONTHS.indexOf(normalized as (typeof MONTHS)[number]);
}

function parseMonthTextDate(value: string, now: Date) {
  const match = value.match(
    /\b(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{2,4})\b|\b([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{2,4})\b/
  );
  if (!match) {
    return null;
  }

  const day = match[1] ? Number.parseInt(match[1], 10) : Number.parseInt(match[5], 10);
  const month = match[2] ?? match[4] ?? "";
  const year = match[3] ? Number.parseInt(match[3], 10) : Number.parseInt(match[6], 10);
  if (!Number.isFinite(day) || !Number.isFinite(year)) {
    return null;
  }

  const monthIdx = monthIndexFromText(month);
  if (monthIdx < 0) {
    return null;
  }

  const fullYear = year < 100 ? 2000 + year : year;
  const parsed = new Date(Date.UTC(fullYear, monthIdx, day, 12, 0, 0));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  if (parsed.getTime() - now.getTime() > DAY_IN_MS) {
    return null;
  }
  return parsed;
}

function parseRelativeDate(value: string, now: Date) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes("just now") || normalized.includes("today")) {
    return now;
  }
  if (normalized.includes("yesterday")) {
    return new Date(now.getTime() - DAY_IN_MS);
  }

  const match = normalized.match(RELATIVE_DATE_PATTERN);
  if (!match || !match[1] || !match[2]) {
    return null;
  }

  const amount = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const unitMs =
    unit === "minute"
      ? 60 * 1000
      : unit === "hour"
        ? 60 * 60 * 1000
        : unit === "day"
          ? DAY_IN_MS
          : unit === "week"
            ? 7 * DAY_IN_MS
            : unit === "month"
              ? 30 * DAY_IN_MS
              : 365 * DAY_IN_MS;
  return new Date(now.getTime() - amount * unitMs);
}

export function parsePublishedDate(value: string, now: Date) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return null;
  }

  const relative = parseRelativeDate(normalized, now);
  if (relative) {
    return relative;
  }

  const parsedNative = new Date(normalized);
  if (!Number.isNaN(parsedNative.getTime())) {
    if (parsedNative.getTime() - now.getTime() <= DAY_IN_MS) {
      return parsedNative;
    }
  }

  const monthText = parseMonthTextDate(normalized, now);
  if (monthText) {
    return monthText;
  }

  const numericMatch = normalized.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (!numericMatch) {
    return null;
  }

  const first = Number.parseInt(numericMatch[1], 10);
  const second = Number.parseInt(numericMatch[2], 10);
  const rawYear = Number.parseInt(numericMatch[3], 10);
  if (!Number.isFinite(first) || !Number.isFinite(second) || !Number.isFinite(rawYear)) {
    return null;
  }

  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  const day = first > 12 ? first : second;
  const month = first > 12 ? second - 1 : first - 1;
  const parsed = new Date(Date.UTC(year, month, day, 12, 0, 0));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  if (parsed.getTime() - now.getTime() > DAY_IN_MS) {
    return null;
  }
  return parsed;
}

export function isWithinLookback(date: Date, lookbackDays: number, now: Date) {
  const threshold = now.getTime() - Math.max(1, lookbackDays) * DAY_IN_MS;
  return date.getTime() >= threshold && date.getTime() <= now.getTime() + DAY_IN_MS;
}

export function isMeghalayaLocation(text: string) {
  const normalized = normalizeWhitespace(text).toLowerCase();
  if (!normalized) {
    return false;
  }
  return MEGHALAYA_LOCATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function normalizedKeywordText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseKeywordList(value: string | undefined, fallback: readonly string[]) {
  if (!value) {
    return [...fallback];
  }
  const parsed = value
    .split(",")
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

export function matchKeywords(text: string, keywords: string[]) {
  const normalizedText = normalizedKeywordText(text);
  if (!normalizedText) {
    return [];
  }
  const padded = ` ${normalizedText} `;
  const matches: string[] = [];
  for (const keyword of keywords) {
    const normalizedKeyword = normalizedKeywordText(keyword);
    if (!normalizedKeyword) {
      continue;
    }
    if (padded.includes(` ${normalizedKeyword} `)) {
      matches.push(keyword);
    }
  }
  return matches;
}

function extractFieldByLabels(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(
      `(?:${escaped})\\s*[:\\-]?\\s*([^\\n\\r]{3,220})`,
      "i"
    );
    const match = text.match(expression);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }
  return null;
}

function extractDateByLabels(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`${escaped}[^\\n\\r]{0,120}?(${DATE_PATTERN})`, "i");
    const match = text.match(expression);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }
  return null;
}

export function extractSalaryText(text: string) {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return null;
  }
  const fromLabel = extractFieldByLabels(normalized, [
    "salary",
    "pay scale",
    "remuneration",
    "emoluments",
    "consolidated pay",
  ]);
  if (fromLabel) {
    return fromLabel;
  }

  const currencyMatch = normalized.match(
    /((?:₹|rs\.?|inr)\s?\d[\d,]*(?:\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s?\d[\d,]*)?(?:\s*(?:per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?))?)/i
  );
  if (currencyMatch?.[1]) {
    return normalizeWhitespace(currencyMatch[1]);
  }
  if (/\bas per norms\b/i.test(normalized)) {
    return "As per norms";
  }
  return null;
}

export function extractPdfStructuredFields(rawText: string): PdfStructuredFields {
  const text = normalizeWhitespace(rawText);
  if (!text) {
    return {
      salary: null,
      eligibility: null,
      instructions: null,
      applicationLastDate: null,
      notificationDate: null,
    };
  }
  return {
    salary: extractSalaryText(text),
    eligibility: extractFieldByLabels(text, [
      "eligibility",
      "essential qualification",
      "educational qualification",
      "qualification",
      "education",
    ]),
    instructions: extractFieldByLabels(text, [
      "instructions",
      "how to apply",
      "application procedure",
      "important instructions",
    ]),
    applicationLastDate: extractDateByLabels(text, [
      "last date",
      "deadline",
      "closing date",
      "application last date",
      "apply before",
    ]),
    notificationDate: extractDateByLabels(text, [
      "notification date",
      "advertisement date",
      "published on",
      "date of issue",
      "issue date",
    ]),
  };
}

export function countPdfStructuredFields(fields: PdfStructuredFields) {
  return Object.values(fields).filter((value) => Boolean(value)).length;
}

export function buildDescriptionFromSources({
  title,
  company,
  location,
  applicationLink,
  sourcePageUrl,
  webText,
  pdfText,
  pdfFields,
  maxChars,
}: {
  title: string;
  company: string;
  location: string;
  applicationLink: string;
  sourcePageUrl: string;
  webText: string;
  pdfText: string | null;
  pdfFields: PdfStructuredFields | null;
  maxChars: number;
}) {
  const sections: string[] = [];
  sections.push(
    normalizeMultiline(
      [
        `Title: ${title}`,
        `Company: ${company}`,
        `Location: ${location}`,
        `Application Link: ${applicationLink}`,
        `Source Page: ${sourcePageUrl}`,
      ].join("\n")
    )
  );

  const normalizedWebText = normalizeMultiline(webText);
  if (normalizedWebText) {
    sections.push(`Web Content:\n${normalizedWebText}`);
  }

  if (pdfFields) {
    const extracted: string[] = [];
    if (pdfFields.salary) {
      extracted.push(`Salary: ${pdfFields.salary}`);
    }
    if (pdfFields.eligibility) {
      extracted.push(`Eligibility: ${pdfFields.eligibility}`);
    }
    if (pdfFields.instructions) {
      extracted.push(`Instructions: ${pdfFields.instructions}`);
    }
    if (pdfFields.applicationLastDate) {
      extracted.push(`Application Last Date: ${pdfFields.applicationLastDate}`);
    }
    if (pdfFields.notificationDate) {
      extracted.push(`Notification Date: ${pdfFields.notificationDate}`);
    }
    if (extracted.length > 0) {
      sections.push(`Extracted Details:\n${extracted.join("\n")}`);
    }
  }

  if (pdfText) {
    sections.push(`PDF Content:\n${normalizeMultiline(pdfText)}`);
  }

  return truncateText(normalizeMultiline(sections.join("\n\n")), maxChars);
}

export async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  if (items.length === 0) {
    return;
  }

  const maxConcurrency = Math.max(1, Math.trunc(concurrency));
  let cursor = 0;

  const runners = Array.from({
    length: Math.min(maxConcurrency, items.length),
  }).map(async () => {
    while (true) {
      const index = cursor;
      if (index >= items.length) {
        return;
      }
      cursor += 1;
      await worker(items[index], index);
    }
  });

  await Promise.all(runners);
}

