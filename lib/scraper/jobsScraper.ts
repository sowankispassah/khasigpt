import "server-only";
import { jobSources, type JobSourceConfig } from "@/config/jobSources";
import { getJobsPdfExtractionSettingsUncached } from "@/lib/jobs/pdf-extraction-settings";
import { syncJobPostingsToRag } from "@/lib/jobs/rag-sync";
import { type NewJobRow, saveJobs } from "@/lib/jobs/saveJobs";
import { RobustHttpClient } from "./http-client";
import { scrapeSource } from "./source-processor";
import type {
  CachedPdfExtractionResult,
  JobsScraperRuntimeOptions,
  ProcessedSourceResult,
  RunJobsScraperResult,
  ScrapeJobsResult,
  SourceScrapeStats,
} from "./scraping-types";
import { parsePositiveInt, runWithConcurrency } from "./scraper-utils";

const DEFAULT_LOOKBACK_DAYS = 10;
const DEFAULT_SOURCE_CONCURRENCY = 3;
const DEFAULT_SOURCE_MAX_ITEMS = 200;
const DEFAULT_DETAIL_FETCH_CONCURRENCY = 6;
const DEFAULT_REQUEST_TIMEOUT_MS = 20_000;
const DEFAULT_REQUEST_RETRY_ATTEMPTS = 3;
const DEFAULT_SOURCE_BUDGET_MS = 3 * 60 * 1000;
const DEFAULT_MAX_DESCRIPTION_CHARS = 180_000;
const DEFAULT_MAX_PDF_TEXT_CHARS = 140_000;
const DEFAULT_PERSIST_TIMEOUT_MS = 75_000;
const DEFAULT_RAG_SYNC_TIMEOUT_MS = 75_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!(Number.isFinite(timeoutMs) && timeoutMs > 0)) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function createSourceStatsFallback(sourceName: string): SourceScrapeStats {
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

export async function scrapeJobsFromSources(
  sources: JobSourceConfig[] = jobSources,
  options: JobsScraperRuntimeOptions = {}
): Promise<ScrapeJobsResult> {
  const now = new Date();
  const lookbackDays =
    typeof options.lookbackDays === "number" &&
    Number.isFinite(options.lookbackDays) &&
    options.lookbackDays > 0
      ? Math.trunc(options.lookbackDays)
      : parsePositiveInt(process.env.JOBS_SCRAPE_LOOKBACK_DAYS, DEFAULT_LOOKBACK_DAYS);

  const sourceConcurrency =
    typeof options.sourceConcurrency === "number" &&
    Number.isFinite(options.sourceConcurrency) &&
    options.sourceConcurrency > 0
      ? Math.trunc(options.sourceConcurrency)
      : parsePositiveInt(
          process.env.JOBS_SCRAPE_SOURCE_CONCURRENCY,
          DEFAULT_SOURCE_CONCURRENCY
        );

  const sourceMaxItems = parsePositiveInt(
    process.env.JOBS_SCRAPE_MAX_ITEMS_PER_SOURCE,
    DEFAULT_SOURCE_MAX_ITEMS
  );
  const detailFetchConcurrency = parsePositiveInt(
    process.env.JOBS_SCRAPE_DETAIL_FETCH_CONCURRENCY,
    DEFAULT_DETAIL_FETCH_CONCURRENCY
  );
  const requestTimeoutMs = parsePositiveInt(
    process.env.JOBS_SCRAPE_REQUEST_TIMEOUT_MS ?? process.env.JOBS_SCRAPE_TIMEOUT_MS,
    DEFAULT_REQUEST_TIMEOUT_MS
  );
  const requestRetryAttempts = parsePositiveInt(
    process.env.JOBS_SCRAPE_REQUEST_RETRY_ATTEMPTS ??
      process.env.JOBS_SCRAPE_FETCH_RETRY_ATTEMPTS,
    DEFAULT_REQUEST_RETRY_ATTEMPTS
  );
  const sourceBudgetMs = parsePositiveInt(
    process.env.JOBS_SCRAPE_MAX_SOURCE_DURATION_MS,
    DEFAULT_SOURCE_BUDGET_MS
  );
  const maxDescriptionChars = parsePositiveInt(
    process.env.JOBS_SCRAPE_MAX_DESCRIPTION_CHARS,
    DEFAULT_MAX_DESCRIPTION_CHARS
  );
  const maxPdfTextChars = parsePositiveInt(
    process.env.JOBS_SCRAPE_PDF_MAX_TEXT_CHARS,
    DEFAULT_MAX_PDF_TEXT_CHARS
  );
  const pdfExtractionSettings = await getJobsPdfExtractionSettingsUncached();

  const httpClient = new RobustHttpClient();
  const sourceStatsByIndex = Array.from(
    { length: sources.length },
    (_value, index) => createSourceStatsFallback(sources[index]?.name || `source-${index + 1}`)
  );

  const combinedJobs: NewJobRow[] = [];
  const seenSourceUrls = new Set<string>();
  const seenContentHashes = new Set<string>();

  let cancelled = false;
  let totalDuplicatesInRun = 0;
  let totalExtracted = 0;
  let totalSkippedExisting = 0;
  let totalFilteredByLocation = 0;
  let totalFilteredByDate = 0;
  let totalFilteredByKeyword = 0;
  let sourcesProcessed = 0;

  const sharedCaches = {
    detailMarkdownByUrl: new Map<string, string | null>(),
    pdfByUrl: new Map<string, CachedPdfExtractionResult | null>(),
  };

  await runWithConcurrency(
    sources.map((source, sourceIndex) => ({ source, sourceIndex })),
    sourceConcurrency,
    async ({ source, sourceIndex }) => {
      if (cancelled || (await options.shouldCancel?.()) === true) {
        cancelled = true;
        return;
      }

      await options.onSourceStart?.({
        source: source.name,
        sourceIndex,
        totalSources: sources.length,
        lookbackDays,
      });

      let sourceResult: ProcessedSourceResult;
      try {
        sourceResult = await scrapeSource({
          source,
          sourceIndex,
          context: {
            now,
            lookbackDays,
            skipExistingSourceUrls: options.skipExistingSourceUrls === true,
            shouldCancel: options.shouldCancel,
            sourceMaxItems,
            detailFetchConcurrency,
            requestTimeoutMs,
            requestRetryAttempts,
            sourceBudgetMs,
            maxDescriptionChars,
            maxPdfTextChars,
            pdfExtractionSettings,
            includeKeywords: [],
            excludeKeywords: [],
            sharedCaches,
          },
          httpClient,
        });
      } catch (error) {
        sourceResult = {
          source,
          sourceIndex,
          jobs: [],
          stats: {
            ...createSourceStatsFallback(source.name),
            parseErrors: 1,
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          cancelled: false,
        };
      }

      const stats = sourceResult.stats;
      sourceStatsByIndex[sourceIndex] = stats;
      sourcesProcessed += 1;
      totalExtracted += stats.extracted;
      totalSkippedExisting += stats.skippedExisting;
      totalFilteredByLocation += stats.filteredByLocation;
      totalFilteredByDate += stats.filteredByDate;
      totalFilteredByKeyword += stats.filteredByKeyword;
      if (sourceResult.cancelled || (await options.shouldCancel?.()) === true) {
        cancelled = true;
      }

      const uniqueJobs: NewJobRow[] = [];
      for (const job of sourceResult.jobs) {
        const sourceUrl = job.source_url.trim();
        const contentHash =
          typeof job.content_hash === "string" && job.content_hash.trim()
            ? job.content_hash.trim()
            : "";
        const duplicateByUrl = sourceUrl ? seenSourceUrls.has(sourceUrl) : false;
        const duplicateByHash = contentHash ? seenContentHashes.has(contentHash) : false;
        if (duplicateByUrl || duplicateByHash) {
          totalDuplicatesInRun += 1;
          continue;
        }
        if (sourceUrl) {
          seenSourceUrls.add(sourceUrl);
        }
        if (contentHash) {
          seenContentHashes.add(contentHash);
        }
        uniqueJobs.push(job);
        combinedJobs.push(job);
      }

      if (uniqueJobs.length > 0) {
        await options.onSourceJobs?.({
          source: source.name,
          sourceIndex,
          totalSources: sources.length,
          jobs: uniqueJobs,
        });
      }

      await options.onSourceComplete?.({
        source: source.name,
        sourceIndex,
        totalSources: sources.length,
        lookbackDays,
        stats,
      });
    }
  );

  return {
    jobs: combinedJobs,
    summary: {
      sourcesProcessed,
      totalSources: sources.length,
      lookbackDays,
      totalExtracted,
      totalSkippedExisting,
      totalFilteredByLocation,
      totalFilteredByDate,
      totalFilteredByKeyword,
      totalDuplicatesInRun,
      cancelled,
      sourceStats: sourceStatsByIndex,
    },
  };
}

export async function runJobsScraper(
  sources: JobSourceConfig[] = jobSources,
  options: JobsScraperRuntimeOptions = {}
): Promise<RunJobsScraperResult> {
  const persistTimeoutMs = parsePositiveInt(
    process.env.JOBS_SCRAPE_PERSIST_TIMEOUT_MS,
    DEFAULT_PERSIST_TIMEOUT_MS
  );
  const ragSyncTimeoutMs = parsePositiveInt(
    process.env.JOBS_SCRAPE_RAG_SYNC_TIMEOUT_MS,
    DEFAULT_RAG_SYNC_TIMEOUT_MS
  );

  let attemptedCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedDuplicateCount = 0;
  const persistedJobIds = new Set<string>();

  const scraped = await scrapeJobsFromSources(sources, {
    ...options,
    onSourceJobs: async (event) => {
      await options.onSourceJobs?.(event);

      const persisted = await withTimeout(
        saveJobs(event.jobs, {
          onDuplicate: "update",
          syncRag: false,
        }),
        persistTimeoutMs
      );

      attemptedCount += persisted.attemptedCount;
      insertedCount += persisted.insertedCount;
      updatedCount += persisted.updatedCount;
      skippedDuplicateCount += persisted.skippedDuplicateCount;
      for (const jobId of persisted.writtenJobIds) {
        persistedJobIds.add(jobId);
      }

      await options.onSourcePersisted?.({
        source: event.source,
        sourceIndex: event.sourceIndex,
        totalSources: event.totalSources,
        persisted,
      });
    },
  });

  const writtenJobIds = Array.from(persistedJobIds);
  if (writtenJobIds.length > 0) {
    const totalIndexedJobs = writtenJobIds.length;
    await options.onFinalizeProgress?.({
      phase: "rag_sync",
      processed: 0,
      total: totalIndexedJobs,
      message: `All sources scraped. Indexing ${totalIndexedJobs} job${
        totalIndexedJobs === 1 ? "" : "s"
      } for chat responses...`,
      failureDetails: [],
    });

    try {
      await withTimeout(
        syncJobPostingsToRag({
          jobIds: writtenJobIds,
          onProgress: async ({
            processed,
            total,
            created,
            updated,
            failed,
            failureDetails,
          }) => {
            await options.onFinalizeProgress?.({
              phase: "rag_sync",
              processed,
              total,
              message: `All sources scraped. Indexing jobs for chat (${processed}/${total}, created ${created}, updated ${updated}, failed ${failed}).`,
              failureDetails,
            });
          },
        }),
        ragSyncTimeoutMs
      );
    } catch (error) {
      console.warn("[jobs-scraper] rag_sync_failed", {
        count: writtenJobIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
      await options.onFinalizeProgress?.({
        phase: "rag_sync",
        processed: totalIndexedJobs,
        total: totalIndexedJobs,
        message:
          "All sources scraped. Chat indexing timed out or failed; job rows were still saved.",
      });
    }
  }

  const persisted = {
    attemptedCount,
    insertedCount,
    updatedCount,
    skippedDuplicateCount,
    writtenJobIds,
  };

  console.info("[jobs-scraper] run_complete", {
    sourcesProcessed: scraped.summary.sourcesProcessed,
    totalSources: scraped.summary.totalSources,
    lookbackDays: scraped.summary.lookbackDays,
    extractedAfterFilters: scraped.jobs.length,
    attemptedInsert: persisted.attemptedCount,
    inserted: persisted.insertedCount,
    updated: persisted.updatedCount,
    skippedDuplicates: persisted.skippedDuplicateCount + scraped.summary.totalDuplicatesInRun,
    skippedExisting: scraped.summary.totalSkippedExisting,
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

export type {
  JobsScraperRuntimeOptions,
  RunJobsScraperResult,
  ScrapeJobsResult,
  SourceScrapeStats,
} from "./scraping-types";
