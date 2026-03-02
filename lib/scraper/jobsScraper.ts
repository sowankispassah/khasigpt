import "server-only";
import { load } from "cheerio";
import {
  jobSources,
  type JobSourceConfig,
  type JobSourceLocationScope,
} from "@/config/jobSources";
import { cacheJobPdfAsset } from "@/lib/jobs/pdf-cache";
import { type NewJobRow, saveJobs } from "@/lib/jobs/saveJobs";
import { extractDocumentText } from "@/lib/uploads/document-parser";
import { fetchWithTimeout } from "@/lib/utils/async";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_LOOKBACK_DAYS = 10;
const DEFAULT_MAX_ITEMS_PER_SOURCE = 200;
const DEFAULT_MAX_PDF_ENRICHMENTS_PER_SOURCE = 5;
const DEFAULT_PDF_EXTRACT_MAX_TEXT_CHARS = 6_000;
const DEFAULT_FETCH_RETRY_ATTEMPTS = 2;
const MAX_JOB_DESCRIPTION_CHARS = 12_000;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const MEGHALAYA_LOCATION_KEYWORDS = [
  "meghalaya",
  "shillong",
  "tura",
  "jowai",
  "east khasi hills",
] as const;

const DEFAULT_JOB_FILTER_INCLUDE_KEYWORDS = [
  "recruitment",
  "recruit",
  "job",
  "jobs",
  "hiring",
  "vacancy",
  "vacancies",
  "position",
  "positions",
  "post",
  "posts",
  "walk-in",
  "walk in",
  "apply now",
  "career opportunity",
] as const;

const DEFAULT_JOB_FILTER_EXCLUDE_KEYWORDS = [
  "tender",
  "rfq",
  "rfp",
  "eoi",
  "expression of interest",
  "corrigendum",
  "shortlisted",
  "short list",
  "result",
  "results",
  "interview result",
  "notice of award",
  "award of contract",
  "cancellation notice",
  "clarification",
  "pre-bid",
  "bid",
  "quotation",
  "procurement",
] as const;

const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type CheerioRoot = ReturnType<typeof load>;
type CheerioSelection = ReturnType<CheerioRoot>;
type CheerioNode = ReturnType<CheerioSelection["toArray"]>[number];

export type SourceScrapeStats = {
  source: string;
  fetched: boolean;
  containersScanned: number;
  extracted: number;
  filteredByLocation: number;
  filteredByDate: number;
  filteredByKeyword: number;
  parseErrors: number;
  pdfDetailAttempts: number;
  pdfDetailSuccesses: number;
  pdfDetailFailures: number;
  pdfFieldsExtracted: number;
  errorMessage?: string;
};

export type ScrapeJobsResult = {
  jobs: NewJobRow[];
  summary: {
    sourcesProcessed: number;
    totalSources: number;
    lookbackDays: number;
    totalExtracted: number;
    totalFilteredByLocation: number;
    totalFilteredByDate: number;
    totalFilteredByKeyword: number;
    totalDuplicatesInRun: number;
    cancelled: boolean;
    sourceStats: SourceScrapeStats[];
  };
};

export type RunJobsScraperResult = ScrapeJobsResult & {
  persisted: {
    attemptedCount: number;
    insertedCount: number;
    updatedCount: number;
    skippedDuplicateCount: number;
  };
};

export type JobsScraperRuntimeOptions = {
  lookbackDays?: number;
  shouldCancel?: () => boolean | Promise<boolean>;
  onSourceStart?: (event: {
    source: string;
    sourceIndex: number;
    totalSources: number;
    lookbackDays: number;
  }) => void | Promise<void>;
  onSourceComplete?: (event: {
    source: string;
    sourceIndex: number;
    totalSources: number;
    lookbackDays: number;
    stats: SourceScrapeStats;
  }) => void | Promise<void>;
};

function parsePositiveInt(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergeDescriptionText(primary: string, secondary: string) {
  const first = normalizeMultilineText(primary);
  const second = normalizeMultilineText(secondary);

  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }

  const firstNormalized = normalizeWhitespace(first).toLowerCase();
  const secondNormalized = normalizeWhitespace(second).toLowerCase();
  if (!firstNormalized) {
    return second;
  }
  if (!secondNormalized) {
    return first;
  }
  if (secondNormalized.includes(firstNormalized)) {
    return second;
  }
  if (firstNormalized.includes(secondNormalized)) {
    return first;
  }

  return `${first}\n\n${second}`;
}

function normalizeForKeywordMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseKeywordListFromEnv({
  envValue,
  fallback,
}: {
  envValue: string | undefined;
  fallback: readonly string[];
}) {
  if (!envValue) {
    return [...fallback];
  }

  const parsed = envValue
    .split(",")
    .map((value) => normalizeWhitespace(value))
    .filter((value) => value.length > 0);

  if (parsed.length === 0) {
    return [...fallback];
  }

  return parsed;
}

