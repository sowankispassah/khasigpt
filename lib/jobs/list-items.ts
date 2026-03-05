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

function extractSalaryLabel(rawDescription: string) {
  const description = compactText(rawDescription);
  if (!description) {
    return "Not disclosed";
  }

  const salaryMatch = description.match(
    /(?:\u20b9|rs\.?|inr)\s?\d[\d,]*(?:\s*(?:-|to)\s*(?:\u20b9|rs\.?|inr)?\s?\d[\d,]*)?(?:\s*(?:per month|\/month|monthly|per annum|\/year|annum|lpa|lakhs? p\.?a\.?))?/i
  );
  if (salaryMatch?.[0]) {
    return salaryMatch[0].trim();
  }

  if (/\bas per norms\b/i.test(description)) {
    return "As per norms";
  }

  if (/\bnegotiable\b/i.test(description)) {
    return "Negotiable";
  }

  return "Not disclosed";
}

function extractDateByKeywordLabel({
  rawDescription,
  keywordPattern,
}: {
  rawDescription: string;
  keywordPattern: RegExp;
}) {
  const description = compactText(rawDescription);
  if (!description) {
    return null;
  }

  const datePattern =
    "(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}|[A-Za-z]{3,9}\\s+\\d{1,2},?\\s+\\d{4})";
  const expression = new RegExp(
    `(?:${keywordPattern.source})\\s*(?:for\\s*application)?\\s*[:\\-]?\\s*(${datePattern})`,
    "i"
  );
  const match = description.match(expression);
  return match?.[1] ? match[1].trim() : null;
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
    employmentType: job.employmentType,
    salaryLabel: job.salary?.trim() || extractSalaryLabel(job.content),
    deadlineLabel:
      extractDateByKeywordLabel({
        rawDescription: job.content,
        keywordPattern:
          /last\s*date|last\s*date\s*of\s*receipt|closing\s*date|apply\s*before|application\s*deadline|submission\s*deadline|deadline/,
      }) ?? "Not specified",
    notificationDateLabel:
      extractDateByKeywordLabel({
        rawDescription: job.content,
        keywordPattern:
          /notification\s*date|date\s*of\s*notification|advertisement\s*date|date\s*of\s*publication|published\s*on|date\s*of\s*issue|issue\s*date/,
      }) ?? formatDateLabel(job.createdAt),
    sourceLabel: job.source?.trim() || getSourceHostLabel(job.sourceUrl),
    descriptionSnippet: buildDescriptionSnippet(job.content),
    hasPdfFile: hasJobPdfFile(job),
  };
}

export function toJobListItems(jobs: JobPostingRecord[]): JobListItem[] {
  return jobs.map(toJobListItem);
}
