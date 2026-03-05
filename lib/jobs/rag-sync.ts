import "server-only";

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ragEntry, user } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import {
  createRagEntry,
  deleteRagEntries,
  updateRagEntry,
} from "@/lib/rag/service";
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
  content_hash?: string | null;
  status: string | null;
  source_url: string;
  pdf_source_url?: string | null;
  pdf_cached_url?: string | null;
  created_at: string;
};

const UNKNOWN_LABEL = "Unknown";
const JOBS_RAG_SYNC_VERSION = 1;

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function buildRagContent(row: SupabaseJobRow) {
  const description = toTrimmedString(row.description ?? "");
  const pdfContent = toTrimmedString(row.pdf_content ?? "");
  if (!pdfContent) {
    return description;
  }

  const normalizedDescription = description.toLowerCase();
  const normalizedPdf = pdfContent.toLowerCase();
  if (normalizedDescription && normalizedPdf.includes(normalizedDescription)) {
    return pdfContent;
  }
  if (normalizedDescription.includes(normalizedPdf)) {
    return description;
  }
  return [description, `PDF Content:\n${pdfContent}`].filter(Boolean).join("\n\n");
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

function buildJobMetadata(row: SupabaseJobRow) {
  const title = toTrimmedString(row.title) || "Job opening";
  const company = toTrimmedString(row.company) || UNKNOWN_LABEL;
  const location = toTrimmedString(row.location) || UNKNOWN_LABEL;
  const sourceUrl = toTrimmedString(row.application_link ?? row.source_url);
  const normalizedSourceUrl = normalizeSourceUrl(sourceUrl);
  const sourceLabel = toTrimmedString(row.source ?? "") || UNKNOWN_LABEL;

  return {
    jobs_kind: "job_posting",
    jobs_source: "supabase_jobs_table",
    jobs_sync_version: JOBS_RAG_SYNC_VERSION,
    job_id: row.id,
    job_title: title,
    company,
    location,
    salary: toTrimmedString(row.salary ?? null) || null,
    source: sourceLabel,
    employment_type: UNKNOWN_LABEL,
    study_exam: UNKNOWN_LABEL,
    study_role: UNKNOWN_LABEL,
    study_years: [] as number[],
    study_tags: [] as string[],
    tags: [] as string[],
    parse_error: null,
    source_url: sourceUrl || null,
    source_page_url: toTrimmedString(row.source_url) || null,
    normalized_source_url: normalizedSourceUrl,
    application_link: toTrimmedString(row.application_link ?? row.source_url) || null,
    pdf_content_chars: toTrimmedString(row.pdf_content ?? "").length || 0,
    content_hash: toTrimmedString(row.content_hash ?? null) || null,
    pdf_source_url: toTrimmedString(row.pdf_source_url ?? null) || null,
    pdf_cached_url: toTrimmedString(row.pdf_cached_url ?? null) || null,
    imported_from_jobs_created_at: toTrimmedString(row.created_at) || null,
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

async function upsertJobRowToRag({
  actorId,
  row,
}: {
  actorId: string;
  row: SupabaseJobRow;
}) {
  const title = toTrimmedString(row.title) || "Job opening";
  const content = ensureRagContent(buildRagContent(row));
  const sourceUrl = normalizeSourceUrl(
    toTrimmedString(row.application_link ?? row.source_url)
  );
  const status = normalizeJobStatus(row.status);
  const metadata = buildJobMetadata(row);

  const input = {
    id: row.id,
    title,
    content,
    type: "document" as const,
    status,
    tags: [] as string[],
    models: [] as string[],
    sourceUrl,
    metadata,
  };

  try {
    await updateRagEntry({
      id: row.id,
      actorId,
      input,
    });
    return "updated" as const;
  } catch (error) {
    if (!(error instanceof ChatSDKError) || error.type !== "not_found") {
      throw error;
    }
  }

  await createRagEntry({
    actorId,
    input,
  });
  return "created" as const;
}

export async function syncJobPostingsToRag({
  jobIds,
}: {
  jobIds: string[];
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

  let created = 0;
  let updated = 0;
  let failed = 0;
  for (const jobId of uniqueJobIds) {
    const row = byId.get(jobId);
    if (!row) {
      failed += 1;
      continue;
    }

    try {
      const outcome = await upsertJobRowToRag({
        actorId,
        row,
      });
      if (outcome === "created") {
        created += 1;
      } else {
        updated += 1;
      }
    } catch (error) {
      failed += 1;
      console.warn("[jobs-rag-sync] failed to sync job", {
        jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    requested: uniqueJobIds.length,
    found: rows.length,
    created,
    updated,
    failed,
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
