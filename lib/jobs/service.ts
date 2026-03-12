import "server-only";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { ragEntry } from "@/lib/db/schema";
import {
  isJobSector,
  isJobType,
  resolveJobSector,
  resolveJobType,
  type JobSector,
} from "@/lib/jobs/sector";
import type {
  RagEmbeddingStatus,
  RagEntryApprovalStatus,
  RagEntryStatus,
  RagEntry,
} from "@/lib/db/schema";
import { db } from "@/lib/db/queries";
import { DEFAULT_JOB_LOCATION, resolveJobLocation } from "@/lib/jobs/location";
import { parseJobsPdfExtractedData } from "@/lib/jobs/pdf-extraction";
import { NO_SALARY_LABEL, resolveJobSalaryInfo } from "@/lib/jobs/salary";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/utils/async";
import {
  listQuestionPaperEntries,
  listQuestionPapers,
} from "@/lib/study/service";
import type { QuestionPaperRecord } from "@/lib/study/types";
import { toJobListItems } from "./list-items";
import type {
  JobCard,
  JobListItem,
  JobPostingRecord,
  JobStudyLinkResult,
} from "./types";

export const JOBS_CHAT_MODE = "jobs" as const;
export const JOB_POSTING_MAX_TEXT_CHARS = 120_000;
export const JOB_POSTING_RUNTIME_CONTEXT_CHARS = 80_000;

const UNKNOWN_LABEL = "Unknown";
const DEFAULT_JOB_APPROVAL_STATUS: RagEntryApprovalStatus = "approved";
const DEFAULT_JOB_EMBEDDING_STATUS: RagEmbeddingStatus = "pending";
const JOBS_SERVICE_CACHE_REVALIDATE_SECONDS = 30;
const JOBS_RAG_KIND = "job_posting";
const JOBS_RAG_SOURCE = "supabase_jobs_table";
const DEFAULT_JOBS_RAG_LOOKUP_TIMEOUT_MS =
  process.env.NODE_ENV === "development" ? 750 : 2_500;
const jobsRagLookupTimeoutRaw = Number.parseInt(
  process.env.JOBS_RAG_LOOKUP_TIMEOUT_MS ?? "",
  10
);
const JOBS_RAG_LOOKUP_TIMEOUT_MS =
  Number.isFinite(jobsRagLookupTimeoutRaw) && jobsRagLookupTimeoutRaw > 0
    ? Math.max(500, Math.min(jobsRagLookupTimeoutRaw, 10_000))
    : DEFAULT_JOBS_RAG_LOOKUP_TIMEOUT_MS;
const JOBS_RAG_FAILURE_COOLDOWN_MS =
  process.env.NODE_ENV === "development" ? 30_000 : 10_000;
let jobsRagBlockedUntil = 0;

function shouldSkipJobsRagLookup() {
  return Date.now() < jobsRagBlockedUntil;
}

function markJobsRagLookupFailure() {
  jobsRagBlockedUntil = Date.now() + JOBS_RAG_FAILURE_COOLDOWN_MS;
}

function clearJobsRagLookupFailure() {
  jobsRagBlockedUntil = 0;
}

type JobsServiceCacheState = {
  jobsByIdFetchedAt: number;
  jobsByIdPromise: Promise<SupabaseJobRow[]> | null;
  jobsByIdRows: SupabaseJobRow[] | null;
  jobListItemsFetchedAt: number;
  jobListItemsPromise: Promise<JobListItem[]> | null;
  jobListItems: JobListItem[] | null;
};

type GlobalJobsServiceState = typeof globalThis & {
  __jobsServiceCacheState?: JobsServiceCacheState;
};

type JobPostingMetadataInput = {
  jobId: string;
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  sector?: JobSector | null;
  studyExam: string;
  studyRole: string;
  studyYears: number[];
  studyTags: string[];
  tags: string[];
  source?: string | null;
  sourceUrl?: string | null;
  pdfSourceUrl?: string | null;
  description?: string | null;
  pdfContent?: string | null;
  parseError?: string | null;
};

type SupabaseJobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string | null;
  source?: string | null;
  application_link?: string | null;
  description: string | null;
  pdf_content?: string | null;
  pdf_extracted_data?: unknown;
  content_hash?: string | null;
  status: string | null;
  source_url: string;
  pdf_source_url?: string | null;
  pdf_cached_url?: string | null;
  created_at: string;
};

type SupabaseJobListRow = Pick<
  SupabaseJobRow,
  | "id"
  | "title"
  | "company"
  | "location"
  | "salary"
  | "source"
  | "description"
  | "pdf_extracted_data"
  | "source_url"
  | "pdf_source_url"
  | "pdf_cached_url"
  | "created_at"
>;

const globalJobsServiceState = globalThis as GlobalJobsServiceState;

const jobsServiceCacheState =
  globalJobsServiceState.__jobsServiceCacheState ??
  ({
    jobsByIdFetchedAt: 0,
    jobsByIdPromise: null,
    jobsByIdRows: null,
    jobListItemsFetchedAt: 0,
    jobListItemsPromise: null,
    jobListItems: null,
  } satisfies JobsServiceCacheState);

globalJobsServiceState.__jobsServiceCacheState ??= jobsServiceCacheState;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseValidDate(value: string | null | undefined) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function isJobsServiceCacheFresh(fetchedAt: number) {
  return (
    fetchedAt > 0 &&
    Date.now() - fetchedAt < JOBS_SERVICE_CACHE_REVALIDATE_SECONDS * 1000
  );
}

function resolveSourceNameFallback(rawSourceUrl: string) {
  const normalizedUrl = rawSourceUrl.trim();
  if (!normalizedUrl) {
    return "Source";
  }

  if (normalizedUrl.startsWith("manual://")) {
    return "Manual source";
  }

  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "").trim();
    if (!hostname) {
      return "Source";
    }

    if (hostname.toLowerCase().includes("linkedin.")) {
      return "LinkedIn";
    }

    return hostname;
  } catch {
    return "Source";
  }
}

function resolveCompanyName({
  rawCompany,
  rawSourceUrl,
}: {
  rawCompany: string;
  rawSourceUrl: string;
}) {
  const normalizedCompany = rawCompany.trim();
  if (normalizedCompany) {
    const lowered = normalizedCompany.toLowerCase();
    if (
      lowered !== "unknown" &&
      lowered !== "n/a" &&
      lowered !== "na" &&
      lowered !== "not available"
    ) {
      return normalizedCompany;
    }
  }

  return resolveSourceNameFallback(rawSourceUrl);
}

