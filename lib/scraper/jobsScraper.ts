import "server-only";
import { load } from "cheerio";
import { jobSources, type JobSourceConfig } from "@/config/jobSources";
import { type NewJobRow, saveJobs } from "@/lib/jobs/saveJobs";
import { fetchWithTimeout } from "@/lib/utils/async";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_LOOKBACK_DAYS = 10;
const DEFAULT_MAX_ITEMS_PER_SOURCE = 200;
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const MEGHALAYA_LOCATION_KEYWORDS = [
  "meghalaya",
  "shillong",
  "tura",
  "jowai",
  "east khasi hills",
] as const;

const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type CheerioRoot = ReturnType<typeof load>;
type CheerioSelection = ReturnType<CheerioRoot>;
type CheerioNode = ReturnType<CheerioSelection["toArray"]>[number];

type SourceScrapeStats = {
  source: string;
  fetched: boolean;
  containersScanned: number;
  extracted: number;
  filteredByLocation: number;
  filteredByDate: number;
  parseErrors: number;
  errorMessage?: string;
};

export type ScrapeJobsResult = {
  jobs: NewJobRow[];
  summary: {
    sourcesProcessed: number;
    lookbackDays: number;
    totalExtracted: number;
    totalFilteredByLocation: number;
    totalFilteredByDate: number;
    totalDuplicatesInRun: number;
    sourceStats: SourceScrapeStats[];
  };
};

export type RunJobsScraperResult = ScrapeJobsResult & {
  persisted: {
    attemptedCount: number;
    insertedCount: number;
    skippedDuplicateCount: number;
  };
};

export type JobsScraperRuntimeOptions = {
  lookbackDays?: number;
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

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
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

  return /job|vacanc|hiring|opening|career|apply/.test(normalized);
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
  options: JobsScraperRuntimeOptions
): Promise<{ jobs: NewJobRow[]; stats: SourceScrapeStats }> {
  const timeoutMs = parsePositiveInt(process.env.JOBS_SCRAPE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  const maxItemsPerSource = parsePositiveInt(
    process.env.JOBS_SCRAPE_MAX_ITEMS_PER_SOURCE,
    DEFAULT_MAX_ITEMS_PER_SOURCE
  );
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

  const stats: SourceScrapeStats = {
    source: source.name,
    fetched: false,
    containersScanned: 0,
    extracted: 0,
    filteredByLocation: 0,
    filteredByDate: 0,
    parseErrors: 0,
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
    const response = await fetchWithTimeout(
      source.url,
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

    const html = await response.text();
    const $ = load(html);
    stats.fetched = true;

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
      const location =
        safeText(container, source.selectors.location) ||
        safeText(container, "[class*='location'], .location, [class*='city'], [class*='place']") ||
        inferLocationFromText(fallbackText);
      const rawDescription =
        safeText(container, source.selectors.description) ||
        safeText(container, "[class*='description'], .description, [class*='summary'], p");
      const href =
        safeAttr(container, source.selectors.link, "href") ||
        safeAttr(container, "a[href*='job'], a[href*='career'], a[href]", "href");
      const sourceUrl = resolveSourceUrl(source.url, href);

      if (!title || !sourceUrl) {
        continue;
      }

      if (!isMeghalayaLocation(location)) {
        stats.filteredByLocation += 1;
        continue;
      }

      const publishedAtSelector =
        source.selectors.publishedAt || "time, [datetime], [class*='date'], [class*='posted']";
      const publishedAtText = safeText(container, publishedAtSelector);
      const publishedAtDatetime = safeAttr(container, publishedAtSelector, "datetime");
      const publishedAt = parsePublishedDate(
        publishedAtDatetime || publishedAtText,
        fallbackText,
        now
      );
      if (!publishedAt || !isWithinLookbackWindow(publishedAt, lookbackDays, now)) {
        stats.filteredByDate += 1;
        continue;
      }

      const description = (rawDescription || fallbackText).slice(0, 4_000);
      jobs.push({
        title,
        company: company || "Unknown",
        location,
        description,
        source_url: sourceUrl,
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

  let totalDuplicatesInRun = 0;
  let totalExtracted = 0;
  let totalFilteredByLocation = 0;
  let totalFilteredByDate = 0;

  for (const source of sources) {
    const { jobs, stats } = await scrapeSource(source, now, { lookbackDays });
    sourceStats.push(stats);

    totalExtracted += stats.extracted;
    totalFilteredByLocation += stats.filteredByLocation;
    totalFilteredByDate += stats.filteredByDate;

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
      parseErrors: stats.parseErrors,
      error: stats.errorMessage ?? null,
    });
  }

  return {
    jobs: combinedJobs,
    summary: {
      sourcesProcessed: sources.length,
      lookbackDays,
      totalExtracted,
      totalFilteredByLocation,
      totalFilteredByDate,
      totalDuplicatesInRun,
      sourceStats,
    },
  };
}

export async function runJobsScraper(
  sources: JobSourceConfig[] = jobSources,
  options: JobsScraperRuntimeOptions = {}
): Promise<RunJobsScraperResult> {
  const scraped = await scrapeJobsFromSources(sources, options);
  const persisted = await saveJobs(scraped.jobs);

  console.info("[jobs-scraper] run_complete", {
    sourcesProcessed: scraped.summary.sourcesProcessed,
    lookbackDays: scraped.summary.lookbackDays,
    extractedAfterFilters: scraped.jobs.length,
    attemptedInsert: persisted.attemptedCount,
    inserted: persisted.insertedCount,
    skippedDuplicates: persisted.skippedDuplicateCount + scraped.summary.totalDuplicatesInRun,
    filteredByLocation: scraped.summary.totalFilteredByLocation,
    filteredByDate: scraped.summary.totalFilteredByDate,
  });

  return {
    ...scraped,
    persisted,
  };
}
