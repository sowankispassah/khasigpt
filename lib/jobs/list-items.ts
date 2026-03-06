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

function isPdfUrl(url: string | null) {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    const pathname = parsed.pathname.toLowerCase();
    return pathname.endsWith(".pdf") || pathname.includes(".pdf");
  } catch {
    return false;
  }
}

function extractPdfUrlFromContent(content: string) {
  const match = content.match(/PDF Source:\s*(https?:\/\/\S+)/i);
  if (!match?.[1]) {
    return null;
  }
  const candidate = match[1].replace(/[),.;]+$/g, "");
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

function hasJobPdfFile(job: {
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  content: string;
}) {
  return Boolean(
    isPdfUrl(job.pdfCachedUrl) ||
      isPdfUrl(job.pdfSourceUrl) ||
      isPdfUrl(job.sourceUrl) ||
      extractPdfUrlFromContent(job.content)
  );
}

export function toJobListItem(job: JobPostingRecord): JobListItem {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    sector: job.sector,
    employmentType: job.employmentType,
    salaryLabel: resolveJobSalaryInfo({
      salary: job.salary,
      content: job.content,
      pdfContent: job.pdfContent,
    }).summary,
    notificationDateLabel:
      resolveJobNotificationDateLabel({
        content: job.content,
        pdfContent: job.pdfContent,
        referenceDate: job.createdAt,
      }),
    fetchedOnLabel: formatDateLabel(job.createdAt),
    sourceLabel: job.source?.trim() || getSourceHostLabel(job.sourceUrl),
    descriptionSnippet: buildDescriptionSnippet(job.content),
    hasPdfFile: hasJobPdfFile(job),
  };
}

export function toJobListItems(jobs: JobPostingRecord[]): JobListItem[] {
  return jobs.map(toJobListItem);
}