function findMatchedKeywords(text: string, keywords: string[]) {
  const normalizedText = normalizeForKeywordMatch(text);
  if (!normalizedText) {
    return [];
  }

  const padded = ` ${normalizedText} `;
  const matches: string[] = [];

  for (const keyword of keywords) {
    const normalizedKeyword = normalizeForKeywordMatch(keyword);
    if (!normalizedKeyword) {
      continue;
    }

    if (padded.includes(` ${normalizedKeyword} `)) {
      matches.push(keyword);
    }
  }

  return matches;
}

function containsAnyKeyword(text: string, keywords: string[]) {
  return findMatchedKeywords(text, keywords).length > 0;
}

type ExtractedPdfFields = {
  salary: string | null;
  applicationLastDate: string | null;
  notificationDate: string | null;
};

const INLINE_DATE_PATTERN =
  "(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})";

function extractDateByKeywords(text: string, keywords: string[]) {
  for (const keyword of keywords) {
    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(
      `${escapedKeyword}[^\\n\\r]{0,100}?(${INLINE_DATE_PATTERN})`,
      "i"
    );
    const match = text.match(expression);
    if (match?.[1]) {
      return normalizeWhitespace(match[1]);
    }
  }
  return null;
}

function extractSalaryFromText(text: string) {
  const labelled = text.match(
    /(?:salary|pay\s*scale|remuneration|consolidated\s*pay|emoluments?)\s*[:\-]?\s*([^\n\r.;]{3,120})/i
  );
  if (labelled?.[1]) {
    return normalizeWhitespace(labelled[1]);
  }

  const currency = text.match(
    /((?:₹|rs\.?|inr)\s?\d[\d,]*(?:\s*(?:-|to)\s*(?:₹|rs\.?|inr)?\s?\d[\d,]*)?(?:\s*(?:per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?))?)/i
  );
  if (currency?.[1]) {
    return normalizeWhitespace(currency[1]);
  }

  if (/\bas per norms\b/i.test(text)) {
    return "As per norms";
  }

  return null;
}

function extractStructuredFieldsFromPdfText(text: string): ExtractedPdfFields {
  const normalized = normalizeWhitespace(text);
  if (!normalized) {
    return {
      salary: null,
      applicationLastDate: null,
      notificationDate: null,
    };
  }

  const applicationLastDate = extractDateByKeywords(normalized, [
    "last date",
    "last date of receipt",
    "closing date",
    "application deadline",
    "submission deadline",
    "apply before",
    "deadline",
  ]);

  const notificationDate = extractDateByKeywords(normalized, [
    "notification date",
    "date of notification",
    "advertisement date",
    "date of publication",
    "published on",
    "issue date",
    "date of issue",
  ]);

  return {
    salary: extractSalaryFromText(normalized),
    applicationLastDate,
    notificationDate,
  };
}

function buildPdfDerivedDetailsLines(fields: ExtractedPdfFields) {
  const lines: string[] = [];
  if (fields.salary) {
    lines.push(`Salary: ${fields.salary}`);
  }
  if (fields.applicationLastDate) {
    lines.push(`Application Last Date: ${fields.applicationLastDate}`);
  }
  if (fields.notificationDate) {
    lines.push(`Notification Date: ${fields.notificationDate}`);
  }
  return lines;
}

function classifyJobIntent({
  title,
  description,
  sourceUrl,
  sourcePageUrl,
  includeKeywords,
  excludeKeywords,
}: {
  title: string;
  description: string;
  sourceUrl: string;
  sourcePageUrl: string;
  includeKeywords: string[];
  excludeKeywords: string[];
}) {
  const signalText = [title, description, sourceUrl].filter(Boolean).join(" ");
  const matchedExclude = findMatchedKeywords(signalText, excludeKeywords);
  if (matchedExclude.length > 0) {
    return {
      isJobRelated: false,
      matchedInclude: [] as string[],
      matchedExclude,
      reason: "exclude_keyword_match",
    };
  }

  const sourceHost = hostnameFromUrl(sourcePageUrl);
  const sourceUrlHost = hostnameFromUrl(sourceUrl);
  const sourcePath = (() => {
    try {
      return new URL(sourceUrl).pathname.toLowerCase();
    } catch {
      return "";
    }
  })();
  const looksLikeLinkedInJob =
    (isLinkedInHost(sourceHost) || isLinkedInHost(sourceUrlHost)) &&
    (sourcePath.includes("/jobs/view") || sourcePath.includes("/jobs/search"));
  if (looksLikeLinkedInJob) {
    return {
      isJobRelated: true,
      matchedInclude: ["linkedin_job_url"],
      matchedExclude: [] as string[],
      reason: "trusted_linkedin_job_url",
    };
  }

  const matchedInclude = findMatchedKeywords(signalText, includeKeywords);
  if (matchedInclude.length > 0) {
    return {
      isJobRelated: true,
      matchedInclude,
      matchedExclude: [] as string[],
      reason: "include_keyword_match",
    };
  }

  return {
    isJobRelated: false,
    matchedInclude: [] as string[],
    matchedExclude: [] as string[],
    reason: "missing_include_keyword",
  };
}

