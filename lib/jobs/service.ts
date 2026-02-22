import "server-only";
import type {
  RagEmbeddingStatus,
  RagEntryApprovalStatus,
  RagEntryStatus,
} from "@/lib/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  listQuestionPaperEntries,
  listQuestionPapers,
} from "@/lib/study/service";
import type { QuestionPaperRecord } from "@/lib/study/types";
import type {
  JobCard,
  JobPostingRecord,
  JobStudyLinkResult,
} from "./types";

export const JOBS_CHAT_MODE = "jobs" as const;
export const JOB_POSTING_MAX_TEXT_CHARS = 120_000;
export const JOB_POSTING_RUNTIME_CONTEXT_CHARS = 80_000;

const UNKNOWN_LABEL = "Unknown";
const DEFAULT_JOB_APPROVAL_STATUS: RagEntryApprovalStatus = "approved";
const DEFAULT_JOB_EMBEDDING_STATUS: RagEmbeddingStatus = "ready";

type JobPostingMetadataInput = {
  jobId: string;
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  studyExam: string;
  studyRole: string;
  studyYears: number[];
  studyTags: string[];
  tags: string[];
  parseError?: string | null;
};

type SupabaseJobRow = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string | null;
  status: string | null;
  source_url: string;
  created_at: string;
};

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

function normalizeJobPostingRecord(row: SupabaseJobRow): JobPostingRecord {
  const createdAt = parseValidDate(row.created_at);
  const rawSourceUrl = toTrimmedString(row.source_url);
  const sourceUrl =
    rawSourceUrl && !rawSourceUrl.startsWith("manual://") ? rawSourceUrl : null;
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
    content: toTrimmedString(row.description),
    company: toTrimmedString(row.company) || UNKNOWN_LABEL,
    location: toTrimmedString(row.location) || UNKNOWN_LABEL,
    employmentType: UNKNOWN_LABEL,
    studyExam: UNKNOWN_LABEL,
    studyRole: UNKNOWN_LABEL,
    studyYears: [],
    studyTags: [],
    tags: [],
    sourceUrl,
    status,
    approvalStatus: DEFAULT_JOB_APPROVAL_STATUS,
    embeddingStatus: DEFAULT_JOB_EMBEDDING_STATUS,
    metadata: {
      jobs_kind: "job_posting",
      source: "supabase_jobs_table",
    },
    models: [],
    categoryId: null,
    parseError: null,
    createdAt,
    updatedAt: createdAt,
  };
}

async function listJobsFromSupabase() {
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

async function getJobFromSupabaseById(id: string) {
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

export function buildJobPostingMetadata(
  input: JobPostingMetadataInput
): Record<string, unknown> {
  const company = input.company.trim() || UNKNOWN_LABEL;
  const location = input.location.trim() || UNKNOWN_LABEL;
  const employmentType = input.employmentType.trim() || UNKNOWN_LABEL;
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
    job_id: input.jobId,
    job_title: jobTitle,
    company,
    location,
    employment_type: employmentType,
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
  const rows = await listJobsFromSupabase();
  const normalized = rows.map(normalizeJobPostingRecord);

  if (includeInactive) {
    return normalized;
  }

  return normalized.filter((job) => job.status === "active");
}

export async function getJobPostingById({
  id,
  includeInactive = false,
}: {
  id: string;
  includeInactive?: boolean;
}): Promise<JobPostingRecord | null> {
  const row = await getJobFromSupabaseById(id);
  if (!row) {
    return null;
  }

  const normalized = normalizeJobPostingRecord(row);
  if (!includeInactive && normalized.status !== "active") {
    return null;
  }

  return normalized;
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

export async function listActiveJobPostingIdsForModel(_input: {
  modelConfigId: string;
  modelKey?: string | null;
}): Promise<string[]> {
  const jobs = await listJobPostingEntries({ includeInactive: false });
  return jobs.map((job) => job.id);
}

export function toJobCard(job: JobPostingRecord): JobCard {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType,
    studyExam: job.studyExam,
    studyRole: job.studyRole,
    studyYears: job.studyYears,
    studyTags: job.studyTags,
    tags: job.tags,
    sourceUrl: job.sourceUrl,
  };
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
