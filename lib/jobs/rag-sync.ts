import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ragEntry, user } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { parseJobsPdfExtractedData } from "@/lib/jobs/pdf-extraction";
import { buildJobKnowledgeUnit } from "@/lib/jobs/knowledge";
import { normalizeJobPostingRecord } from "@/lib/jobs/service";
import {
  createRagEntry,
  deleteRagEntries,
  updateRagEntry,
} from "@/lib/rag/service";
import {
  parsePositiveInt,
  runWithConcurrency,
  sleep,
} from "@/lib/scraper/scraper-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

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

const UNKNOWN_LABEL = "Unknown";
const JOBS_RAG_SYNC_VERSION = 2;
const JOBS_KNOWLEDGE_COLLATION_VERSION = 2;
const DEFAULT_JOBS_RAG_SYNC_CONCURRENCY = 4;
const DEFAULT_JOBS_RAG_SYNC_RETRY_ATTEMPTS = 2;
const DEFAULT_JOBS_RAG_SYNC_RETRY_DELAY_MS = 600;
const MAX_RAG_SYNC_FAILURE_DETAILS = 8;
const RAG_ENTRY_TITLE_MAX_CHARS = 160;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toRagSafeTitle(value: string) {
  const normalized = value.trim() || "Job opening";
  if (normalized.length <= RAG_ENTRY_TITLE_MAX_CHARS) {
    return normalized;
  }
  return `${normalized.slice(0, RAG_ENTRY_TITLE_MAX_CHARS - 3).trimEnd()}...`;
}

function isRetryableRagSyncError(error: unknown) {
  if (error instanceof ChatSDKError) {
    return false;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /timeout|timed out|temporar|network|socket|fetch failed|429|5\d\d|deadlock|connection/i.test(
    message
  );
}

function normalizeJobStatus(
  value: string | null | undefined
): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeSourceUrl(sourceUrl: string): string | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed || trimmed.startsWith("manual://")) {
    return null;
  }
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

function ensureRagContent(rawDescription: string) {
  const description = rawDescription.trim();
  if (description.length >= 16) {
    return description;
  }

  const fallback = description.length > 0 ? description : "Job posting details.";
  const pad = " Additional information was not provided in the source listing.";
  const merged = `${fallback}${pad}`.trim();
  return merged.length >= 16 ? merged : `${merged} Please check source URL.`;
}

function computeJobsRagHash(value: {
  title: string;
  content: string;
  sourceUrl: string | null;
  status: "active" | "inactive";
  metadata: Record<string, unknown>;
}) {
  const serialized = JSON.stringify(value);
  return createHash("sha256").update(serialized).digest("hex");
}

function buildIndexedJobDocument(row: SupabaseJobRow) {
  const normalizedJob = normalizeJobPostingRecord(row);
  const knowledge = buildJobKnowledgeUnit(normalizedJob);
  const title = toRagSafeTitle(normalizedJob.title);
  const content = ensureRagContent(knowledge.retrievalText);
  const sourceUrl = normalizeSourceUrl(
    toTrimmedString(row.application_link ?? row.source_url)
  );
  const status = normalizeJobStatus(row.status);
  const extractedData = parseJobsPdfExtractedData(row.pdf_extracted_data);
  const metadata = {
    jobs_kind: "job_posting",
    jobs_source: "supabase_jobs_table",
    jobs_sync_version: JOBS_RAG_SYNC_VERSION,
    jobs_collation_version: JOBS_KNOWLEDGE_COLLATION_VERSION,
    job_id: normalizedJob.id,
    job_title: normalizedJob.title,
    company: normalizedJob.company,
    location: knowledge.location,
    salary: knowledge.salary,
    source: normalizedJob.source ?? UNKNOWN_LABEL,
    sector: normalizedJob.sector,
    employment_type: normalizedJob.employmentType,
    study_exam: normalizedJob.studyExam,
    study_role: normalizedJob.studyRole,
    study_years: normalizedJob.studyYears,
    study_tags: normalizedJob.studyTags,
    tags: normalizedJob.tags,
    parse_error: normalizedJob.parseError ?? null,
    source_url: sourceUrl || null,
    source_page_url: toTrimmedString(row.source_url) || null,
    normalized_source_url: sourceUrl,
    application_link:
      toTrimmedString(row.application_link ?? row.source_url) || null,
    pdf_content_chars: toTrimmedString(row.pdf_content ?? "").length || 0,
    pdf_extracted_roles_count: extractedData?.roles.length ?? 0,
    pdf_extracted_notification_date: extractedData?.notificationDate ?? null,
    pdf_extracted_application_last_date:
      extractedData?.applicationLastDate ?? null,
    content_hash: toTrimmedString(row.content_hash ?? null) || null,
    pdf_source_url: toTrimmedString(row.pdf_source_url ?? null) || null,
    pdf_cached_url: toTrimmedString(row.pdf_cached_url ?? null) || null,
    imported_from_jobs_created_at: toTrimmedString(row.created_at) || null,
    has_pdf: knowledge.hasPdf,
    has_salary: knowledge.hasSalary,
    eligibility: knowledge.facts.eligibility,
    qualification: knowledge.facts.qualification,
    experience: knowledge.facts.experience,
    age_limit: knowledge.facts.ageLimit,
    application_fee: knowledge.facts.applicationFee,
    selection_process: knowledge.facts.selectionProcess,
    instructions: knowledge.facts.instructions,
    requirements: knowledge.facts.requirements,
    application_last_date: knowledge.dates.applicationLastDateLabel,
    application_last_date_iso: knowledge.dates.applicationLastDateIso,
    notification_date: knowledge.dates.notificationDateLabel,
    notification_date_iso: knowledge.dates.notificationDateIso,
    location_entries: knowledge.locationEntries,
    salary_entries: knowledge.salaryEntries,
    pdf_summary_lines: knowledge.pdfSummaryLines,
  } satisfies Record<string, unknown>;
  const jobsRagHash = computeJobsRagHash({
    title,
    content,
    sourceUrl,
    status,
    metadata,
  });

  return {
    title,
    content,
    sourceUrl,
    status,
    metadata: {
      ...metadata,
      jobs_rag_hash: jobsRagHash,
    },
  };
}