function safeText(
  container: CheerioSelection,
  selector: string
) {
  if (!selector.trim()) {
    return "";
  }
  try {
    return normalizeWhitespace(container.find(selector).first().text());
  } catch (error) {
    console.warn("[jobs-scraper] invalid_selector_text", {
      selector,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

function safeAttr(
  container: CheerioSelection,
  selector: string,
  attr: string
) {
  if (!selector.trim()) {
    return "";
  }
  try {
    const value = container.find(selector).first().attr(attr);
    return typeof value === "string" ? value.trim() : "";
  } catch (error) {
    console.warn("[jobs-scraper] invalid_selector_attr", {
      selector,
      attr,
      error: error instanceof Error ? error.message : String(error),
    });
    return "";
  }
}

function resolveSourceUrl(baseUrl: string, href: string) {
  if (!href.trim()) {
    return "";
  }
  try {
    const resolved = new URL(href, baseUrl);

    // Canonicalize links so tracking query params don't create false duplicates.
    resolved.search = "";
    resolved.hash = "";

    return resolved.toString();
  } catch {
    return "";
  }
}

function hostnameFromUrl(url: string) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLinkedInHost(hostname: string) {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

function isGovernmentHost(hostname: string) {
  return hostname.endsWith(".gov.in") || hostname.endsWith(".gov");
}

function isPdfUrl(url: string) {
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith(".pdf") || pathname.includes(".pdf");
  } catch {
    return false;
  }
}

function shouldAttemptPdfEnrichment({
  sourcePageUrl,
  sourceUrl,
}: {
  sourcePageUrl: string;
  sourceUrl: string;
}) {
  const sourceHost = hostnameFromUrl(sourcePageUrl);
  const jobHost = hostnameFromUrl(sourceUrl);

  if (isLinkedInHost(sourceHost) || isLinkedInHost(jobHost)) {
    return false;
  }
  if (isPdfUrl(sourceUrl)) {
    return true;
  }
  if (isGovernmentHost(sourceHost) || isGovernmentHost(jobHost)) {
    return true;
  }

  return false;
}

function extractPdfCandidatesFromHtml(baseUrl: string, html: string) {
  const $ = load(html);
  const candidates = new Map<string, number>();

  const addCandidate = (hrefRaw: string, contextText: string) => {
    const resolved = resolveSourceUrl(baseUrl, hrefRaw);
    if (!resolved || !isPdfUrl(resolved)) {
      return;
    }

    let score = 1;
    const normalizedContext = contextText.toLowerCase();
    if (
      /advertisement|recruit|vacanc|job|tor|application|shortlist|result/.test(
        normalizedContext
      )
    ) {
      score += 4;
    }
    if (/mbda|meghalaya/.test(normalizedContext)) {
      score += 2;
    }

    const previousScore = candidates.get(resolved) ?? 0;
    candidates.set(resolved, Math.max(previousScore, score));
  };

  $("a[href]").each((_, node) => {
    const element = $(node);
    addCandidate(
      element.attr("href") ?? "",
      `${element.text()} ${element.attr("title") ?? ""}`
    );
  });

  $("iframe[src], embed[src], object[data]").each((_, node) => {
    const element = $(node);
    const src =
      element.attr("src") ??
      element.attr("data") ??
      "";
    addCandidate(src, `${element.attr("title") ?? ""} ${element.attr("class") ?? ""}`);
  });

  return Array.from(candidates.entries())
    .sort((left, right) => right[1] - left[1])
    .map(([url]) => url);
}

async function fetchHtmlForPdfDiscovery(url: string, timeoutMs: number) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        headers: {
          "user-agent": SCRAPER_USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      },
      timeoutMs
    );

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      return null;
    }

    return await response.text();
  } catch {
    return null;
  }
}

function extractDetailTextFromHtml(html: string) {
  const $ = load(html);
  $("script, style, noscript, svg, nav, footer, header").remove();

  const candidates = [
    "main",
    "article",
    ".job-description",
    ".job-details",
    ".entry-content",
    ".node-content",
    ".field-item",
    ".content",
    ".post-content",
  ];

  let best = "";
  for (const selector of candidates) {
    let text = "";
    try {
      text = normalizeMultilineText($(selector).first().text());
    } catch {
      text = "";
    }
    if (text.length > best.length) {
      best = text;
    }
  }

  if (best.length >= 120) {
    return best;
  }

  return normalizeMultilineText($("body").text());
}

function isRetryableFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }
  const message = error.message.toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("network")
  );
}

