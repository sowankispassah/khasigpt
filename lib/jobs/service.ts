import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ragEntry } from "@/lib/db/schema";
import { listActiveRagEntryIdsForModel } from "@/lib/rag/service";
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

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function toTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function toNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
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
        .filter((item): item is number => Boolean(item && item > 0))
    )
  );
}

function looksLikeJobPosting(metadata: Record<string, unknown>) {
  const jobsKind = toTrimmedString(metadata.jobs_kind).toLowerCase();
  if (jobsKind === "job_posting") {
    return true;
  }

  const jobId = toTrimmedString(metadata.job_id);
  const jobTitle = toTrimmedString(metadata.job_title);
  const company = toTrimmedString(metadata.company);
  const location = toTrimmedString(metadata.location);
  return Boolean(jobId || jobTitle || company || location);
}

function normalizeJobPostingRecord(
  entry: typeof ragEntry.$inferSelect
): JobPostingRecord {
  const metadata = toRecord(entry.metadata);
  const metadataTags = toStringList(metadata.tags);

  const titleFromMetadata = toTrimmedString(metadata.job_title);
  const companyFromMetadata = toTrimmedString(metadata.company);
  const locationFromMetadata = toTrimmedString(metadata.location);
  const employmentTypeFromMetadata = toTrimmedString(metadata.employment_type);
  const studyExamFromMetadata =
    toTrimmedString(metadata.study_exam) || toTrimmedString(metadata.exam);
  const studyRoleFromMetadata =
    toTrimmedString(metadata.study_role) || toTrimmedString(metadata.role);
  const studyYearsFromStudyMetadata = toNumberList(metadata.study_years);
  const studyYearsFromLegacyMetadata = toNumberList(metadata.years);
  const studyYearsFromMetadata =
    studyYearsFromStudyMetadata.length > 0
      ? studyYearsFromStudyMetadata
      : studyYearsFromLegacyMetadata;
  const studyTagsFromMetadata =
    toStringList(metadata.study_tags).length > 0
      ? toStringList(metadata.study_tags)
      : toStringList(metadata.exam_tags);
  const parseErrorFromMetadata = toTrimmedString(metadata.parse_error);

  return {
    id: entry.id,
    title: titleFromMetadata || entry.title || "Job opening",
    content: entry.content ?? "",
    company: companyFromMetadata || UNKNOWN_LABEL,
    location: locationFromMetadata || UNKNOWN_LABEL,
    employmentType: employmentTypeFromMetadata || UNKNOWN_LABEL,
    studyExam: studyExamFromMetadata || UNKNOWN_LABEL,
    studyRole: studyRoleFromMetadata || UNKNOWN_LABEL,
    studyYears: studyYearsFromMetadata,
    studyTags: studyTagsFromMetadata,
    tags:
      metadataTags.length > 0
        ? metadataTags
        : Array.isArray(entry.tags)
          ? entry.tags
          : [],
    sourceUrl: entry.sourceUrl ?? null,
    status: entry.status,
    approvalStatus: entry.approvalStatus,
    parseError: parseErrorFromMetadata || null,
    metadata,
    models: Array.isArray(entry.models) ? entry.models : [],
    categoryId: entry.categoryId ?? null,
    embeddingStatus: entry.embeddingStatus,
    createdAt:
      entry.createdAt instanceof Date
        ? entry.createdAt
        : new Date(entry.createdAt),
    updatedAt:
      entry.updatedAt instanceof Date
        ? entry.updatedAt
        : new Date(entry.updatedAt),
  };
}

async function listJobPostingRows({
  includeInactive,
}: {
  includeInactive?: boolean;
}) {
  const whereCondition = includeInactive
    ? and(
        eq(ragEntry.type, "document"),
        isNull(ragEntry.personalForUserId),
        isNull(ragEntry.deletedAt)
      )
    : and(
        eq(ragEntry.type, "document"),
        isNull(ragEntry.personalForUserId),
        isNull(ragEntry.deletedAt),
        eq(ragEntry.status, "active"),
        eq(ragEntry.approvalStatus, "approved")
      );

  return db.select().from(ragEntry).where(whereCondition).orderBy(desc(ragEntry.updatedAt));
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
  const rows = await listJobPostingRows({ includeInactive });
  return rows
    .filter((row) => looksLikeJobPosting(toRecord(row.metadata)))
    .map(normalizeJobPostingRecord);
}

export async function getJobPostingById({
  id,
  includeInactive = false,
}: {
  id: string;
  includeInactive?: boolean;
}): Promise<JobPostingRecord | null> {
  const jobs = await listJobPostingEntries({ includeInactive });
  const match = jobs.find((job) => job.id === id);
  return match ?? null;
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
      !normalizedCompany || job.company.trim().toLowerCase() === normalizedCompany;
    const locationMatch =
      !normalizedLocation || job.location.trim().toLowerCase() === normalizedLocation;
    return companyMatch && locationMatch;
  });
}

export async function listActiveJobPostingIdsForModel({
  modelConfigId,
  modelKey,
}: {
  modelConfigId: string;
  modelKey?: string | null;
}): Promise<string[]> {
  const [activeRagEntryIds, jobs] = await Promise.all([
    listActiveRagEntryIdsForModel({ modelConfigId, modelKey }),
    listJobPostingEntries({ includeInactive: false }),
  ]);

  const activeIds = new Set(activeRagEntryIds);
  return jobs.filter((job) => activeIds.has(job.id)).map((job) => job.id);
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