async function resolveJobsRagActorId() {
  const explicitActorId = toTrimmedString(process.env.JOBS_RAG_ACTOR_USER_ID);
  if (explicitActorId) {
    const [explicitMatch] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, explicitActorId))
      .limit(1);
    if (explicitMatch?.id) {
      return explicitMatch.id;
    }
    console.warn("[jobs-rag-sync] JOBS_RAG_ACTOR_USER_ID was not found", {
      actorId: explicitActorId,
    });
  }

  const [adminUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, "admin"))
    .orderBy(asc(user.createdAt))
    .limit(1);

  return adminUser?.id ?? null;
}

async function getJobsByIds(jobIds: string[]) {
  if (jobIds.length === 0) {
    return [];
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.from("jobs").select("*").in("id", jobIds);
  if (error) {
    throw new Error(`[jobs-rag-sync] Failed to fetch jobs by id: ${error.message}`);
  }

  return (data ?? []) as SupabaseJobRow[];
}

type ExistingJobsRagEntry = {
  id: string;
  title: string;
  status: "active" | "inactive" | "archived";
  sourceUrl: string | null;
  embeddingStatus: "pending" | "ready" | "failed" | "queued";
  metadata: Record<string, unknown>;
};

async function getExistingJobsRagEntries(jobIds: string[]) {
  if (jobIds.length === 0) {
    return new Map<string, ExistingJobsRagEntry>();
  }

  const rows = await db
    .select({
      id: ragEntry.id,
      title: ragEntry.title,
      status: ragEntry.status,
      sourceUrl: ragEntry.sourceUrl,
      embeddingStatus: ragEntry.embeddingStatus,
      metadata: ragEntry.metadata,
    })
    .from(ragEntry)
    .where(
      and(
        inArray(ragEntry.id, jobIds),
        isNull(ragEntry.deletedAt),
        sql`(${ragEntry.metadata} ->> 'jobs_kind') = 'job_posting'`,
        sql`(${ragEntry.metadata} ->> 'jobs_source') = 'supabase_jobs_table'`
      )
    );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        metadata:
          row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
            ? (row.metadata as Record<string, unknown>)
            : {},
      } satisfies ExistingJobsRagEntry,
    ])
  );
}

async function upsertJobRowToRag({
  actorId,
  row,
  existingEntry,
}: {
  actorId: string;
  row: SupabaseJobRow;
  existingEntry: ExistingJobsRagEntry | null;
}) {
  const indexed = buildIndexedJobDocument(row);
  const existingHash =
    typeof existingEntry?.metadata?.jobs_rag_hash === "string"
      ? existingEntry.metadata.jobs_rag_hash
      : null;
  const nextHash =
    typeof indexed.metadata.jobs_rag_hash === "string"
      ? indexed.metadata.jobs_rag_hash
      : null;

  if (
    existingEntry &&
    existingHash &&
    nextHash &&
    existingHash === nextHash &&
    existingEntry.title === indexed.title &&
    existingEntry.status === indexed.status &&
    (existingEntry.sourceUrl ?? null) === indexed.sourceUrl &&
    existingEntry.embeddingStatus !== "failed"
  ) {
    return "unchanged" as const;
  }

  const input = {
    id: row.id,
    title: indexed.title,
    content: indexed.content,
    type: "document" as const,
    status: indexed.status,
    tags: [] as string[],
    models: [] as string[],
    sourceUrl: indexed.sourceUrl,
    metadata: indexed.metadata,
  };

  if (existingEntry) {
    await updateRagEntry({
      id: row.id,
      actorId,
      input,
    });
    return "updated" as const;
  }

  await createRagEntry({
    actorId,
    input,
  });
  return "created" as const;
}