function normalizeJobPostingRecord(row: SupabaseJobRow): JobPostingRecord {
  const createdAt = parseValidDate(row.created_at);
  const rawSourceUrl = toTrimmedString(row.source_url);
  const rawApplicationLink = toTrimmedString(row.application_link ?? null);
  const rawSalary = toTrimmedString(row.salary ?? null);
  const content = toTrimmedString(row.description);
  const source = toTrimmedString(row.source ?? null) || null;
  const pdfContent = toTrimmedString(row.pdf_content ?? null) || null;
  const pdfExtractedData = parseJobsPdfExtractedData(row.pdf_extracted_data);
  const company = resolveCompanyName({
    rawCompany: toTrimmedString(row.company),
    rawSourceUrl,
  });
  const sector = resolveJobSector({
    title: toTrimmedString(row.title),
    company,
    source,
    sourceUrl: rawSourceUrl,
    applicationLink: rawApplicationLink,
    pdfSourceUrl: toTrimmedString(row.pdf_source_url ?? null),
    pdfCachedUrl: toTrimmedString(row.pdf_cached_url ?? null),
    description: content,
    pdfContent,
  });
  const sourceUrl =
    rawSourceUrl && !rawSourceUrl.startsWith("manual://") ? rawSourceUrl : null;
  const applicationLink =
    rawApplicationLink && !rawApplicationLink.startsWith("manual://")
      ? rawApplicationLink
      : sourceUrl;
  const normalizedStatusRaw = toTrimmedString(row.status).toLowerCase();
  const status: RagEntryStatus =
    normalizedStatusRaw === "inactive"
      ? "inactive"
      : normalizedStatusRaw === "archived"
        ? "archived"
        : "active";

  return {
    id: row.id,
    title: toTrimmedString(row.title) || "Job opening",
    content,
    company,
    location: resolveJobLocation({
      location: toTrimmedString(row.location),
      content,
      pdfContent,
    }),
    salary: (() => {
      const summary = resolveJobSalaryInfo({
        salary: rawSalary,
        content,
        pdfContent,
        extractedData: pdfExtractedData,
      }).summary;
      return summary === NO_SALARY_LABEL ? null : summary;
    })(),
    source,
    applicationLink,
    pdfContent,
    pdfExtractedData,
    contentHash: toTrimmedString(row.content_hash ?? null) || null,
    sector,
    employmentType: resolveJobType(sector),
    studyExam: UNKNOWN_LABEL,
    studyRole: UNKNOWN_LABEL,
    studyYears: [],
    studyTags: [],
    tags: [],
    sourceUrl,
    pdfSourceUrl: toTrimmedString(row.pdf_source_url ?? null) || null,
    pdfCachedUrl: toTrimmedString(row.pdf_cached_url ?? null) || null,
    status,
    approvalStatus: DEFAULT_JOB_APPROVAL_STATUS,
    embeddingStatus: DEFAULT_JOB_EMBEDDING_STATUS,
    metadata: {
      jobs_kind: JOBS_RAG_KIND,
      jobs_source: JOBS_RAG_SOURCE,
      source: JOBS_RAG_SOURCE,
      sector,
    },
    models: [],
    categoryId: null,
    parseError: null,
    createdAt,
    updatedAt: createdAt,
  };
}

async function listJobsFromSupabaseUncached() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`[jobs-service] Failed to fetch jobs: ${error.message}`);
  }

  return (data ?? []) as SupabaseJobRow[];
}

async function listJobListRowsFromSupabaseUncached() {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id,title,company,location,salary,source,description,pdf_extracted_data,source_url,pdf_source_url,pdf_cached_url,created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`[jobs-service] Failed to fetch jobs list: ${error.message}`);
  }

  return (data ?? []) as SupabaseJobListRow[];
}