async function fetchSourceHtmlWithRetry({
  url,
  timeoutMs,
  retryAttempts,
}: {
  url: string;
  timeoutMs: number;
  retryAttempts: number;
}) {
  let lastError: unknown = null;
  const attempts = Math.max(1, retryAttempts);

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          headers: {
            "user-agent": SCRAPER_USER_AGENT,
            accept: "text/html,application/xhtml+xml",
          },
        },
        timeoutMs
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} while fetching source.`);
      }

      return await response.text();
    } catch (error) {
      lastError = error;
      const retrying = attempt < attempts && isRetryableFetchError(error);
      console.warn("[jobs-scraper] source_fetch_attempt_failed", {
        url,
        attempt,
        retrying,
        error: error instanceof Error ? error.message : String(error),
      });
      if (!retrying) {
        break;
      }
      await sleep(250 * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function extractTextFromPdfUrl(pdfUrl: string, maxChars: number) {
  try {
    const parsed = await extractDocumentText(
      {
        name: "job-details.pdf",
        url: pdfUrl,
        mediaType: "application/pdf",
      },
      {
        maxTextChars: maxChars,
        downloadTimeoutMs: 25_000,
      }
    );
    return normalizeMultilineText(parsed.text);
  } catch (error) {
    console.warn("[jobs-scraper] pdf_extract_failed", {
      pdfUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function enrichDescriptionFromPdf({
  sourcePageUrl,
  sourceUrl,
  fallbackDescription,
  timeoutMs,
  maxPdfTextChars,
  pdfUrlCache,
  includePdfText,
}: {
  sourcePageUrl: string;
  sourceUrl: string;
  fallbackDescription: string;
  timeoutMs: number;
  maxPdfTextChars: number;
  pdfUrlCache: Map<string, string | null>;
  includePdfText: boolean;
}) {
  if (
    !shouldAttemptPdfEnrichment({
      sourcePageUrl,
      sourceUrl,
    })
  ) {
    return {
      description: fallbackDescription,
      pdfSourceUrl: null,
      pdfCachedUrl: null,
      attempted: false,
      success: false,
      fieldsExtractedCount: 0,
    };
  }

  const pdfCandidates: string[] = [];
  let detailPageText = "";
  if (isPdfUrl(sourceUrl)) {
    pdfCandidates.push(sourceUrl);
  } else {
    const detailHtml = await fetchHtmlForPdfDiscovery(sourceUrl, timeoutMs);
    if (detailHtml) {
      pdfCandidates.push(...extractPdfCandidatesFromHtml(sourceUrl, detailHtml));
      detailPageText = extractDetailTextFromHtml(detailHtml);
    }
  }

  const baseDescription = mergeDescriptionText(
    fallbackDescription,
    detailPageText
  ).slice(0, MAX_JOB_DESCRIPTION_CHARS);

  if (pdfCandidates.length === 0) {
    return {
      description: baseDescription || fallbackDescription,
      pdfSourceUrl: null,
      pdfCachedUrl: null,
      attempted: includePdfText,
      success: false,
      fieldsExtractedCount: 0,
    };
  }

  let fallbackPdfSourceUrl: string | null = null;
  let fallbackPdfCachedUrl: string | null = null;
  const uniqueCandidates = Array.from(new Set(pdfCandidates)).slice(0, 3);
  for (const pdfUrl of uniqueCandidates) {
    let pdfCachedUrl: string | null = null;
    if (pdfUrlCache.has(pdfUrl)) {
      pdfCachedUrl = pdfUrlCache.get(pdfUrl) ?? null;
    } else {
      pdfCachedUrl = await cacheJobPdfAsset(pdfUrl);
      pdfUrlCache.set(pdfUrl, pdfCachedUrl);
    }

    if (!fallbackPdfSourceUrl) {
      fallbackPdfSourceUrl = pdfUrl;
      fallbackPdfCachedUrl = pdfCachedUrl;
    }

    if (!includePdfText) {
      return {
        description: baseDescription || fallbackDescription,
        pdfSourceUrl: pdfUrl,
        pdfCachedUrl,
        attempted: false,
        success: false,
        fieldsExtractedCount: 0,
      };
    }

    const pdfText = await extractTextFromPdfUrl(pdfUrl, maxPdfTextChars);
    if (!pdfText) {
      continue;
    }

    const extractedFields = extractStructuredFieldsFromPdfText(pdfText);
    const pdfDetailLines = buildPdfDerivedDetailsLines(extractedFields);

    const joined = [
      baseDescription || fallbackDescription.trim(),
      pdfDetailLines.length > 0 ? pdfDetailLines.join("\n") : "",
      `PDF Source: ${pdfUrl}`,
      pdfText,
    ]
      .filter((value) => value.length > 0)
      .join("\n\n")
      .slice(0, MAX_JOB_DESCRIPTION_CHARS);

    return {
      description: joined,
      pdfSourceUrl: pdfUrl,
      pdfCachedUrl,
      attempted: true,
      success: true,
      fieldsExtractedCount: pdfDetailLines.length,
    };
  }

  return {
    description: baseDescription || fallbackDescription,
    pdfSourceUrl: fallbackPdfSourceUrl,
    pdfCachedUrl: fallbackPdfCachedUrl,
    attempted: includePdfText,
    success: false,
    fieldsExtractedCount: 0,
  };
}

function containsMeghalayaKeyword(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return MEGHALAYA_LOCATION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function looksLikeJobListingText(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return (
    /job|vacanc|hiring|opening|career|apply/.test(normalized) ||
    containsAnyKeyword(normalized, [...DEFAULT_JOB_FILTER_INCLUDE_KEYWORDS])
  );
}

function inferLocationFromText(text: string) {
  const normalized = text.trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("east khasi hills")) {
    return "East Khasi Hills, Meghalaya";
  }
  if (normalized.includes("shillong")) {
    return "Shillong, Meghalaya";
  }
  if (normalized.includes("tura")) {
    return "Tura, Meghalaya";
  }
  if (normalized.includes("jowai")) {
    return "Jowai, Meghalaya";
  }
  if (normalized.includes("meghalaya")) {
    return "Meghalaya";
  }

  return "";
}

function buildSourceLocationHint({
  sourceName,
  sourceUrl,
  pageTitle,
  pageDescription,
}: {
  sourceName: string;
  sourceUrl: string;
  pageTitle: string;
  pageDescription: string;
}) {
  const inferred = inferLocationFromText(
    [sourceName, sourceUrl, pageTitle, pageDescription]
      .map((value) => value.trim())
      .filter(Boolean)
      .join(" ")
  );
  return inferred;
}

function collectHeuristicContainers(
  $: CheerioRoot,
  maxItems: number
) {
  const selectedElements: CheerioNode[] = [];
  const seen = new Set<CheerioNode>();
  const maxScan = Math.max(maxItems * 8, 300);

  const anchorCandidates = $(
    "a[href*='job'], a[href*='career'], a[href*='vacancy'], a[href*='opening'], a[href*='recruit']"
  )
    .toArray()
    .slice(0, maxScan);

  for (const anchorNode of anchorCandidates) {
    if (selectedElements.length >= maxItems) {
      break;
    }

    const anchor = $(anchorNode);
    const container =
      anchor.closest("article, li, .job, [class*='job'], div, section").first() ||
      anchor.parent();
    const element = container.get(0);
    if (!element || seen.has(element)) {
      continue;
    }

    const text = normalizeWhitespace(container.text());
    if (text.length < 20) {
      continue;
    }
    if (!looksLikeJobListingText(text) && !containsMeghalayaKeyword(text)) {
      continue;
    }

    seen.add(element);
    selectedElements.push(element);
  }

  if (selectedElements.length === 0) {
    const broadCandidates = $("article, li, [class*='job'], [data-job-id], section")
      .toArray()
      .slice(0, maxScan);
    for (const element of broadCandidates) {
      if (selectedElements.length >= maxItems) {
        break;
      }
      if (seen.has(element)) {
        continue;
      }
      const container = $(element);
      const text = normalizeWhitespace(container.text());
      if (text.length < 20) {
        continue;
      }
      if (!looksLikeJobListingText(text) && !containsMeghalayaKeyword(text)) {
        continue;
      }
      seen.add(element);
      selectedElements.push(element);
    }
  }

  return $(selectedElements as Parameters<CheerioRoot>[0]);
}

function isMeghalayaLocation(location: string) {
  return containsMeghalayaKeyword(location);
}

function resolveLocationScope(value: unknown): JobSourceLocationScope {
  return value === "all_locations" ? "all_locations" : "meghalaya_only";
}

function parseDateFromRelativeText(rawText: string, now: Date) {
  const text = rawText.trim().toLowerCase();
  if (!text) {
    return null;
  }

  if (text.includes("today")) {
    return now;
  }
  if (text.includes("yesterday")) {
    return new Date(now.getTime() - DAY_IN_MS);
  }

  const dayMatch = text.match(/(\d{1,2})\s*(day|days)\s*ago/);
  if (dayMatch) {
    const value = Number.parseInt(dayMatch[1] ?? "", 10);
    if (Number.isFinite(value) && value >= 0) {
      return new Date(now.getTime() - value * DAY_IN_MS);
    }
  }

  const hourMatch = text.match(/(\d{1,2})\s*(hour|hours|hr|hrs)\s*ago/);
  if (hourMatch) {
    const value = Number.parseInt(hourMatch[1] ?? "", 10);
    if (Number.isFinite(value) && value >= 0) {
      return new Date(now.getTime() - value * 60 * 60 * 1000);
    }
  }

  return null;
}

function parseDateFromAbsoluteText(rawText: string) {
  const text = rawText.trim();
  if (!text) {
    return null;
  }

  const dayMonthYear = text.match(/\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})\b/);
  if (dayMonthYear) {
    const day = Number.parseInt(dayMonthYear[1] ?? "", 10);
    const month = Number.parseInt(dayMonthYear[2] ?? "", 10);
    const year = Number.parseInt(dayMonthYear[3] ?? "", 10);
    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12 &&
      year >= 2000
    ) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  const yearMonthDay = text.match(/\b(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})\b/);
  if (yearMonthDay) {
    const year = Number.parseInt(yearMonthDay[1] ?? "", 10);
    const month = Number.parseInt(yearMonthDay[2] ?? "", 10);
    const day = Number.parseInt(yearMonthDay[3] ?? "", 10);
    if (
      Number.isFinite(day) &&
      Number.isFinite(month) &&
      Number.isFinite(year) &&
      day >= 1 &&
      day <= 31 &&
      month >= 1 &&
      month <= 12 &&
      year >= 2000
    ) {
      return new Date(Date.UTC(year, month - 1, day));
    }
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  return null;
}

function parsePublishedDate(dateText: string, fallbackText: string, now: Date) {
  const relative = parseDateFromRelativeText(dateText, now);
  if (relative) {
    return relative;
  }

  const absolute = parseDateFromAbsoluteText(dateText);
  if (absolute) {
    return absolute;
  }

  const fallbackRelative = parseDateFromRelativeText(fallbackText, now);
  if (fallbackRelative) {
    return fallbackRelative;
  }

  return parseDateFromAbsoluteText(fallbackText);
}

function isWithinLookbackWindow(date: Date, lookbackDays: number, now: Date) {
  const ageMs = now.getTime() - date.getTime();
  if (ageMs < -DAY_IN_MS) {
    return false;
  }
  return ageMs <= lookbackDays * DAY_IN_MS;
}

async function scrapeSource(
  source: JobSourceConfig,
  now: Date,
  options: JobsScraperRuntimeOptions,
  pdfUrlCache: Map<string, string | null>
): Promise<{ jobs: NewJobRow[]; stats: SourceScrapeStats }> {
  const timeoutMs = parsePositiveInt(process.env.JOBS_SCRAPE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const fetchRetryAttempts = parsePositiveInt(
    process.env.JOBS_SCRAPE_FETCH_RETRY_ATTEMPTS,
    DEFAULT_FETCH_RETRY_ATTEMPTS
  );
  const maxItemsPerSource = parsePositiveInt(
    process.env.JOBS_SCRAPE_MAX_ITEMS_PER_SOURCE,
    DEFAULT_MAX_ITEMS_PER_SOURCE
  );
  const maxPdfEnrichmentsPerSource = parsePositiveInt(
    process.env.JOBS_SCRAPE_MAX_PDF_ENRICHMENTS_PER_SOURCE,
    DEFAULT_MAX_PDF_ENRICHMENTS_PER_SOURCE
  );
  const maxPdfExtractChars = parsePositiveInt(
    process.env.JOBS_SCRAPE_PDF_MAX_TEXT_CHARS,
    DEFAULT_PDF_EXTRACT_MAX_TEXT_CHARS
  );
  const includeKeywords = parseKeywordListFromEnv({
    envValue: process.env.JOBS_SCRAPE_INCLUDE_KEYWORDS,
    fallback: DEFAULT_JOB_FILTER_INCLUDE_KEYWORDS,
  });
  const excludeKeywords = parseKeywordListFromEnv({
    envValue: process.env.JOBS_SCRAPE_EXCLUDE_KEYWORDS,
    fallback: DEFAULT_JOB_FILTER_EXCLUDE_KEYWORDS,
  });
  const envLookbackDays = parsePositiveInt(
    process.env.JOBS_SCRAPE_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
  const lookbackDays =
    typeof options.lookbackDays === "number" &&
    Number.isFinite(options.lookbackDays) &&
    options.lookbackDays > 0
      ? Math.trunc(options.lookbackDays)
      : envLookbackDays;
  const locationScope = resolveLocationScope(source.locationScope);

  const stats: SourceScrapeStats = {
    source: source.name,
    fetched: false,
    containersScanned: 0,
    extracted: 0,
    filteredByLocation: 0,
    filteredByDate: 0,
    filteredByKeyword: 0,
    parseErrors: 0,
    pdfDetailAttempts: 0,
    pdfDetailSuccesses: 0,
    pdfDetailFailures: 0,
    pdfFieldsExtracted: 0,
  };

  const requiredSelectors = [
    source.selectors.jobContainer,
    source.selectors.title,
    source.selectors.location,
    source.selectors.company,
    source.selectors.link,
    source.selectors.description,
  ];
  if (requiredSelectors.some((selector) => !selector.trim())) {
    stats.errorMessage = "Missing one or more required selectors.";
    stats.parseErrors += 1;
    return { jobs: [], stats };
  }

  try {
    const html = await fetchSourceHtmlWithRetry({
      url: source.url,
      timeoutMs,
      retryAttempts: fetchRetryAttempts,
    });
    const $ = load(html);
    stats.fetched = true;
    const pageTitle = normalizeWhitespace($("title").first().text());
    const pageDescription = normalizeWhitespace(
      ($("meta[name='description']").attr("content") ?? "").toString()
    );
    const sourceLocationHint = buildSourceLocationHint({
      sourceName: source.name,
      sourceUrl: source.url,
      pageTitle,
      pageDescription,
    });

    let containers: ReturnType<typeof $>;
    try {
      containers = $(source.selectors.jobContainer);
    } catch (error) {
      stats.parseErrors += 1;
      stats.errorMessage =
        error instanceof Error ? error.message : "Invalid jobContainer selector.";
      return { jobs: [], stats };
    }
    if (containers.length === 0) {
      containers = collectHeuristicContainers($, maxItemsPerSource);
    }

    const jobs: NewJobRow[] = [];
    const limit = Math.min(containers.length, maxItemsPerSource);
    let pdfDetailsUsed = 0;

    for (let index = 0; index < limit; index += 1) {
      const container = containers.eq(index);
      stats.containersScanned += 1;

      const fallbackText = normalizeWhitespace(container.text()).slice(0, 600);
      const title =
        safeText(container, source.selectors.title) ||
        safeText(container, "h1, h2, h3, [class*='title'], a[href*='job'], a[href*='career']") ||
        normalizeWhitespace(container.find("a[href]").first().text()).slice(0, 240);
      const company =
        safeText(container, source.selectors.company) ||
        safeText(container, "[class*='company'], .company, [class*='employer']");
      const rawLocation =
        safeText(container, source.selectors.location) ||
        safeText(container, "[class*='location'], .location, [class*='city'], [class*='place']");
      const location =
        rawLocation ||
        inferLocationFromText(
          [fallbackText, pageTitle, pageDescription, source.name, source.url]
            .map((value) => value.trim())
            .filter(Boolean)
            .join(" ")
        ) ||
        sourceLocationHint;
      const rawDescription =
        safeText(container, source.selectors.description) ||
        safeText(container, "[class*='description'], .description, [class*='summary'], p");
      const href =
        safeAttr(container, source.selectors.link, "href") ||
        safeAttr(container, "a[href*='job'], a[href*='career'], a[href]", "href");
      const directPdfHref = safeAttr(container, "a[href$='.pdf'], a[href*='.pdf']", "href");
      const sourceUrl = resolveSourceUrl(source.url, directPdfHref || href);

      if (!title || !sourceUrl) {
        continue;
      }

      if (locationScope === "meghalaya_only" && !isMeghalayaLocation(location)) {
        stats.filteredByLocation += 1;
        continue;
      }

      const publishedAtSelector =
        source.selectors.publishedAt || "time, [datetime], [class*='date'], [class*='posted']";
      const publishedAtText = safeText(container, publishedAtSelector);
      const publishedAtDatetime = safeAttr(container, publishedAtSelector, "datetime");
      const publishedAtContent = safeAttr(container, publishedAtSelector, "content");
      const publishedAt = parsePublishedDate(
        publishedAtDatetime || publishedAtContent || publishedAtText,
        fallbackText,
        now
      );
      if (!publishedAt || !isWithinLookbackWindow(publishedAt, lookbackDays, now)) {
        stats.filteredByDate += 1;
        continue;
      }

      const jobIntent = classifyJobIntent({
        title,
        description: rawDescription || fallbackText,
        sourceUrl,
        sourcePageUrl: source.url,
        includeKeywords,
        excludeKeywords,
      });
      if (!jobIntent.isJobRelated) {
        stats.filteredByKeyword += 1;
        continue;
      }

      const fallbackDescription = (rawDescription || fallbackText).slice(
        0,
        MAX_JOB_DESCRIPTION_CHARS
      );
      let description = fallbackDescription;
      let pdfSourceUrl: string | null = isPdfUrl(sourceUrl) ? sourceUrl : null;
      let pdfCachedUrl: string | null = null;
      if (pdfSourceUrl) {
        if (pdfUrlCache.has(pdfSourceUrl)) {
          pdfCachedUrl = pdfUrlCache.get(pdfSourceUrl) ?? null;
        } else {
          pdfCachedUrl = await cacheJobPdfAsset(pdfSourceUrl);
          pdfUrlCache.set(pdfSourceUrl, pdfCachedUrl);
        }
      }
      const enriched = await enrichDescriptionFromPdf({
        sourcePageUrl: source.url,
        sourceUrl,
        fallbackDescription,
        timeoutMs,
        maxPdfTextChars: maxPdfExtractChars,
        pdfUrlCache,
        includePdfText: pdfDetailsUsed < maxPdfEnrichmentsPerSource,
      });
      if (enriched.attempted) {
        stats.pdfDetailAttempts += 1;
        if (enriched.success) {
          stats.pdfDetailSuccesses += 1;
          pdfDetailsUsed += 1;
          stats.pdfFieldsExtracted += enriched.fieldsExtractedCount;
        } else {
          stats.pdfDetailFailures += 1;
        }
      }
      description = enriched.description;
      if (enriched.pdfSourceUrl) {
        pdfSourceUrl = enriched.pdfSourceUrl;
      }
      if (enriched.pdfCachedUrl) {
        pdfCachedUrl = enriched.pdfCachedUrl;
      }

      jobs.push({
        title,
        company: company || "Unknown",
        location,
        description,
        source_url: sourceUrl,
        pdf_source_url: pdfSourceUrl,
        pdf_cached_url: pdfCachedUrl,
      });
    }

    stats.extracted = jobs.length;
    return { jobs, stats };
  } catch (error) {
    stats.errorMessage = error instanceof Error ? error.message : String(error);
    return { jobs: [], stats };
  }
}

export async function scrapeJobsFromSources(
  sources: JobSourceConfig[] = jobSources,
  options: JobsScraperRuntimeOptions = {}
): Promise<ScrapeJobsResult> {
  const now = new Date();
  const envLookbackDays = parsePositiveInt(
    process.env.JOBS_SCRAPE_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS
  );
  const lookbackDays =
    typeof options.lookbackDays === "number" &&
    Number.isFinite(options.lookbackDays) &&
    options.lookbackDays > 0
      ? Math.trunc(options.lookbackDays)
      : envLookbackDays;
  const sourceStats: SourceScrapeStats[] = [];
  const seenSourceUrls = new Set<string>();
  const combinedJobs: NewJobRow[] = [];
  const pdfUrlCache = new Map<string, string | null>();
  let cancelled = false;

  let totalDuplicatesInRun = 0;
  let totalExtracted = 0;
  let totalFilteredByLocation = 0;
  let totalFilteredByDate = 0;
  let totalFilteredByKeyword = 0;

  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    if ((await options.shouldCancel?.()) === true) {
      cancelled = true;
      break;
    }

    const source = sources[sourceIndex];
    await options.onSourceStart?.({
      source: source.name,
      sourceIndex,
      totalSources: sources.length,
      lookbackDays,
    });

    const { jobs, stats } = await scrapeSource(source, now, { lookbackDays }, pdfUrlCache);
    sourceStats.push(stats);

    totalExtracted += stats.extracted;
    totalFilteredByLocation += stats.filteredByLocation;
    totalFilteredByDate += stats.filteredByDate;
    totalFilteredByKeyword += stats.filteredByKeyword;

    for (const job of jobs) {
      if (seenSourceUrls.has(job.source_url)) {
        totalDuplicatesInRun += 1;
        continue;
      }
      seenSourceUrls.add(job.source_url);
      combinedJobs.push(job);
    }

    console.info("[jobs-scraper] source_complete", {
      source: source.name,
      fetched: stats.fetched,
      scanned: stats.containersScanned,
      extracted: stats.extracted,
      filteredByLocation: stats.filteredByLocation,
      filteredByDate: stats.filteredByDate,
      filteredByKeyword: stats.filteredByKeyword,
      parseErrors: stats.parseErrors,
      pdfDetailAttempts: stats.pdfDetailAttempts,
      pdfDetailSuccesses: stats.pdfDetailSuccesses,
      pdfDetailFailures: stats.pdfDetailFailures,
      pdfFieldsExtracted: stats.pdfFieldsExtracted,
      error: stats.errorMessage ?? null,
    });

    await options.onSourceComplete?.({
      source: source.name,
      sourceIndex,
      totalSources: sources.length,
      lookbackDays,
      stats,
    });

    if ((await options.shouldCancel?.()) === true) {
      cancelled = true;
      break;
    }
  }

  return {
    jobs: combinedJobs,
    summary: {
      sourcesProcessed: sourceStats.length,
      totalSources: sources.length,
      lookbackDays,
      totalExtracted,
      totalFilteredByLocation,
      totalFilteredByDate,
      totalFilteredByKeyword,
      totalDuplicatesInRun,
      cancelled,
      sourceStats,
    },
  };
}

export async function runJobsScraper(
  sources: JobSourceConfig[] = jobSources,
  options: JobsScraperRuntimeOptions = {}
): Promise<RunJobsScraperResult> {
  const scraped = await scrapeJobsFromSources(sources, options);
  const persisted = await saveJobs(scraped.jobs, {
    onDuplicate: "update",
  });

  console.info("[jobs-scraper] run_complete", {
    sourcesProcessed: scraped.summary.sourcesProcessed,
    totalSources: scraped.summary.totalSources,
    lookbackDays: scraped.summary.lookbackDays,
    extractedAfterFilters: scraped.jobs.length,
    attemptedInsert: persisted.attemptedCount,
    inserted: persisted.insertedCount,
    updated: persisted.updatedCount,
    skippedDuplicates: persisted.skippedDuplicateCount + scraped.summary.totalDuplicatesInRun,
    filteredByLocation: scraped.summary.totalFilteredByLocation,
    filteredByDate: scraped.summary.totalFilteredByDate,
    filteredByKeyword: scraped.summary.totalFilteredByKeyword,
    cancelled: scraped.summary.cancelled,
  });

  return {
    ...scraped,
    persisted,
  };
}
