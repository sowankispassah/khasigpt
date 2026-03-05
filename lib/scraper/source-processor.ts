import "server-only";
import { load } from "cheerio";
import type { JobSourceConfig } from "@/config/jobSources";
import { cacheJobPdfAsset } from "@/lib/jobs/pdf-cache";
import type { NewJobRow } from "@/lib/jobs/saveJobs";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { extractDocumentTextFromBuffer } from "@/lib/uploads/document-parser";
import { RobustHttpClient } from "./http-client";
import type {
  PdfExtractionResult,
  ProcessedSourceResult,
  SourceProcessingContext,
  SourceScrapeStats,
} from "./scraping-types";
import {
  buildDescriptionFromSources,
  countPdfStructuredFields,
  extractPdfStructuredFields,
  extractSalaryText,
  hashText,
  hostnameFromUrl,
  isMeghalayaLocation,
  isPdfUrl,
  isWithinLookback,
  matchKeywords,
  normalizeMultiline,
  normalizeWhitespace,
  parsePositiveInt,
  parseBoolean,
  parsePublishedDate,
  resolveUrl,
  runWithConcurrency,
  truncateText,
} from "./scraper-utils";
import { extractSourceDetailMarkdownFromHtml } from "@/lib/jobs/linkedin-detail";

type CheerioRoot = ReturnType<typeof load>;
type CheerioSelection = ReturnType<CheerioRoot>;

type CandidateJob = {
  title: string;
  company: string;
  location: string;
  description: string;
  applicationUrl: string;
  sourcePageUrl: string;
  fallbackText: string;
  directPdfUrl: string | null;
};

type EnrichedJob = {
  row: NewJobRow;
  pdfAttempted: boolean;
  pdfSucceeded: boolean;
  pdfFieldsExtractedCount: number;
};

const DEFAULT_ALLOW_MISSING_PUBLISHED_AT = true;
const DEFAULT_EXISTING_LOOKUP_BATCH_SIZE = 200;
const DEFAULT_DETAIL_FETCH_MIN_CHARS = 260;
const DEFAULT_PDF_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_SLOW_SOURCE_FETCH_TIMEOUT_MS = 60_000;
const DEFAULT_SOURCE_LISTING_RETRY_ATTEMPTS = 1;
const DEFAULT_DETAIL_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_DETAIL_RETRY_ATTEMPTS = 1;
const DEFAULT_PDF_RETRY_ATTEMPTS = 2;

const ROLE_TITLE_HINT_PATTERN =
  /\b(manager|officer|assistant|executive|engineer|teacher|tutor|nurse|staff|consultant|developer|analyst|specialist|coordinator|supervisor|clerk|technician|lecturer|faculty|professor|driver|operator|accountant|sales|marketing|recruitment|post|vacancy)\b/i;

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
  "result",
  "results",
  "notice of award",
  "award of contract",
  "procurement",
] as const;

function parseKeywordOverride(value: string | undefined, fallback: readonly string[]) {
  if (!value) {
    return [...fallback];
  }
  const parsed = value
    .split(",")
    .map((entry) => normalizeWhitespace(entry))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : [...fallback];
}

