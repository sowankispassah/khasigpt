import "server-only";

import {
  resolveJobApplicationLastDateLabel,
  resolveJobNotificationDateLabel,
} from "@/lib/jobs/dates";
import {
  buildJobsPdfExtractedSummaryLines,
  type JobsPdfExtractedData,
} from "@/lib/jobs/pdf-extraction";
import {
  resolveJobLocationInfo,
  type LocationEntry,
} from "@/lib/jobs/location";
import {
  NO_SALARY_LABEL,
  resolveJobSalaryInfo,
  type CompensationEntry,
} from "@/lib/jobs/salary";
import { getJobSectorLabel, getJobTypeLabel } from "@/lib/jobs/sector";
import { extractPdfStructuredFields } from "@/lib/scraper/scraper-utils";
import type { JobPostingRecord } from "./types";

const UNKNOWN_LABEL = "Unknown";
const NOT_SPECIFIED_LABEL = "Not specified";
const MAX_SECTION_VALUE_CHARS = 600;
const MAX_KNOWLEDGE_TEXT_CHARS = 120_000;

export type JobKnowledgeFacts = {
  eligibility: string | null;
  experience: string | null;
  ageLimit: string | null;
  applicationFee: string | null;
  selectionProcess: string | null;
  instructions: string | null;
  requirements: string | null;
  qualification: string | null;
};

export type JobKnowledgeDates = {
  applicationLastDateLabel: string | null;
  applicationLastDateIso: string | null;
  applicationLastDateTimestamp: number | null;
  notificationDateLabel: string | null;
  notificationDateIso: string | null;
  notificationDateTimestamp: number | null;
};

export type JobKnowledgeUnit = {
  jobId: string;
  title: string;
  company: string;
  source: string | null;
  location: string;
  locationEntries: LocationEntry[];
  salary: string | null;
  salaryEntries: CompensationEntry[];
  sector: string;
  employmentType: string;
  sourceUrl: string | null;
  applicationLink: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  tags: string[];
  studyTags: string[];
  studyExam: string;
  studyRole: string;
  studyYears: number[];
  facts: JobKnowledgeFacts;
  dates: JobKnowledgeDates;
  pdfExtractedData: JobsPdfExtractedData | null;
  pdfSummaryLines: string[];
  description: string;
  pdfContent: string | null;
  fullText: string;
  searchText: string;
  retrievalText: string;
  hasPdf: boolean;
  hasSalary: boolean;
  status: JobPostingRecord["status"];
  approvalStatus: JobPostingRecord["approvalStatus"];
  embeddingStatus: JobPostingRecord["embeddingStatus"];
  contentHash: string | null;
  createdAt: Date;
  updatedAt: Date;
};

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function trimOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function sanitizeSectionValue(value: string | null | undefined) {
  const normalized = trimOptionalText(value);
  if (!normalized) {
    return null;
  }

  return normalizeWhitespace(normalized).slice(0, MAX_SECTION_VALUE_CHARS);
}

function extractLabelledValueFromText({
  text,
  labels,
}: {
  text: string;
  labels: readonly string[];
}) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(
      `(?:${escaped})\\s*[:\\-]?\\s*([\\s\\S]{3,800}?)` +
        `(?=(?:\\n[A-Z][A-Za-z /()&-]{2,40}\\s*:)|\\n\\n|$)`,
      "i"
    );
    const match = text.match(expression);
    if (!match?.[1]) {
      continue;
    }

    const normalized = normalizeWhitespace(match[1]);
    if (normalized.length > 0) {
      return normalized.slice(0, MAX_SECTION_VALUE_CHARS);
    }
  }

  return null;
}

function extractRequirementSummary(text: string) {
  const value = extractLabelledValueFromText({
    text,
    labels: [
      "requirements",
      "requirement",
      "responsibilities",
      "job requirements",
      "minimum requirements",
    ],
  });
  if (value) {
    return value;
  }

  const directRequirementMatch = text.match(
    /\b(?:requirement|requirements|responsibilities)\b[^.\n\r]{0,420}/i
  );
  if (!directRequirementMatch?.[0]) {
    return null;
  }

  return normalizeWhitespace(directRequirementMatch[0]).slice(
    0,
    MAX_SECTION_VALUE_CHARS
  );
}

