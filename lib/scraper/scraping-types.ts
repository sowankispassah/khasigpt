import type { JobSourceConfig } from "@/config/jobSources";
import type { JobsPdfExtractedData } from "@/lib/jobs/pdf-extraction";
import type { JobsPdfExtractionSettings } from "@/lib/jobs/pdf-extraction-settings";
import type { NewJobRow, SaveJobsResult } from "@/lib/jobs/saveJobs";
import type { PdfStructuredFields } from "@/lib/scraper/scraper-utils";

export type SourceScrapeStats = {
  source: string;
  fetched: boolean;
  containersScanned: number;
  extracted: number;
  skippedExisting: number;
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
    totalSkippedExisting: number;
    totalFilteredByLocation: number;
    totalFilteredByDate: number;
    totalFilteredByKeyword: number;
    totalDuplicatesInRun: number;
    cancelled: boolean;
    sourceStats: SourceScrapeStats[];
  };
};

export type RunJobsScraperResult = ScrapeJobsResult & {
  persisted: SaveJobsResult;
};

export type JobsScraperFinalizeProgressEvent = {
  phase: "rag_sync";
  processed: number;
  total: number;
  message: string;
  failureDetails?: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
};

export type JobsScraperRuntimeOptions = {
  lookbackDays?: number;
  skipExistingSourceUrls?: boolean;
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
  onSourceJobs?: (event: {
    source: string;
    sourceIndex: number;
    totalSources: number;
    jobs: NewJobRow[];
  }) => void | Promise<void>;
  onSourcePersisted?: (event: {
    source: string;
    sourceIndex: number;
    totalSources: number;
    persisted: SaveJobsResult;
  }) => void | Promise<void>;
  onFinalizeProgress?: (
    event: JobsScraperFinalizeProgressEvent
  ) => void | Promise<void>;
  sourceConcurrency?: number;
};

export type PdfExtractionResult = {
  pdfSourceUrl: string;
  pdfCachedUrl: string | null;
  pdfText: string;
  extractedData?: JobsPdfExtractedData | null;
  extractedFieldsCount: number;
};

export type CachedPdfExtractionResult = PdfExtractionResult & {
  fields: PdfStructuredFields;
};

export type SourceProcessingContext = {
  now: Date;
  lookbackDays: number;
  skipExistingSourceUrls: boolean;
  shouldCancel?: () => boolean | Promise<boolean>;
  sourceMaxItems: number;
  detailFetchConcurrency: number;
  requestTimeoutMs: number;
  requestRetryAttempts: number;
  sourceBudgetMs: number;
  maxDescriptionChars: number;
  maxPdfTextChars: number;
  pdfExtractionSettings: JobsPdfExtractionSettings;
  includeKeywords: string[];
  excludeKeywords: string[];
  sharedCaches: {
    detailMarkdownByUrl: Map<string, string | null>;
    pdfByUrl: Map<string, CachedPdfExtractionResult | null>;
  };
};

export type ProcessedSourceResult = {
  sourceIndex: number;
  source: JobSourceConfig;
  jobs: NewJobRow[];
  stats: SourceScrapeStats;
  cancelled: boolean;
};