function chunkItems<T>(items: T[], chunkSize: number) {
  if (items.length <= chunkSize) {
    return [items];
  }
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

async function findExistingSourceUrls(sourceUrls: string[]) {
  const deduped = Array.from(new Set(sourceUrls.map((url) => normalizeWhitespace(url)).filter(Boolean)));
  const existing = new Set<string>();
  if (deduped.length === 0) {
    return existing;
  }
  try {
    const supabase = createSupabaseAdminClient();
    const chunks = chunkItems(deduped, DEFAULT_EXISTING_LOOKUP_BATCH_SIZE);
    for (const chunk of chunks) {
      const { data, error } = await supabase.from("jobs").select("source_url").in("source_url", chunk);
      if (error) {
        console.warn("[jobs-scraper] existing_lookup_failed", {
          chunkSize: chunk.length,
          error: error.message,
        });
        break;
      }
      for (const row of data ?? []) {
        if (typeof row.source_url === "string" && row.source_url.trim()) {
          existing.add(row.source_url.trim());
        }
      }
    }
  } catch (error) {
    console.warn("[jobs-scraper] existing_lookup_failed", {
      count: deduped.length,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return existing;
}

function safeText(container: CheerioSelection, selector: string) {
  if (!selector.trim()) {
    return "";
  }
  try {
    return normalizeWhitespace(container.find(selector).first().text());
  } catch {
    return "";
  }
}

function safeAttr(container: CheerioSelection, selector: string, attribute: string) {
  if (!selector.trim()) {
    return "";
  }
  try {
    const value = container.find(selector).first().attr(attribute);
    return typeof value === "string" ? value.trim() : "";
  } catch {
    return "";
  }
}

function collectFallbackContainers($: CheerioRoot, maxItems: number) {
  const preferredSelectors = [
    "article",
    "li",
    ".job",
    "[class*='job']",
    "[data-job-id]",
    "[data-testid*='job']",
  ];

  for (const selector of preferredSelectors) {
    const candidates = $(selector);
    if (candidates.length > 0) {
      return candidates.slice(0, maxItems);
    }
  }

  const anchors = $("a[href]").toArray().slice(0, maxItems * 2);
  const uniqueParents = new Set<unknown>();
  for (const anchor of anchors) {
    const parent = (anchor as { parent?: unknown }).parent ?? anchor;
    uniqueParents.add(parent);
    if (uniqueParents.size >= maxItems) {
      break;
    }
  }

  const values = Array.from(uniqueParents);
  if (values.length === 0) {
    return $();
  }
  return $(values as never[]);
}

function extractTitle(container: CheerioSelection, selectors: JobSourceConfig["selectors"]) {
  return (
    safeText(container, selectors.title) ||
    safeText(container, "h1, h2, h3, [class*='title'], a[href*='job'], a[href*='career']") ||
    normalizeWhitespace(container.find("a[href]").first().text())
  );
}

function extractCompany(container: CheerioSelection, selectors: JobSourceConfig["selectors"]) {
  return (
    safeText(container, selectors.company) ||
    safeText(container, "[class*='company'], .company, [class*='employer'], [class*='organization']")
  );
}

function extractLocation(container: CheerioSelection, selectors: JobSourceConfig["selectors"]) {
  return (
    safeText(container, selectors.location) ||
    safeText(container, "[class*='location'], .location, [class*='city'], [class*='place']")
  );
}

function extractDescription(container: CheerioSelection, selectors: JobSourceConfig["selectors"]) {
  return (
    safeText(container, selectors.description) ||
    safeText(container, "[class*='description'], .description, [class*='summary'], [class*='snippet'], p")
  );
}

function extractLink(container: CheerioSelection, selectors: JobSourceConfig["selectors"]) {
  return (
    safeAttr(container, selectors.link, "href") ||
    safeAttr(container, "a[href*='job'], a[href*='career'], a[href]", "href")
  );
}

function extractDirectPdfLink(container: CheerioSelection) {
  return safeAttr(container, "a[href$='.pdf'], a[href*='.pdf']", "href");
}

function isLinkedInHost(hostname: string) {
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

function classifyAsJob({
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
  const signal = [title, description, sourceUrl].filter(Boolean).join(" ");
  const matchedExclude = matchKeywords(signal, excludeKeywords);
  if (matchedExclude.length > 0) {
    return false;
  }

  const sourceHost = hostnameFromUrl(sourcePageUrl);
  const jobHost = hostnameFromUrl(sourceUrl);
  const isLinkedInSource = isLinkedInHost(sourceHost) || isLinkedInHost(jobHost);
  if (isLinkedInSource) {
    return true;
  }

  if (ROLE_TITLE_HINT_PATTERN.test(title)) {
    return true;
  }

  const urlPathLooksLikeJob = /\/(job|jobs|career|careers|vacanc|recruit)/i.test(sourceUrl);
  if (urlPathLooksLikeJob) {
    return true;
  }

  const matchedInclude = matchKeywords(signal, includeKeywords);
  return matchedInclude.length > 0;
}

function parsePublishedAtFromContainer({
  container,
  selectors,
  fallbackText,
  now,
}: {
  container: CheerioSelection;
  selectors: JobSourceConfig["selectors"];
  fallbackText: string;
  now: Date;
}) {
  const publishedSelector =
    selectors.publishedAt || "time, [datetime], [class*='date'], [class*='posted']";
  const fromDateTime = safeAttr(container, publishedSelector, "datetime");
  const fromContent = safeAttr(container, publishedSelector, "content");
  const fromText = safeText(container, publishedSelector);
  return (
    parsePublishedDate(fromDateTime, now) ||
    parsePublishedDate(fromContent, now) ||
    parsePublishedDate(fromText, now) ||
    parsePublishedDate(fallbackText, now)
  );
}

function findPdfUrlInHtml(html: string, baseUrl: string) {
  const $ = load(html);
  const candidates = $("a[href$='.pdf'], a[href*='.pdf']")
    .toArray()
    .map((node) => $(node).attr("href"))
    .filter((value): value is string => typeof value === "string")
    .map((value) => resolveUrl(baseUrl, value))
    .filter((value): value is string => Boolean(value));
  return candidates.length > 0 ? candidates[0] : null;
}

function findPdfUrlInText(text: string, baseUrl: string) {
  const normalized = text.trim();
  if (!normalized) {
    return null;
  }

  const markdownLinkMatch = normalized.match(
    /\[[^\]]*]\(([^)\s]+\.pdf(?:\?[^)\s]*)?)\)/i
  );
  if (markdownLinkMatch?.[1]) {
    const resolved = resolveUrl(baseUrl, markdownLinkMatch[1]);
    if (resolved && isPdfUrl(resolved)) {
      return resolved;
    }
  }

  const rawUrlMatch = normalized.match(/https?:\/\/[^\s)"']+\.pdf(?:\?[^\s)"']*)?/i);
  if (rawUrlMatch?.[0]) {
    const resolved = resolveUrl(baseUrl, rawUrlMatch[0]);
    if (resolved && isPdfUrl(resolved)) {
      return resolved;
    }
  }

  const relativePathMatch = normalized.match(
    /(?:^|[\s("'])(\/[^\s)"']+\.pdf(?:\?[^\s)"']*)?)/i
  );
  if (relativePathMatch?.[1]) {
    const resolved = resolveUrl(baseUrl, relativePathMatch[1]);
    if (resolved && isPdfUrl(resolved)) {
      return resolved;
    }
  }

  return null;
}

async function resolveDetailMarkdown({
  url,
  httpClient,
  requestTimeoutMs,
  requestRetryAttempts,
  sharedCache,
}: {
  url: string;
  httpClient: RobustHttpClient;
  requestTimeoutMs: number;
  requestRetryAttempts: number;
  sharedCache: Map<string, string | null>;
}) {
  if (sharedCache.has(url)) {
    return sharedCache.get(url) ?? null;
  }

  try {
    const detailTimeoutMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_DETAIL_REQUEST_TIMEOUT_MS,
      Math.min(requestTimeoutMs, DEFAULT_DETAIL_REQUEST_TIMEOUT_MS)
    );
    const detailRetryAttempts = parsePositiveInt(
      process.env.JOBS_SCRAPE_DETAIL_FETCH_RETRY_ATTEMPTS,
      DEFAULT_DETAIL_RETRY_ATTEMPTS
    );
    const response = await httpClient.fetchText(url, {
      timeoutMs: detailTimeoutMs,
      retryAttempts: detailRetryAttempts,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    });
    const markdown = extractSourceDetailMarkdownFromHtml({
      html: response.text,
      sourceUrl: url,
    });
    const normalized = normalizeMultiline(markdown);
    sharedCache.set(url, normalized || null);
    return normalized || null;
  } catch (error) {
    console.warn("[jobs-scraper] detail_fetch_failed", {
      url,
      error: error instanceof Error ? error.message : String(error),
    });
    sharedCache.set(url, null);
    return null;
  }
}

async function discoverPdfUrlFromDetailPage({
  sourceUrl,
  httpClient,
  requestTimeoutMs,
  requestRetryAttempts,
}: {
  sourceUrl: string;
  httpClient: RobustHttpClient;
  requestTimeoutMs: number;
  requestRetryAttempts: number;
}) {
  try {
    const detailTimeoutMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_DETAIL_REQUEST_TIMEOUT_MS,
      Math.min(requestTimeoutMs, DEFAULT_DETAIL_REQUEST_TIMEOUT_MS)
    );
    const detailRetryAttempts = parsePositiveInt(
      process.env.JOBS_SCRAPE_DETAIL_FETCH_RETRY_ATTEMPTS,
      DEFAULT_DETAIL_RETRY_ATTEMPTS
    );
    const response = await httpClient.fetchText(sourceUrl, {
      timeoutMs: detailTimeoutMs,
      retryAttempts: detailRetryAttempts,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    });
    return findPdfUrlInHtml(response.text, sourceUrl);
  } catch {
    return null;
  }
}

type PdfProcessingOutcome = PdfExtractionResult & {
  fields: ReturnType<typeof extractPdfStructuredFields>;
};

function isPdfResponse({
  contentType,
  buffer,
}: {
  contentType: string;
  buffer: Buffer;
}) {
  const normalizedType = contentType.toLowerCase();
  const hasPdfContentType =
    normalizedType.includes("application/pdf") ||
    normalizedType.includes("application/x-pdf");
  const hasPdfHeader = buffer.subarray(0, 8).toString("latin1").includes("%PDF-");
  return hasPdfContentType || hasPdfHeader;
}

function findPdfRedirectFromText({
  text,
  baseUrl,
}: {
  text: string;
  baseUrl: string;
}) {
  const fromHtml = findPdfUrlInHtml(text, baseUrl);
  if (fromHtml) {
    return fromHtml;
  }
  const fromText = findPdfUrlInText(text, baseUrl);
  if (fromText) {
    return fromText;
  }
  return null;
}

async function downloadPdfWithFallback({
  pdfUrl,
  sourcePageUrl,
  applicationUrl,
  httpClient,
  requestTimeoutMs,
  requestRetryAttempts,
}: {
  pdfUrl: string;
  sourcePageUrl: string;
  applicationUrl: string;
  httpClient: RobustHttpClient;
  requestTimeoutMs: number;
  requestRetryAttempts: number;
}) {
  const headerVariants: HeadersInit[] = [
    {},
    {
      referer: applicationUrl,
      origin: (() => {
        try {
          return new URL(applicationUrl).origin;
        } catch {
          return "";
        }
      })(),
    },
    {
      referer: sourcePageUrl,
      origin: (() => {
        try {
          return new URL(sourcePageUrl).origin;
        } catch {
          return "";
        }
      })(),
    },
  ];

  let lastError: Error | null = null;
  for (const headers of headerVariants) {
    try {
      const downloaded = await httpClient.fetchBuffer(pdfUrl, {
        timeoutMs: requestTimeoutMs,
        retryAttempts: requestRetryAttempts,
        maxBodyBytes: DEFAULT_PDF_MAX_BYTES,
        headers,
        accept: "application/pdf,application/octet-stream;q=0.9,text/html;q=0.6,*/*;q=0.5",
      });
      const contentType = downloaded.headers.get("content-type") ?? "";
      if (isPdfResponse({ contentType, buffer: downloaded.buffer })) {
        return {
          resolvedPdfUrl: pdfUrl,
          downloaded,
        };
      }

      const htmlText = downloaded.buffer.toString("utf8");
      const redirectedPdfUrl = findPdfRedirectFromText({
        text: htmlText,
        baseUrl: downloaded.url || pdfUrl,
      });
      if (redirectedPdfUrl && redirectedPdfUrl !== pdfUrl) {
        try {
          const redirected = await httpClient.fetchBuffer(redirectedPdfUrl, {
            timeoutMs: requestTimeoutMs,
            retryAttempts: requestRetryAttempts,
            maxBodyBytes: DEFAULT_PDF_MAX_BYTES,
            headers,
            accept:
              "application/pdf,application/octet-stream;q=0.9,text/html;q=0.6,*/*;q=0.5",
          });
          const redirectedType = redirected.headers.get("content-type") ?? "";
          if (isPdfResponse({ contentType: redirectedType, buffer: redirected.buffer })) {
            return {
              resolvedPdfUrl: redirectedPdfUrl,
              downloaded: redirected,
            };
          }
        } catch (redirectError) {
          lastError =
            redirectError instanceof Error
              ? redirectError
              : new Error(String(redirectError));
        }
      }

      lastError = new Error("not_a_pdf_response");
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error("pdf_download_failed");
}

async function processPdf({
  pdfUrl,
  sourcePageUrl,
  applicationUrl,
  httpClient,
  requestTimeoutMs,
  requestRetryAttempts,
  maxPdfTextChars,
}: {
  pdfUrl: string;
  sourcePageUrl: string;
  applicationUrl: string;
  httpClient: RobustHttpClient;
  requestTimeoutMs: number;
  requestRetryAttempts: number;
  maxPdfTextChars: number;
}): Promise<PdfProcessingOutcome | null> {
  try {
    const pdfRetryAttempts = parsePositiveInt(
      process.env.JOBS_SCRAPE_PDF_FETCH_RETRY_ATTEMPTS,
      Math.max(1, Math.min(requestRetryAttempts, DEFAULT_PDF_RETRY_ATTEMPTS))
    );
    const { downloaded, resolvedPdfUrl } = await downloadPdfWithFallback({
      pdfUrl,
      sourcePageUrl,
      applicationUrl,
      httpClient,
      requestTimeoutMs,
      requestRetryAttempts: pdfRetryAttempts,
    });

    const parsed = await extractDocumentTextFromBuffer(
      {
        name: "job-notification.pdf",
        buffer: downloaded.buffer,
        mediaType: "application/pdf",
      },
      {
        maxTextChars: maxPdfTextChars,
      }
    );

    const pdfText = truncateText(normalizeMultiline(parsed.text), maxPdfTextChars);
    if (!pdfText) {
      return null;
    }

    const pdfCachedUrl = await cacheJobPdfAsset(resolvedPdfUrl, {
      timeoutMs: requestTimeoutMs,
      retryAttempts: pdfRetryAttempts,
    }).catch(() => null);
    const fields = extractPdfStructuredFields(pdfText);
    return {
      pdfSourceUrl: resolvedPdfUrl,
      pdfCachedUrl,
      pdfText,
      extractedFieldsCount: countPdfStructuredFields(fields),
      fields,
    };
  } catch (error) {
    console.warn("[jobs-scraper] pdf_processing_failed", {
      pdfUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function enrichCandidateJob({
  candidate,
  source,
  context,
  httpClient,
}: {
  candidate: CandidateJob;
  source: JobSourceConfig;
  context: SourceProcessingContext;
  httpClient: RobustHttpClient;
}): Promise<EnrichedJob | null> {
  if ((await context.shouldCancel?.()) === true) {
    return null;
  }

  const baseText = normalizeMultiline(candidate.description || candidate.fallbackText);
  let detailText: string | null = null;
  const shouldFetchDetail =
    !isPdfUrl(candidate.applicationUrl) &&
    baseText.length < DEFAULT_DETAIL_FETCH_MIN_CHARS;
  if (shouldFetchDetail) {
    detailText = await resolveDetailMarkdown({
      url: candidate.applicationUrl,
      httpClient,
      requestTimeoutMs: context.requestTimeoutMs,
      requestRetryAttempts: context.requestRetryAttempts,
      sharedCache: context.sharedCaches.detailMarkdownByUrl,
    });
  }

  const webText = normalizeMultiline([baseText, detailText ?? ""].filter(Boolean).join("\n\n"));

  let pdfSourceUrl = candidate.directPdfUrl;
  if (!pdfSourceUrl && isPdfUrl(candidate.applicationUrl)) {
    pdfSourceUrl = candidate.applicationUrl;
  }
  if (!pdfSourceUrl) {
    pdfSourceUrl =
      findPdfUrlInText(detailText ?? "", candidate.applicationUrl) ||
      findPdfUrlInText(baseText, candidate.applicationUrl) ||
      findPdfUrlInText(webText, candidate.applicationUrl);
  }
  if (!pdfSourceUrl && !isPdfUrl(candidate.applicationUrl)) {
    pdfSourceUrl = await discoverPdfUrlFromDetailPage({
      sourceUrl: candidate.applicationUrl,
      httpClient,
      requestTimeoutMs: context.requestTimeoutMs,
      requestRetryAttempts: context.requestRetryAttempts,
    });
  }

  let pdfResult: PdfProcessingOutcome | null = null;
  let pdfAttempted = false;
  if (pdfSourceUrl) {
    pdfAttempted = true;
    if (context.sharedCaches.pdfByUrl.has(pdfSourceUrl)) {
      const cached = context.sharedCaches.pdfByUrl.get(pdfSourceUrl);
      if (cached) {
        const fields = extractPdfStructuredFields(cached.pdfText);
        pdfResult = {
          ...cached,
          fields,
          extractedFieldsCount: countPdfStructuredFields(fields),
        };
      }
    } else {
      pdfResult = await processPdf({
        pdfUrl: pdfSourceUrl,
        sourcePageUrl: candidate.sourcePageUrl,
        applicationUrl: candidate.applicationUrl,
        httpClient,
        requestTimeoutMs: context.requestTimeoutMs,
        requestRetryAttempts: context.requestRetryAttempts,
        maxPdfTextChars: context.maxPdfTextChars,
      });
      context.sharedCaches.pdfByUrl.set(pdfSourceUrl, pdfResult);
    }
  }

  const description = buildDescriptionFromSources({
    title: candidate.title,
    company: candidate.company,
    location: candidate.location,
    applicationLink: candidate.applicationUrl,
    sourcePageUrl: candidate.sourcePageUrl,
    webText,
    pdfText: pdfResult?.pdfText ?? null,
    pdfFields: pdfResult?.fields ?? null,
    maxChars: context.maxDescriptionChars,
  });

  const salary = pdfResult?.fields.salary ?? extractSalaryText(description);
  const normalizedDescription = normalizeMultiline(description);
  const dedupeSignature = [
    candidate.title.toLowerCase(),
    candidate.company.toLowerCase(),
    candidate.location.toLowerCase(),
    candidate.applicationUrl.toLowerCase(),
    normalizeWhitespace(normalizedDescription).slice(0, 25_000).toLowerCase(),
  ].join("|");

  const row: NewJobRow = {
    title: candidate.title,
    company: candidate.company || "Unknown",
    location: candidate.location || "Unknown",
    salary: salary || null,
    description: normalizedDescription,
    source: source.name,
    application_link: candidate.applicationUrl,
    source_url: candidate.applicationUrl,
    pdf_source_url: pdfResult?.pdfSourceUrl ?? pdfSourceUrl ?? null,
    pdf_cached_url: pdfResult?.pdfCachedUrl ?? null,
    pdf_content: pdfResult?.pdfText ?? null,
    content_hash: hashText(dedupeSignature),
  };

  return {
    row,
    pdfAttempted,
    pdfSucceeded: Boolean(pdfResult?.pdfText),
    pdfFieldsExtractedCount: pdfResult?.extractedFieldsCount ?? 0,
  };
}

function buildSourceStats(sourceName: string): SourceScrapeStats {
  return {
    source: sourceName,
    fetched: false,
    containersScanned: 0,
    extracted: 0,
    skippedExisting: 0,
    filteredByLocation: 0,
    filteredByDate: 0,
    filteredByKeyword: 0,
    parseErrors: 0,
    pdfDetailAttempts: 0,
    pdfDetailSuccesses: 0,
    pdfDetailFailures: 0,
    pdfFieldsExtracted: 0,
  };
}

function isTimeoutLikeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message === "timeout" ||
    /timeout|timed out|aborted|headers timeout/i.test(message)
  );
}

async function fetchSourceListingWithFallback({
  sourceUrl,
  requestTimeoutMs,
  requestRetryAttempts,
  httpClient,
}: {
  sourceUrl: string;
  requestTimeoutMs: number;
  requestRetryAttempts: number;
  httpClient: RobustHttpClient;
}) {
  try {
    const listingRetryAttempts = parsePositiveInt(
      process.env.JOBS_SCRAPE_SOURCE_LISTING_RETRY_ATTEMPTS,
      DEFAULT_SOURCE_LISTING_RETRY_ATTEMPTS
    );
    return await httpClient.fetchText(sourceUrl, {
      timeoutMs: requestTimeoutMs,
      retryAttempts: Math.max(1, Math.min(requestRetryAttempts, listingRetryAttempts)),
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    });
  } catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error;
    }

    const slowSourceTimeoutMs = parsePositiveInt(
      process.env.JOBS_SCRAPE_SLOW_SOURCE_TIMEOUT_MS,
      DEFAULT_SLOW_SOURCE_FETCH_TIMEOUT_MS
    );
    const escalatedTimeoutMs = Math.max(
      requestTimeoutMs,
      slowSourceTimeoutMs,
      requestTimeoutMs * 2
    );

    console.warn("[jobs-scraper] source_listing_retry_with_extended_timeout", {
      sourceUrl,
      baseTimeoutMs: requestTimeoutMs,
      escalatedTimeoutMs,
      error: error instanceof Error ? error.message : String(error),
    });

    return httpClient.fetchText(sourceUrl, {
      timeoutMs: escalatedTimeoutMs,
      retryAttempts: 1,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    });
  }
}

export async function scrapeSource({
  source,
  sourceIndex,
  context,
  httpClient,
}: {
  source: JobSourceConfig;
  sourceIndex: number;
  context: SourceProcessingContext;
  httpClient: RobustHttpClient;
}): Promise<ProcessedSourceResult> {
  const stats = buildSourceStats(source.name);
  const includeKeywords =
    context.includeKeywords.length > 0
      ? context.includeKeywords
      : parseKeywordOverride(
          process.env.JOBS_SCRAPE_JOB_FILTER_INCLUDE_KEYWORDS,
          DEFAULT_JOB_FILTER_INCLUDE_KEYWORDS
        );
  const excludeKeywords =
    context.excludeKeywords.length > 0
      ? context.excludeKeywords
      : parseKeywordOverride(
          process.env.JOBS_SCRAPE_JOB_FILTER_EXCLUDE_KEYWORDS,
          DEFAULT_JOB_FILTER_EXCLUDE_KEYWORDS
        );
  const allowMissingPublishedAt = parseBoolean(
    process.env.JOBS_SCRAPE_ALLOW_MISSING_PUBLISHED_AT,
    DEFAULT_ALLOW_MISSING_PUBLISHED_AT
  );

  try {
    const response = await fetchSourceListingWithFallback({
      sourceUrl: source.url,
      requestTimeoutMs: context.requestTimeoutMs,
      requestRetryAttempts: context.requestRetryAttempts,
      httpClient,
    });
    stats.fetched = true;

    const $ = load(response.text);
    let containers: CheerioSelection;
    try {
      containers = $(source.selectors.jobContainer);
    } catch {
      containers = $();
      stats.parseErrors += 1;
    }
    if (containers.length === 0) {
      containers = collectFallbackContainers($, context.sourceMaxItems);
    }

    const limit = Math.min(containers.length, context.sourceMaxItems);
    const candidates: CandidateJob[] = [];

    for (let index = 0; index < limit; index += 1) {
      if ((await context.shouldCancel?.()) === true) {
        return {
          source,
          sourceIndex,
          jobs: [],
          stats: {
            ...stats,
            errorMessage: "Cancelled while building candidate list.",
          },
          cancelled: true,
        };
      }

      const container = containers.eq(index);
      const fallbackText = normalizeWhitespace(container.text());
      const title = extractTitle(container, source.selectors);
      const link = extractLink(container, source.selectors);
      const directPdf = extractDirectPdfLink(container);
      const applicationUrl = resolveUrl(source.url, directPdf || link);
      if (!title || !applicationUrl) {
        continue;
      }

      stats.containersScanned += 1;
      const company = extractCompany(container, source.selectors) || "Unknown";
      const location = extractLocation(container, source.selectors) || "Unknown";
      const description = extractDescription(container, source.selectors) || fallbackText;
      const publishedAt = parsePublishedAtFromContainer({
        container,
        selectors: source.selectors,
        fallbackText,
        now: context.now,
      });
      if (!publishedAt && !allowMissingPublishedAt) {
        stats.filteredByDate += 1;
        continue;
      }
      if (publishedAt && !isWithinLookback(publishedAt, context.lookbackDays, context.now)) {
        stats.filteredByDate += 1;
        continue;
      }

      if (source.locationScope !== "all_locations" && !isMeghalayaLocation(location)) {
        stats.filteredByLocation += 1;
        continue;
      }

      if (
        !classifyAsJob({
          title,
          description,
          sourceUrl: applicationUrl,
          sourcePageUrl: source.url,
          includeKeywords,
          excludeKeywords,
        })
      ) {
        stats.filteredByKeyword += 1;
        continue;
      }

      candidates.push({
        title,
        company,
        location,
        description,
        applicationUrl,
        sourcePageUrl: source.url,
        fallbackText,
        directPdfUrl: resolveUrl(source.url, directPdf),
      });
    }

    if (context.skipExistingSourceUrls && candidates.length > 0) {
      const existing = await findExistingSourceUrls(candidates.map((candidate) => candidate.applicationUrl));
      if (existing.size > 0) {
        const filtered = candidates.filter((candidate) => !existing.has(candidate.applicationUrl));
        stats.skippedExisting += candidates.length - filtered.length;
        candidates.length = 0;
        candidates.push(...filtered);
      }
    }

    const enrichedRows: NewJobRow[] = [];
    await runWithConcurrency(candidates, context.detailFetchConcurrency, async (candidate) => {
      const enriched = await enrichCandidateJob({
        candidate,
        source,
        context,
        httpClient,
      });
      if (!enriched) {
        return;
      }
      if (enriched.pdfAttempted) {
        stats.pdfDetailAttempts += 1;
      }
      if (enriched.pdfSucceeded) {
        stats.pdfDetailSuccesses += 1;
        stats.pdfFieldsExtracted += enriched.pdfFieldsExtractedCount;
      } else if (enriched.pdfAttempted) {
        stats.pdfDetailFailures += 1;
      }
      enrichedRows.push(enriched.row);
    });

    stats.extracted = enrichedRows.length;
    return {
      source,
      sourceIndex,
      jobs: enrichedRows,
      stats,
      cancelled: false,
    };
  } catch (error) {
    stats.parseErrors += 1;
    stats.errorMessage = error instanceof Error ? error.message : String(error);
    return {
      source,
      sourceIndex,
      jobs: [],
      stats,
      cancelled: false,
    };
  }
}
