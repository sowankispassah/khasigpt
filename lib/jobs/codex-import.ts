import { type JobsPdfExtractedData, jobsPdfExtractedDataSchema } from "@/lib/jobs/pdf-extraction";
import { NO_SALARY_LABEL, resolveJobSalaryInfo } from "@/lib/jobs/salary";
import type { NewJobRow } from "@/lib/jobs/saveJobs";
import { isMeghalayaLocation, isPdfUrl } from "@/lib/scraper/scraper-utils";

const DAY_MS = 24 * 60 * 60 * 1000;
export type CodexJobSource = { name: string; url: string; locationScope?: string };
type Source = CodexJobSource;
type SourceVisit = { url: string; status: "ok" | "failed" };

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function publicUrl(value: unknown, maxLength = 2048) {
  const raw = text(value, maxLength);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /^(localhost|127\.|0\.|\[?::1\]?)/i.test(url.hostname)
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalJobUrl(value: unknown) {
  const normalized = publicUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|refid$|trackingid$|position$|pagenum$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export function lookbackDays(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value, 16), 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.trunc(parsed))) : 10;
}

export function normalizeVisits(value: unknown, sources: Source[]): SourceVisit[] {
  if (!Array.isArray(value)) throw new Error("visitedSources must be an array");
  const allowed = new Set(sources.map((source) => publicUrl(source.url)));
  const visits = new Map<string, SourceVisit>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const url = publicUrl(candidate.url);
    if (!url || !allowed.has(url)) continue;
    if (candidate.status !== "ok" && candidate.status !== "failed") continue;
    visits.set(url, { url, status: candidate.status });
  }
  if (visits.size !== sources.length) {
    throw new Error("Every enabled source must have an ok or failed visit result");
  }
  return [...visits.values()];
}

export function normalizeCodexJob(
  value: unknown,
  sourceByUrl: Map<string, Source>,
  fetchedUrls: Set<string>,
  days: number,
  now: Date
): NewJobRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const sourcePageUrl = publicUrl(candidate.sourcePageUrl);
  const source = sourcePageUrl ? sourceByUrl.get(sourcePageUrl) : null;
  if (!sourcePageUrl || !source || !fetchedUrls.has(sourcePageUrl)) return null;

  const sourceUrl = canonicalJobUrl(candidate.sourceUrl);
  const applicationUrl = canonicalJobUrl(candidate.applicationUrl) ?? sourceUrl;
  const title = text(candidate.title, 220);
  const company = text(candidate.company, 220);
  const location = text(candidate.location, 220);
  const description = text(candidate.description, 20_000);
  if (typeof candidate.description === "string" && candidate.description.trim().length > 20_000) return null;
  if (
    !sourceUrl ||
    sourceUrl === sourcePageUrl ||
    !title ||
    !company ||
    !location ||
    description.length < 20
  ) {
    return null;
  }
  if (
    /(^|\.)linkedin\.com$/i.test(new URL(sourcePageUrl).hostname) &&
    (!/(^|\.)linkedin\.com$/i.test(new URL(sourceUrl).hostname) ||
      !new URL(sourceUrl).pathname.startsWith("/jobs/view/"))
  ) {
    return null;
  }
  if (source.locationScope !== "all_locations" && !isMeghalayaLocation(location)) {
    return null;
  }

  const dateText = text(candidate.publishedAt, 80);
  if (!dateText && /(^|\.)linkedin\.com$/i.test(new URL(sourceUrl).hostname)) {
    return null;
  }
  if (dateText) {
    const published = new Date(dateText);
    if (
      Number.isNaN(published.getTime()) ||
      published.getTime() < now.getTime() - days * DAY_MS ||
      published.getTime() > now.getTime() + DAY_MS
    ) {
      return null;
    }
  }

  const pdfSourceUrl = publicUrl(candidate.pdfSourceUrl) ?? (isPdfUrl(sourceUrl) ? sourceUrl : null);
  const hasPdf = Boolean(pdfSourceUrl || candidate.pdfContent || candidate.pdfExtractedData);
  let pdfContent: string | null = null;
  let pdfExtractedData: JobsPdfExtractedData | null = null;
  if (hasPdf) {
    // Codex reads the PDF. This boundary only validates already gathered data.
    const metadata = jobsPdfExtractedDataSchema.safeParse(candidate.pdfExtractedData);
    pdfContent = text(candidate.pdfContent, 100_000);
    if (
      !pdfSourceUrl ||
      pdfContent.length < 20 ||
      (typeof candidate.pdfContent === "string" && candidate.pdfContent.trim().length > 100_000) ||
      !metadata.success
    ) return null;
    pdfExtractedData = metadata.data;
    if ([pdfExtractedData.extractedAt, pdfExtractedData.notificationDate, pdfExtractedData.applicationLastDate]
      .some((date) => date !== null && Number.isNaN(new Date(date).getTime()))) return null;
  } else if (candidate.pdfSourceUrl) {
    return null;
  }
  const resolvedSalary = resolveJobSalaryInfo({ extractedData: pdfExtractedData });
  const salary = resolvedSalary.summary !== NO_SALARY_LABEL
    ? resolvedSalary.summary
    : text(candidate.salary, 220) || null;
  if (typeof candidate.salary === "string" && candidate.salary.trim().length > 220) return null;

  return {
    title,
    company,
    location,
    description,
    source: source.name,
    source_url: sourceUrl,
    application_link: applicationUrl,
    salary,
    pdf_source_url: pdfSourceUrl,
    pdf_content: pdfContent,
    pdf_extracted_data: pdfExtractedData,
    status: "active",
  };
}