async function getJobFromSupabaseByIdUncached(id: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`[jobs-service] Failed to fetch job by id: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return data as SupabaseJobRow;
}

async function listJobsFromSupabaseCached() {
  if (
    jobsServiceCacheState.jobsByIdRows &&
    isJobsServiceCacheFresh(jobsServiceCacheState.jobsByIdFetchedAt)
  ) {
    return jobsServiceCacheState.jobsByIdRows;
  }

  if (jobsServiceCacheState.jobsByIdPromise) {
    return jobsServiceCacheState.jobsByIdPromise;
  }

  jobsServiceCacheState.jobsByIdPromise = listJobsFromSupabaseUncached()
    .then((rows) => {
      jobsServiceCacheState.jobsByIdRows = rows;
      jobsServiceCacheState.jobsByIdFetchedAt = Date.now();
      return rows;
    })
    .finally(() => {
      jobsServiceCacheState.jobsByIdPromise = null;
    });

  return jobsServiceCacheState.jobsByIdPromise;
}

async function getJobFromSupabaseByIdCached(id: string) {
  if (
    jobsServiceCacheState.jobsByIdRows &&
    isJobsServiceCacheFresh(jobsServiceCacheState.jobsByIdFetchedAt)
  ) {
    const cached = jobsServiceCacheState.jobsByIdRows.find((row) => row.id === id);
    if (cached) {
      return cached;
    }
  }

  return getJobFromSupabaseByIdUncached(id);
}

export function buildJobPostingMetadata(
  input: JobPostingMetadataInput
): Record<string, unknown> {
  const company = input.company.trim() || UNKNOWN_LABEL;
  const location = input.location.trim() || DEFAULT_JOB_LOCATION;
  const sector =
    input.sector && isJobSector(input.sector)
      ? input.sector
      : resolveJobSector({
          title: input.jobTitle,
          company,
          source: input.source,
          sourceUrl: input.sourceUrl,
          pdfSourceUrl: input.pdfSourceUrl,
          description: input.description,
          pdfContent: input.pdfContent,
          tags: input.tags,
        });
  const studyExam = input.studyExam.trim() || UNKNOWN_LABEL;
  const studyRole = input.studyRole.trim() || UNKNOWN_LABEL;
  const studyYears = Array.from(
    new Set(
      input.studyYears
        .map((value) => Math.trunc(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
  const studyTags = Array.from(
    new Set(input.studyTags.map((tag) => tag.trim()).filter(Boolean))
  );
  const jobTitle = input.jobTitle.trim() || "Job opening";
  const tags = Array.from(
    new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))
  );

  return {
    jobs_kind: "job_posting",
    jobs_source: JOBS_RAG_SOURCE,
    job_id: input.jobId,
    job_title: jobTitle,
    company,
    location,
    employment_type: resolveJobType(sector),
    sector,
    study_exam: studyExam,
    study_role: studyRole,
    study_years: studyYears,
    study_tags: studyTags,
    tags,
    parse_error: input.parseError ?? null,
  };
}

export async function listJobPostingEntries({
  includeInactive = false,
}: {
  includeInactive?: boolean;
} = {}): Promise<JobPostingRecord[]> {
  const rows = includeInactive
    ? await listJobsFromSupabaseUncached()
    : await listJobsFromSupabaseCached();
  const normalized = rows.map(normalizeJobPostingRecord);
  const ragStateById = await getJobRagStateByIds(normalized.map((job) => job.id));
  const hydrated = normalized.map((job) =>
    applyRagStateToJob(job, ragStateById.get(job.id) ?? null)
  );

  if (includeInactive) {
    return hydrated;
  }

  return hydrated.filter((job) => job.status === "active");
}

export async function getJobPostingById({
  id,
  includeInactive = false,
}: {
  id: string;
  includeInactive?: boolean;
}): Promise<JobPostingRecord | null> {
  const row = includeInactive
    ? await getJobFromSupabaseByIdUncached(id)
    : await getJobFromSupabaseByIdCached(id);
  if (!row) {
    return null;
  }

  const normalized = normalizeJobPostingRecord(row);
  const ragStateById = await getJobRagStateByIds([normalized.id]);
  const hydrated = applyRagStateToJob(
    normalized,
    ragStateById.get(normalized.id) ?? null
  );
  if (!includeInactive && hydrated.status !== "active") {
    return null;
  }

  return hydrated;
}

export async function getJobPostingEntryById({
  id,
}: {
  id: string;
}): Promise<JobPostingRecord | null> {
  return getJobPostingById({ id, includeInactive: true });
}

export async function listJobPostings({
  includeInactive = false,
  company,
  location,
}: {
  includeInactive?: boolean;
  company?: string | null;
  location?: string | null;
} = {}): Promise<JobPostingRecord[]> {
  const jobs = await listJobPostingEntries({ includeInactive });
  const normalizedCompany = company?.trim().toLowerCase() ?? null;
  const normalizedLocation = location?.trim().toLowerCase() ?? null;

  return jobs.filter((job) => {
    const companyMatch =
      !normalizedCompany ||
      job.company.trim().toLowerCase().includes(normalizedCompany);
    const locationMatch =
      !normalizedLocation ||
      job.location.trim().toLowerCase().includes(normalizedLocation);
    return companyMatch && locationMatch;
  });
}

export async function listJobListItems(): Promise<JobListItem[]> {
  if (
    jobsServiceCacheState.jobListItems &&
    isJobsServiceCacheFresh(jobsServiceCacheState.jobListItemsFetchedAt)
  ) {
    return jobsServiceCacheState.jobListItems;
  }

  if (jobsServiceCacheState.jobListItemsPromise) {
    return jobsServiceCacheState.jobListItemsPromise;
  }

  jobsServiceCacheState.jobListItemsPromise = listJobListRowsFromSupabaseUncached()
    .then((rows) => rows.map(normalizeJobListItemSource))
    .then((rows) => toJobListItems(rows))
    .then((items) => {
      jobsServiceCacheState.jobListItems = items;
      jobsServiceCacheState.jobListItemsFetchedAt = Date.now();
      return items;
    })
    .finally(() => {
      jobsServiceCacheState.jobListItemsPromise = null;
    });

  return jobsServiceCacheState.jobListItemsPromise;
}

export async function listActiveJobPostingIdsForModel({
  modelConfigId,
  modelKey,
}: {
  modelConfigId: string;
  modelKey?: string | null;
}): Promise<string[]> {
  const rows = await db
    .select({
      id: ragEntry.id,
      models: ragEntry.models,
    })
    .from(ragEntry)
    .where(
      and(
        isNull(ragEntry.deletedAt),
        eq(ragEntry.status, "active"),
        eq(ragEntry.approvalStatus, "approved"),
        sql`(${ragEntry.metadata} ->> 'jobs_kind') = ${JOBS_RAG_KIND}`,
        sql`(${ragEntry.metadata} ->> 'jobs_source') = ${JOBS_RAG_SOURCE}`
      )
    )
    .orderBy(desc(ragEntry.updatedAt));

  const normalizedModelKey = modelKey?.trim() ?? null;
  return rows
    .filter((row) => {
      const models = Array.isArray(row.models) ? row.models : [];
      if (models.length === 0) {
        return true;
      }
      if (models.includes(modelConfigId)) {
        return true;
      }
      if (normalizedModelKey && models.includes(normalizedModelKey)) {
        return true;
      }
      return false;
    })
    .map((row) => row.id);
}

export function toJobCard(job: JobPostingRecord): JobCard {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    salary: job.salary,
    source: job.source,
    applicationLink: job.applicationLink,
    employmentType: job.employmentType,
    studyExam: job.studyExam,
    studyRole: job.studyRole,
    studyYears: job.studyYears,
    studyTags: job.studyTags,
    tags: job.tags,
    sourceUrl: job.sourceUrl,
    pdfSourceUrl: job.pdfSourceUrl,
    pdfCachedUrl: job.pdfCachedUrl,
  };
}

function normalizeJobListItemSource(row: SupabaseJobListRow) {
  const createdAt = parseValidDate(row.created_at);
  const rawSourceUrl = toTrimmedString(row.source_url);
  const rawSalary = toTrimmedString(row.salary ?? null);
  const content = toTrimmedString(row.description);
  const source = toTrimmedString(row.source ?? null) || null;
  const pdfExtractedData = parseJobsPdfExtractedData(row.pdf_extracted_data);
  const company = resolveCompanyName({
    rawCompany: toTrimmedString(row.company),
    rawSourceUrl,
  });
  const pdfSourceUrl = toTrimmedString(row.pdf_source_url ?? null) || null;
  const pdfCachedUrl = toTrimmedString(row.pdf_cached_url ?? null) || null;
  const sector = resolveJobSector({
    title: toTrimmedString(row.title),
    company,
    source,
    sourceUrl: rawSourceUrl,
    pdfSourceUrl,
    pdfCachedUrl,
    description: content,
    pdfContent: null,
  });
  const sourceUrl =
    rawSourceUrl && !rawSourceUrl.startsWith("manual://") ? rawSourceUrl : null;

  return {
    id: row.id,
    title: toTrimmedString(row.title) || "Job opening",
    content,
    company,
    location: resolveJobLocation({
      location: toTrimmedString(row.location),
      content,
      pdfContent: null,
    }),
    salary: (() => {
      const summary = resolveJobSalaryInfo({
        salary: rawSalary,
        content,
        pdfContent: null,
        extractedData: pdfExtractedData,
      }).summary;
      return summary === NO_SALARY_LABEL ? null : summary;
    })(),
    source,
    pdfContent: null,
    pdfExtractedData,
    employmentType: resolveJobType(sector),
    sourceUrl,
    pdfSourceUrl,
    pdfCachedUrl,
    createdAt,
  };
}

function toMetadataRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function getMetadataStringList(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getMetadataNumberList(metadata: Record<string, unknown>, key: string) {
  const raw = metadata[key];
  if (!Array.isArray(raw)) {
    return [];
  }
  const values = raw
    .map((item) => {
      if (typeof item === "number" && Number.isFinite(item)) {
        return Math.trunc(item);
      }
      if (typeof item === "string") {
        const parsed = Number.parseInt(item.trim(), 10);
        return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
      }
      return null;
    })
    .filter((item): item is number => Boolean(item && item > 0));
  return Array.from(new Set(values));
}

function applyRagStateToJob(
  job: JobPostingRecord,
  ragState: Pick<
    RagEntry,
    | "status"
    | "approvalStatus"
    | "embeddingStatus"
    | "metadata"
    | "models"
    | "categoryId"
    | "createdAt"
    | "updatedAt"
  > | null
): JobPostingRecord {
  if (!ragState) {
    return job;
  }

  const metadata = toMetadataRecord(ragState.metadata);
  const mergedMetadata: Record<string, unknown> = {
    ...job.metadata,
    ...metadata,
  };
  const metadataSector = isJobSector(metadata.sector) ? metadata.sector : null;
  const metadataStudyExam = toTrimmedString(metadata.study_exam);
  const metadataStudyRole = toTrimmedString(metadata.study_role);
  const metadataTags = getMetadataStringList(metadata, "tags");
  const metadataStudyTags = getMetadataStringList(metadata, "study_tags");
  const metadataStudyYears = getMetadataNumberList(metadata, "study_years");
  const metadataParseError = toTrimmedString(metadata.parse_error) || null;
  const metadataSourceUrl = toTrimmedString(metadata.source_url) || null;
  const resolvedSector =
    job.sector !== "unknown" ? job.sector : metadataSector ?? "unknown";
  mergedMetadata.sector = resolvedSector;
  const resolvedEmploymentType = resolveJobType(resolvedSector);

  return {
    ...job,
    sector: resolvedSector,
    employmentType: resolvedEmploymentType,
    studyExam: metadataStudyExam || job.studyExam,
    studyRole: metadataStudyRole || job.studyRole,
    studyYears: metadataStudyYears.length > 0 ? metadataStudyYears : job.studyYears,
    studyTags: metadataStudyTags.length > 0 ? metadataStudyTags : job.studyTags,
    tags: metadataTags.length > 0 ? metadataTags : job.tags,
    parseError: metadataParseError ?? job.parseError ?? null,
    sourceUrl: job.sourceUrl ?? metadataSourceUrl,
    status: ragState.status,
    approvalStatus: ragState.approvalStatus,
    embeddingStatus: ragState.embeddingStatus,
    metadata: mergedMetadata,
    models: Array.isArray(ragState.models) ? ragState.models : [],
    categoryId: ragState.categoryId ?? null,
    createdAt:
      ragState.createdAt instanceof Date
        ? ragState.createdAt
        : job.createdAt,
    updatedAt:
      ragState.updatedAt instanceof Date
        ? ragState.updatedAt
        : job.updatedAt,
  };
}

async function getJobRagStateByIds(ids: string[]) {
  const normalizedIds = Array.from(
    new Set(ids.map((id) => id.trim()).filter((id) => id.length > 0))
  );
  if (normalizedIds.length === 0) {
    return new Map<string, RagEntry>();
  }
  if (shouldSkipJobsRagLookup()) {
    return new Map<string, RagEntry>();
  }

  try {
    const rows = await withTimeout(
      db
        .select()
        .from(ragEntry)
        .where(
          and(
            inArray(ragEntry.id, normalizedIds),
            isNull(ragEntry.deletedAt),
            sql`(${ragEntry.metadata} ->> 'jobs_kind') = ${JOBS_RAG_KIND}`,
            sql`(${ragEntry.metadata} ->> 'jobs_source') = ${JOBS_RAG_SOURCE}`
          )
        ),
      JOBS_RAG_LOOKUP_TIMEOUT_MS,
      () => {
        console.warn(
          `[jobs-service] RAG state lookup timed out after ${JOBS_RAG_LOOKUP_TIMEOUT_MS}ms for ${normalizedIds.length} job id(s).`
        );
      }
    );

    clearJobsRagLookupFailure();
    return new Map(rows.map((row) => [row.id, row] as const));
  } catch (error) {
    markJobsRagLookupFailure();
    console.error(
      `[jobs-service] Failed to load RAG state for ${normalizedIds.length} job id(s). Falling back to Supabase jobs data only.`,
      error
    );
    return new Map<string, RagEntry>();
  }
}

function matchesStudyTag(paper: QuestionPaperRecord, tags: Set<string>) {
  if (tags.size === 0) {
    return false;
  }

  const values = [
    ...paper.tags.map((tag) => tag.trim().toLowerCase()),
    paper.exam.trim().toLowerCase(),
    paper.role.trim().toLowerCase(),
    paper.title.trim().toLowerCase(),
  ];

  return values.some((value) => value && tags.has(value));
}

export async function listStudyPapersForJob({
  jobPostingId,
  limit = 6,
}: {
  jobPostingId: string;
  limit?: number;
}): Promise<JobStudyLinkResult> {
  const job = await getJobPostingById({
    id: jobPostingId,
    includeInactive: false,
  });
  if (!job) {
    return { papers: [], source: "none" };
  }

  const normalizedExam = job.studyExam.trim().toLowerCase();
  const normalizedRole = job.studyRole.trim().toLowerCase();
  const hasExam = normalizedExam.length > 0 && normalizedExam !== "unknown";
  const hasRole = normalizedRole.length > 0 && normalizedRole !== "unknown";
  const validYears = Array.from(
    new Set(
      job.studyYears
        .map((value) => Math.trunc(value))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
  );
  const studyTagSet = new Set(
    job.studyTags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)
  );

  if (hasExam && hasRole && validYears.length > 0) {
    const exactYearMatches = await Promise.all(
      validYears.map((year) =>
        listQuestionPapers({
          includeInactive: false,
          exam: job.studyExam,
          role: job.studyRole,
          year,
        })
      )
    );
    const exactMatches = Array.from(
      new Map(
        exactYearMatches
          .flat()
          .map((paper) => [paper.id, paper] as const)
      ).values()
    ).slice(0, Math.max(1, limit));

    if (exactMatches.length > 0) {
      return { papers: exactMatches, source: "exact" };
    }
  }

  if (hasExam && hasRole) {
    const examRoleMatches = await listQuestionPapers({
      includeInactive: false,
      exam: job.studyExam,
      role: job.studyRole,
    });
    if (examRoleMatches.length > 0) {
      return { papers: examRoleMatches.slice(0, Math.max(1, limit)), source: "exam_role" };
    }
  }

  if (studyTagSet.size > 0) {
    const allPapers = await listQuestionPaperEntries({ includeInactive: false });
    const tagMatches = allPapers
      .filter((paper) => matchesStudyTag(paper, studyTagSet))
      .slice(0, Math.max(1, limit));

    if (tagMatches.length > 0) {
      return { papers: tagMatches, source: "tags" };
    }
  }

  return { papers: [], source: "none" };
}
