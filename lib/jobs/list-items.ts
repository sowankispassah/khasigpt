import { resolveJobNotificationDateLabel } from "@/lib/jobs/dates";
import { resolveJobSalaryInfo } from "@/lib/jobs/salary";
import type { JobListItem, JobPostingRecord } from "@/lib/jobs/types";

export type JobListItemSource = Pick<
  JobPostingRecord,
  | "id"
  | "title"
  | "content"
  | "company"
  | "location"
  | "salary"
  | "source"
  | "pdfContent"
  | "pdfExtractedData"
  | "employmentType"
  | "sourceUrl"
  | "pdfSourceUrl"
  | "pdfCachedUrl"
  | "createdAt"
>;

function compactText(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function parseSortableDateLabel(label: string) {
  const normalized = label.trim();
  if (!normalized || normalized.toLowerCase() === "not specified") {
    return null;
  }

  const dottedMatch = normalized.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (dottedMatch) {
    const day = Number.parseInt(dottedMatch[1] ?? "", 10);
    const month = Number.parseInt(dottedMatch[2] ?? "", 10);
    const yearRaw = Number.parseInt(dottedMatch[3] ?? "", 10);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const ordinalNormalized = normalized.replace(
    /\b(\d{1,2})(st|nd|rd|th)\b/gi,
    "$1"
  );
  const ordinalParsed = new Date(ordinalNormalized);
  return Number.isNaN(ordinalParsed.getTime()) ? null : ordinalParsed;
}

function getSourceHostLabel(sourceUrl: string | null) {
  if (!sourceUrl) {
    return "Source unavailable";
  }

  try {
    return new URL(sourceUrl).hostname.replace(/^www\./i, "");
  } catch {
    return "Source available";
  }
}

function buildDescriptionSnippet(rawDescription: string) {
  const normalized = compactText(rawDescription);
  if (!normalized) {
    return "No description available.";
  }
  return normalized.length > 170 ? `${normalized.slice(0, 170)}...` : normalized;
}

function hasJobPdfFile(job: {
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  content: string;
}) {
  return Boolean(
    job.pdfCachedUrl ||
      job.pdfSourceUrl ||
      job.sourceUrl?.toLowerCase().includes(".pdf") ||
      job.content.match(/PDF Source:\s*(https?:\/\/\S+)/i)
  );
}

export async function toJobListItem(job: JobListItemSource): Promise<JobListItem> {
  // Keep the jobs list route fast by using only already-stored PDF text.
  // The detail page can do slower enrichment when the user opens a specific job.
  const pdfMetaText =
    typeof job.pdfContent === "string" && job.pdfContent.trim().length > 0
      ? job.pdfContent
      : null;

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    employmentType: job.employmentType,
    salaryLabel: resolveJobSalaryInfo({
      salary: job.salary,
      content: job.content,
      pdfContent: pdfMetaText,
      extractedData: job.pdfExtractedData,
    }).summary,
    notificationDateLabel:
      resolveJobNotificationDateLabel({
        content: job.content,
        pdfContent: pdfMetaText,
        referenceDate: job.createdAt,
        extractedData: job.pdfExtractedData,
      }),
    fetchedOnLabel: formatDateLabel(job.createdAt),
    sourceLabel: job.source?.trim() || getSourceHostLabel(job.sourceUrl),
    descriptionSnippet: buildDescriptionSnippet(job.content),
    hasPdfFile: hasJobPdfFile(job),
  };
}

export async function toJobListItems(
  jobs: JobListItemSource[]
): Promise<JobListItem[]> {
  const items = await Promise.all(
    jobs.map(async (job) => {
      const item = await toJobListItem(job);
      const notificationDate =
        parseSortableDateLabel(item.notificationDateLabel) ?? job.createdAt;
      return {
        item,
        sortTime: notificationDate.getTime(),
        fetchedTime: job.createdAt.getTime(),
      };
    })
  );

  return items
    .sort((left, right) => {
      if (right.sortTime !== left.sortTime) {
        return right.sortTime - left.sortTime;
      }
      return right.fetchedTime - left.fetchedTime;
    })
    .map(({ item }) => item);
}