function buildTextCandidates(job: JobPostingRecord) {
  const content = trimOptionalText(job.content) ?? "";
  const pdfContent = trimOptionalText(job.pdfContent);
  const combined = [content, pdfContent].filter(Boolean).join("\n\n");

  return {
    content,
    pdfContent,
    combined,
  };
}

function buildKnowledgeFacts(job: JobPostingRecord): JobKnowledgeFacts {
  const { combined } = buildTextCandidates(job);
  const structuredFields = extractPdfStructuredFields(combined);

  return {
    eligibility:
      sanitizeSectionValue(structuredFields.eligibility) ??
      extractLabelledValueFromText({
        text: combined,
        labels: [
          "eligibility",
          "essential qualification",
          "educational qualification",
          "qualification",
          "education",
        ],
      }),
    experience: extractLabelledValueFromText({
      text: combined,
      labels: ["experience", "work experience", "minimum experience"],
    }),
    ageLimit: extractLabelledValueFromText({
      text: combined,
      labels: ["age limit", "maximum age", "minimum age"],
    }),
    applicationFee: extractLabelledValueFromText({
      text: combined,
      labels: ["application fee", "exam fee", "registration fee", "fee"],
    }),
    selectionProcess: extractLabelledValueFromText({
      text: combined,
      labels: ["selection process", "mode of selection", "selection procedure"],
    }),
    instructions:
      sanitizeSectionValue(structuredFields.instructions) ??
      extractLabelledValueFromText({
        text: combined,
        labels: [
          "instructions",
          "important instructions",
          "how to apply",
          "application procedure",
          "procedure to apply",
        ],
      }),
    requirements: extractRequirementSummary(combined),
    qualification:
      extractLabelledValueFromText({
        text: combined,
        labels: [
          "qualification",
          "essential qualification",
          "educational qualification",
          "education",
        ],
      }) ?? sanitizeSectionValue(structuredFields.eligibility),
  };
}

const MONTH_NAME_TO_INDEX: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sep: 8,
  sept: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

