import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { ragEntry } from "@/lib/db/schema";
import { listActiveRagEntryIdsForModel } from "@/lib/rag/service";
import type {
  QuestionPaperRecord,
  StudyCard,
  StudyFacetOptions,
  StudyFilters,
} from "./types";

export const STUDY_CHAT_MODE = "study" as const;
export const QUESTION_PAPER_MAX_TEXT_CHARS = 120_000;
export const QUESTION_PAPER_RUNTIME_CONTEXT_CHARS = 80_000;

const UNKNOWN_LABEL = "Unknown";

type QuestionPaperMetadataInput = {
  exam: string;
  role: string;
  year: number;
  paperId: string;
  paperTitle: string;
  language: string;
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

function toYear(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? Math.trunc(value) : 0;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }
  return 0;
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

function looksLikeQuestionPaper(metadata: Record<string, unknown>) {
  const studyKind = toTrimmedString(metadata.study_kind).toLowerCase();
  if (studyKind === "question_paper") {
    return true;
  }

  const paperId = toTrimmedString(metadata.paper_id);
  const paperTitle = toTrimmedString(metadata.paper_title);
  const exam = toTrimmedString(metadata.exam);
  const role = toTrimmedString(metadata.role);
  return Boolean(paperId || paperTitle || exam || role);
}

function normalizeQuestionPaperRecord(
  entry: typeof ragEntry.$inferSelect
): QuestionPaperRecord {
  const metadata = toRecord(entry.metadata);
  const metadataTags = toStringList(metadata.tags);

  const titleFromMetadata = toTrimmedString(metadata.paper_title);
  const examFromMetadata = toTrimmedString(metadata.exam);
  const roleFromMetadata = toTrimmedString(metadata.role);
  const languageFromMetadata = toTrimmedString(metadata.language);
  const parseErrorFromMetadata = toTrimmedString(metadata.parse_error);
  const yearFromMetadata = toYear(metadata.year);

  const yearFromTitle = extractStudyYear(entry.title) ?? 0;
  const resolvedYear = yearFromMetadata || yearFromTitle || 0;

  return {
    id: entry.id,
    title: titleFromMetadata || entry.title || "Question paper",
    content: entry.content ?? "",
    exam: examFromMetadata || UNKNOWN_LABEL,
    role: roleFromMetadata || UNKNOWN_LABEL,
    year: resolvedYear,
    language: languageFromMetadata || "English",
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

async function listQuestionPaperRows({
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

export function buildQuestionPaperMetadata(
  input: QuestionPaperMetadataInput
): Record<string, unknown> {
  const exam = input.exam.trim() || UNKNOWN_LABEL;
  const role = input.role.trim() || UNKNOWN_LABEL;
  const year = Number.isFinite(input.year) && input.year > 0 ? input.year : 0;
  const language = input.language.trim() || "English";
  const paperTitle = input.paperTitle.trim() || "Question paper";
  const tags = Array.from(
    new Set(input.tags.map((tag) => tag.trim()).filter(Boolean))
  );

  return {
    study_kind: "question_paper",
    paper_id: input.paperId,
    paper_title: paperTitle,
    exam,
    role,
    year,
    language,
    tags,
    parse_error: input.parseError ?? null,
  };
}

export function extractStudyYear(value: string): number | null {
  const text = value.trim();
  if (!text) {
    return null;
  }

  const upperBound = new Date().getUTCFullYear() + 1;
  const matches = text.match(/\b(19[8-9]\d|20\d{2})\b/g) ?? [];
  for (const token of matches) {
    const year = Number.parseInt(token, 10);
    if (year >= 1980 && year <= upperBound) {
      return year;
    }
  }
  return null;
}

export async function listQuestionPaperEntries({
  includeInactive = false,
}: {
  includeInactive?: boolean;
} = {}): Promise<QuestionPaperRecord[]> {
  const rows = await listQuestionPaperRows({ includeInactive });
  return rows
    .filter((row) => looksLikeQuestionPaper(toRecord(row.metadata)))
    .map(normalizeQuestionPaperRecord);
}

export async function getQuestionPaperById({
  id,
  includeInactive = false,
}: {
  id: string;
  includeInactive?: boolean;
}): Promise<QuestionPaperRecord | null> {
  const papers = await listQuestionPaperEntries({ includeInactive });
  const match = papers.find((paper) => paper.id === id);
  return match ?? null;
}

export async function getQuestionPaperEntryById({
  id,
}: {
  id: string;
}): Promise<QuestionPaperRecord | null> {
  return getQuestionPaperById({ id, includeInactive: true });
}

export async function listQuestionPapers({
  includeInactive = false,
  exam,
  role,
  year,
}: {
  includeInactive?: boolean;
  exam?: string | null;
  role?: string | null;
  year?: number | null;
} = {}): Promise<QuestionPaperRecord[]> {
  const papers = await listQuestionPaperEntries({ includeInactive });
  const normalizedExam = exam?.trim().toLowerCase() ?? null;
  const normalizedRole = role?.trim().toLowerCase() ?? null;
  const normalizedYear =
    typeof year === "number" && Number.isFinite(year) ? Math.trunc(year) : null;

  return papers.filter((paper) => {
    const examMatch =
      !normalizedExam || paper.exam.trim().toLowerCase() === normalizedExam;
    const roleMatch =
      !normalizedRole || paper.role.trim().toLowerCase() === normalizedRole;
    const yearMatch = !normalizedYear || paper.year === normalizedYear;
    return examMatch && roleMatch && yearMatch;
  });
}

export async function listQuestionPaperFacets({
  includeInactive = false,
}: {
  includeInactive?: boolean;
} = {}): Promise<StudyFacetOptions> {
  const papers = await listQuestionPaperEntries({ includeInactive });

  const exams = Array.from(
    new Set(
      papers
        .map((paper) => paper.exam.trim())
        .filter((value) => value && value.toLowerCase() !== "unknown")
    )
  ).sort((a, b) => a.localeCompare(b));

  const roles = Array.from(
    new Set(
      papers
        .map((paper) => paper.role.trim())
        .filter((value) => value && value.toLowerCase() !== "unknown")
    )
  ).sort((a, b) => a.localeCompare(b));

  const years = Array.from(
    new Set(papers.map((paper) => paper.year).filter((value) => value > 0))
  ).sort((a, b) => b - a);

  return { exams, roles, years };
}

function matchKnownValue(input: string, candidates: string[]) {
  const normalizedInput = input.trim().toLowerCase();
  if (!normalizedInput) {
    return null;
  }

  const orderedCandidates = [...candidates].sort((a, b) => b.length - a.length);
  for (const candidate of orderedCandidates) {
    const normalizedCandidate = candidate.trim().toLowerCase();
    if (!normalizedCandidate) {
      continue;
    }
    if (normalizedInput.includes(normalizedCandidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveStudyFilters({
  text,
  exams,
  roles,
}: {
  text: string;
  exams: string[];
  roles: string[];
}): StudyFilters {
  const exam = matchKnownValue(text, exams);
  const role = matchKnownValue(text, roles);
  return { exam, role };
}

export async function listQuestionPaperChips({
  exam,
  role,
}: {
  exam?: string | null;
  role?: string | null;
}): Promise<Array<{ question: string; chips: string[] }>> {
  const papers = await listQuestionPaperEntries({ includeInactive: false });
  const normalizedExam = exam?.trim().toLowerCase() ?? null;
  const normalizedRole = role?.trim().toLowerCase() ?? null;

  if (!normalizedExam) {
    const exams = Array.from(
      new Set(
        papers
          .map((paper) => paper.exam.trim())
          .filter((value) => value && value.toLowerCase() !== "unknown")
      )
    ).sort((a, b) => a.localeCompare(b));
    return exams.length > 0 ? [{ question: "Choose an exam", chips: exams }] : [];
  }

  if (!normalizedRole) {
    const roles = Array.from(
      new Set(
        papers
          .filter(
            (paper) => paper.exam.trim().toLowerCase() === normalizedExam
          )
          .map((paper) => paper.role.trim())
          .filter((value) => value && value.toLowerCase() !== "unknown")
      )
    ).sort((a, b) => a.localeCompare(b));

    return roles.length > 0 ? [{ question: "Choose a role", chips: roles }] : [];
  }

  const years = Array.from(
    new Set(
      papers
        .filter(
          (paper) =>
            paper.exam.trim().toLowerCase() === normalizedExam &&
            paper.role.trim().toLowerCase() === normalizedRole &&
            paper.year > 0
        )
        .map((paper) => paper.year)
    )
  ).sort((a, b) => b - a);

  return years.length > 0
    ? [{ question: "Pick a year", chips: years.map((year) => String(year)) }]
    : [];
}

export async function listActiveQuestionPaperIdsForModel({
  modelConfigId,
  modelKey,
}: {
  modelConfigId: string;
  modelKey?: string | null;
}): Promise<string[]> {
  const [activeRagEntryIds, papers] = await Promise.all([
    listActiveRagEntryIdsForModel({ modelConfigId, modelKey }),
    listQuestionPaperEntries({ includeInactive: false }),
  ]);

  const activeIds = new Set(activeRagEntryIds);
  return papers.filter((paper) => activeIds.has(paper.id)).map((paper) => paper.id);
}

export function toStudyCard(paper: QuestionPaperRecord): StudyCard {
  return {
    id: paper.id,
    title: paper.title,
    exam: paper.exam,
    role: paper.role,
    year: paper.year,
    language: paper.language,
    tags: paper.tags,
    sourceUrl: paper.sourceUrl,
  };
}
