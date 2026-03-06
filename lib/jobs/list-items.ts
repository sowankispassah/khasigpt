import { resolveJobPdfMetaText } from "@/lib/jobs/pdf-meta";
import { resolveJobNotificationDateLabel } from "@/lib/jobs/dates";
import { resolveJobSalaryInfo } from "@/lib/jobs/salary";
import type { JobListItem, JobPostingRecord } from "@/lib/jobs/types";

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

export async function toJobListItem(job: JobPostingRecord): Promise<JobListItem> {
  const pdfMetaText = await resolveJobPdfMetaText(job);

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
    }).summary,
    notificationDateLabel:
      resolveJobNotificationDateLabel({
        content: job.content,
        pdfContent: pdfMetaText,
        referenceDate: job.createdAt,
      }),
    fetchedOnLabel: formatDateLabel(job.createdAt),
    sourceLabel: job.source?.trim() || getSourceHostLabel(job.sourceUrl),
    descriptionSnippet: buildDescriptionSnippet(job.content),
    hasPdfFile: hasJobPdfFile(job),
  };
}

export async function toJobListItems(jobs: JobPostingRecord[]): Promise<JobListItem[]> {
  return Promise.all(jobs.map((job) => toJobListItem(job)));
}