function normalizeDateInput(value: string) {
  return value
    .replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toDateOrNull(year: number, monthIndex: number, day: number) {
  const candidate = new Date(Date.UTC(year, monthIndex, day));
  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== monthIndex ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return candidate;
}

export function parseJobDateLabel(
  value: string | null | undefined
): { isoDate: string; timestamp: number } | null {
  const normalized = normalizeDateInput(value ?? "");
  if (!normalized) {
    return null;
  }

  const numericMatch = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (numericMatch) {
    const day = Number.parseInt(numericMatch[1], 10);
    const month = Number.parseInt(numericMatch[2], 10);
    const yearRaw = Number.parseInt(numericMatch[3], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const parsed = toDateOrNull(year, month - 1, day);
    if (parsed) {
      return {
        isoDate: parsed.toISOString().slice(0, 10),
        timestamp: parsed.getTime(),
      };
    }
  }

  const dayMonthYearMatch = normalized.match(
    /^(\d{1,2}) (?:of )?([A-Za-z]{3,9}) (\d{2,4})$/i
  );
  if (dayMonthYearMatch) {
    const day = Number.parseInt(dayMonthYearMatch[1], 10);
    const monthIndex =
      MONTH_NAME_TO_INDEX[dayMonthYearMatch[2].toLowerCase()] ?? null;
    const yearRaw = Number.parseInt(dayMonthYearMatch[3], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (monthIndex !== null) {
      const parsed = toDateOrNull(year, monthIndex, day);
      if (parsed) {
        return {
          isoDate: parsed.toISOString().slice(0, 10),
          timestamp: parsed.getTime(),
        };
      }
    }
  }

  const monthDayYearMatch = normalized.match(
    /^([A-Za-z]{3,9}) (\d{1,2}) (\d{2,4})$/i
  );
  if (monthDayYearMatch) {
    const monthIndex =
      MONTH_NAME_TO_INDEX[monthDayYearMatch[1].toLowerCase()] ?? null;
    const day = Number.parseInt(monthDayYearMatch[2], 10);
    const yearRaw = Number.parseInt(monthDayYearMatch[3], 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    if (monthIndex !== null) {
      const parsed = toDateOrNull(year, monthIndex, day);
      if (parsed) {
        return {
          isoDate: parsed.toISOString().slice(0, 10),
          timestamp: parsed.getTime(),
        };
      }
    }
  }

  const fallback = new Date(normalized);
  if (Number.isNaN(fallback.getTime())) {
    return null;
  }

  return {
    isoDate: fallback.toISOString().slice(0, 10),
    timestamp: fallback.getTime(),
  };
}

function buildKnowledgeDates(job: JobPostingRecord): JobKnowledgeDates {
  const applicationLastDateLabelRaw = resolveJobApplicationLastDateLabel({
    content: job.content,
    pdfContent: job.pdfContent,
    extractedData: job.pdfExtractedData,
  });
  const notificationDateLabelRaw = resolveJobNotificationDateLabel({
    content: job.content,
    pdfContent: job.pdfContent,
    referenceDate: job.createdAt,
    extractedData: job.pdfExtractedData,
  });

  const applicationLastDateLabel =
    applicationLastDateLabelRaw === NOT_SPECIFIED_LABEL
      ? null
      : applicationLastDateLabelRaw;
  const notificationDateLabel =
    notificationDateLabelRaw === NOT_SPECIFIED_LABEL ? null : notificationDateLabelRaw;

  const applicationDateParsed = parseJobDateLabel(applicationLastDateLabel);
  const notificationDateParsed = parseJobDateLabel(notificationDateLabel);

  return {
    applicationLastDateLabel,
    applicationLastDateIso: applicationDateParsed?.isoDate ?? null,
    applicationLastDateTimestamp: applicationDateParsed?.timestamp ?? null,
    notificationDateLabel,
    notificationDateIso: notificationDateParsed?.isoDate ?? null,
    notificationDateTimestamp: notificationDateParsed?.timestamp ?? null,
  };
}

function dedupeStringList(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)
    )
  );
}

function buildSearchText(sections: Array<string | null | undefined>) {
  return normalizeWhitespace(
    sections.filter((section): section is string => Boolean(section)).join(" ")
  );
}

function buildRetrievalText(sections: Array<string | null | undefined>) {
  const text = sections
    .filter((section): section is string => Boolean(section))
    .join("\n\n")
    .trim();
  if (text.length <= MAX_KNOWLEDGE_TEXT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_KNOWLEDGE_TEXT_CHARS)}\n\n[Content truncated]`;
}

export function buildJobKnowledgeUnit(job: JobPostingRecord): JobKnowledgeUnit {
  const locationInfo = resolveJobLocationInfo({
    location: job.location,
    content: job.content,
    pdfContent: job.pdfContent,
  });
  const salaryInfo = resolveJobSalaryInfo({
    salary: job.salary,
    content: job.content,
    pdfContent: job.pdfContent,
    extractedData: job.pdfExtractedData,
  });
  const facts = buildKnowledgeFacts(job);
  const dates = buildKnowledgeDates(job);
  const pdfSummaryLines = buildJobsPdfExtractedSummaryLines(job.pdfExtractedData);
  const description = trimOptionalText(job.content) ?? "";
  const pdfContent = trimOptionalText(job.pdfContent);
  const tags = dedupeStringList(job.tags);
  const studyTags = dedupeStringList(job.studyTags);
  const salarySummary =
    salaryInfo.summary !== NO_SALARY_LABEL ? salaryInfo.summary : null;

  const overviewLines = [
    `Job Title: ${job.title}`,
    `Company / Organization: ${job.company || UNKNOWN_LABEL}`,
    `Category: ${job.sector === "unknown" ? UNKNOWN_LABEL : getJobSectorLabel(job.sector)}`,
    `Employment Type: ${getJobTypeLabel(job.employmentType)}`,
    `Location: ${locationInfo.summary || UNKNOWN_LABEL}`,
    `Salary: ${salarySummary ?? "Not mentioned"}`,
    `Eligibility: ${facts.eligibility ?? "Not mentioned"}`,
    `Qualification: ${facts.qualification ?? "Not mentioned"}`,
    `Experience: ${facts.experience ?? "Not mentioned"}`,
    `Age Limit: ${facts.ageLimit ?? "Not mentioned"}`,
    `Last Date to Apply: ${dates.applicationLastDateLabel ?? "Not mentioned"}`,
    `Notification Date: ${dates.notificationDateLabel ?? "Not mentioned"}`,
    `Selection Process: ${facts.selectionProcess ?? "Not mentioned"}`,
    `Application Fee: ${facts.applicationFee ?? "Not mentioned"}`,
    `Source: ${job.source ?? "Not mentioned"}`,
    `Source URL: ${job.sourceUrl ?? "Not available"}`,
    `Application URL: ${job.applicationLink ?? job.sourceUrl ?? "Not available"}`,
    `PDF URL: ${job.pdfCachedUrl ?? job.pdfSourceUrl ?? "Not available"}`,
    tags.length > 0 ? `Tags: ${tags.join(", ")}` : "",
    studyTags.length > 0 ? `Study Tags: ${studyTags.join(", ")}` : "",
    job.studyExam && job.studyExam !== UNKNOWN_LABEL
      ? `Study Exam: ${job.studyExam}`
      : "",
    job.studyRole && job.studyRole !== UNKNOWN_LABEL
      ? `Study Role: ${job.studyRole}`
      : "",
    job.studyYears.length > 0 ? `Study Years: ${job.studyYears.join(", ")}` : "",
  ].filter(Boolean);

  const locationDetailLines = locationInfo.entries.map(
    (entry) => `${entry.role}: ${entry.location}`
  );
  const salaryDetailLines = salaryInfo.entries.map(
    (entry) => `${entry.role}: ${entry.salary}`
  );

  const fullTextSections = [
    "Overview:\n" + overviewLines.join("\n"),
    facts.instructions
      ? `Instructions / How to Apply:\n${facts.instructions}`
      : "",
    facts.requirements ? `Requirements:\n${facts.requirements}` : "",
    facts.eligibility ? `Eligibility:\n${facts.eligibility}` : "",
    facts.qualification ? `Qualification:\n${facts.qualification}` : "",
    facts.experience ? `Experience:\n${facts.experience}` : "",
    locationDetailLines.length > 0
      ? `Role Locations:\n${locationDetailLines.join("\n")}`
      : "",
    salaryDetailLines.length > 0
      ? `Role Salaries:\n${salaryDetailLines.join("\n")}`
      : "",
    pdfSummaryLines.length > 0
      ? `PDF Extracted Details:\n${pdfSummaryLines.join("\n")}`
      : "",
    description ? `Job Description:\n${description}` : "",
    pdfContent ? `PDF Content:\n${pdfContent}` : "",
  ];

  const searchText = buildSearchText([
    job.title,
    job.company,
    locationInfo.summary,
    salarySummary,
    facts.eligibility,
    facts.qualification,
    facts.instructions,
    facts.requirements,
    dates.applicationLastDateLabel,
    dates.notificationDateLabel,
    job.source,
    tags.join(" "),
    studyTags.join(" "),
    description,
    pdfContent ?? "",
    pdfSummaryLines.join(" "),
    locationDetailLines.join(" "),
    salaryDetailLines.join(" "),
  ]);

  return {
    jobId: job.id,
    title: job.title,
    company: job.company,
    source: job.source ?? null,
    location: locationInfo.summary,
    locationEntries: locationInfo.entries,
    salary: salarySummary,
    salaryEntries: salaryInfo.entries,
    sector: job.sector,
    employmentType: job.employmentType,
    sourceUrl: job.sourceUrl,
    applicationLink: job.applicationLink ?? null,
    pdfSourceUrl: job.pdfSourceUrl,
    pdfCachedUrl: job.pdfCachedUrl,
    tags,
    studyTags,
    studyExam: job.studyExam,
    studyRole: job.studyRole,
    studyYears: job.studyYears,
    facts,
    dates,
    pdfExtractedData: job.pdfExtractedData ?? null,
    pdfSummaryLines,
    description,
    pdfContent,
    fullText: buildRetrievalText(fullTextSections),
    searchText,
    retrievalText: buildRetrievalText(fullTextSections),
    hasPdf: Boolean(pdfContent || job.pdfSourceUrl || job.pdfCachedUrl),
    hasSalary: Boolean(salarySummary),
    status: job.status,
    approvalStatus: job.approvalStatus,
    embeddingStatus: job.embeddingStatus,
    contentHash: job.contentHash ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