async function upsertJobRowToRagWithRetry({
  actorId,
  row,
  existingEntry,
}: {
  actorId: string;
  row: SupabaseJobRow;
  existingEntry: ExistingJobsRagEntry | null;
}) {
  const retryAttempts = parsePositiveInt(
    process.env.JOBS_RAG_SYNC_RETRY_ATTEMPTS,
    DEFAULT_JOBS_RAG_SYNC_RETRY_ATTEMPTS
  );
  const retryDelayMs = parsePositiveInt(
    process.env.JOBS_RAG_SYNC_RETRY_DELAY_MS,
    DEFAULT_JOBS_RAG_SYNC_RETRY_DELAY_MS
  );

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= retryAttempts; attempt += 1) {
    try {
      return await upsertJobRowToRag({
        actorId,
        row,
        existingEntry,
      });
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < retryAttempts && isRetryableRagSyncError(error);
      if (!shouldRetry) {
        throw error;
      }
      await sleep(retryDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function syncJobPostingsToRag({
  jobIds,
  concurrency,
  onProgress,
}: {
  jobIds: string[];
  concurrency?: number;
  onProgress?: (event: {
    processed: number;
    total: number;
    created: number;
    updated: number;
    failed: number;
    failureDetails: Array<{
      id: string;
      title: string;
      reason: string;
    }>;
  }) => void | Promise<void>;
}) {
  const uniqueJobIds = Array.from(
    new Set(
      jobIds
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
    )
  );
  if (uniqueJobIds.length === 0) {
    return {
      requested: 0,
      found: 0,
      created: 0,
      updated: 0,
      failed: 0,
      actorId: null as string | null,
    };
  }

  const actorId = await resolveJobsRagActorId();
  if (!actorId) {
    console.warn("[jobs-rag-sync] skipped because no actor user was found");
    return {
      requested: uniqueJobIds.length,
      found: 0,
      created: 0,
      updated: 0,
      failed: uniqueJobIds.length,
      actorId: null as string | null,
    };
  }

  const rows = await getJobsByIds(uniqueJobIds);
  const byId = new Map(rows.map((row) => [row.id, row] as const));
  const existingEntriesById = await getExistingJobsRagEntries(uniqueJobIds);
  const total = uniqueJobIds.length;
  const ragSyncConcurrency = parsePositiveInt(
    concurrency,
    parsePositiveInt(
      process.env.JOBS_RAG_SYNC_CONCURRENCY,
      DEFAULT_JOBS_RAG_SYNC_CONCURRENCY
    )
  );

  let created = 0;
  let updated = 0;
  let failed = 0;
  let processed = 0;
  const failureDetails: Array<{
    id: string;
    title: string;
    reason: string;
  }> = [];
  await runWithConcurrency(uniqueJobIds, ragSyncConcurrency, async (jobId) => {
    const row = byId.get(jobId);
    if (!row) {
      failed += 1;
      processed += 1;
      failureDetails.push({
        id: jobId,
        title: "Unknown job",
        reason: "Job row not found in Supabase during chat indexing.",
      });
      if (failureDetails.length > MAX_RAG_SYNC_FAILURE_DETAILS) {
        failureDetails.shift();
      }
      await onProgress?.({
        processed,
        total,
        created,
        updated,
        failed,
        failureDetails: [...failureDetails],
      });
      return;
    }

    try {
      const outcome = await upsertJobRowToRagWithRetry({
        actorId,
        row,
        existingEntry: existingEntriesById.get(jobId) ?? null,
      });
      if (outcome === "created") {
        created += 1;
      } else if (outcome === "updated") {
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      failureDetails.push({
        id: row.id,
        title: toRagSafeTitle(toTrimmedString(row.title)),
        reason: error instanceof Error ? error.message : String(error),
      });
      if (failureDetails.length > MAX_RAG_SYNC_FAILURE_DETAILS) {
        failureDetails.shift();
      }
      console.warn("[jobs-rag-sync] failed to sync job", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      processed += 1;
      await onProgress?.({
        processed,
        total,
        created,
        updated,
        failed,
        failureDetails: [...failureDetails],
      });
    }
  });

  return {
    requested: total,
    found: rows.length,
    created,
    updated,
    failed,
    failureDetails,
    actorId,
  };
}

export async function archiveJobPostingFromRag({ jobId }: { jobId: string }) {
  const normalizedJobId = jobId.trim();
  if (!normalizedJobId) {
    return {
      archived: false,
      actorId: null as string | null,
    };
  }

  const actorId = await resolveJobsRagActorId();
  if (!actorId) {
    console.warn("[jobs-rag-sync] cannot archive without actor", {
      jobId: normalizedJobId,
    });
    return {
      archived: false,
      actorId: null as string | null,
    };
  }

  const [record] = await db
    .select({ id: ragEntry.id })
    .from(ragEntry)
    .where(
      and(
        eq(ragEntry.id, normalizedJobId),
        isNull(ragEntry.deletedAt),
        sql`(${ragEntry.metadata} ->> 'jobs_kind') = 'job_posting'`,
        sql`(${ragEntry.metadata} ->> 'jobs_source') = 'supabase_jobs_table'`
      )
    )
    .limit(1);

  if (!record) {
    return {
      archived: false,
      actorId,
    };
  }

  await deleteRagEntries({
    ids: [normalizedJobId],
    actorId,
  });

  return {
    archived: true,
    actorId,
  };
}
