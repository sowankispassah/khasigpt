import type { JobsPdfExtractedData } from "@/lib/jobs/pdf-extraction";

type JobIdentity = {
  title?: string | null;
  company?: string | null;
  location?: string | null;
  description?: string | null;
  pdf_source_url?: string | null;
};

function words(value: string | null | undefined) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ")
    : "";
}

export function normalizeJobPdfUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    for (const key of Array.from(url.searchParams.keys())) {
      const value = url.searchParams.get(key) ?? "";
      if (/^utm_/i.test(key) || (/^(?:download|dl|attachment)$/i.test(key) && /^(?:1|true|yes)?$/i.test(value))) {
        url.searchParams.delete(key);
      }
    }
    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function reference(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const match = value.match(/\b(?:advertisement|advert|advt|notification|notice)\s*(?:no\.?|number|#)?\s*[:.-]?\s*([a-z0-9][a-z0-9/.-]{4,})/i);
  return match && /\d/.test(match[1]) ? words(match[1]) : null;
}

function roleTitle(value: string | null | undefined) {
  return words(value).replace(/\b(?:recruitment|vacancy|vacancies|notification|advertisement)\b/g, " ")
    .replace(/\s+/g, " ").trim();
}

export function isSameJob(left: JobIdentity, right: JobIdentity) {
  const title = roleTitle(left.title);
  if (!title || title !== roleTitle(right.title)) return false;
  const leftCompany = words(left.company);
  const rightCompany = words(right.company);
  const leftLocation = words(left.location);
  const rightLocation = words(right.location);
  const leftRef = reference(left.description);
  const rightRef = reference(right.description);
  if (leftRef && rightRef && leftRef !== rightRef) return false;
  if (leftCompany && rightCompany && leftCompany !== rightCompany) return false;
  if (leftLocation && rightLocation && leftLocation !== rightLocation) return false;

  const leftPdf = normalizeJobPdfUrl(left.pdf_source_url);
  const rightPdf = normalizeJobPdfUrl(right.pdf_source_url);
  if (leftPdf && rightPdf) return leftPdf === rightPdf;

  if (!leftCompany || !rightCompany || leftCompany === "unknown" ||
      rightCompany === "unknown" || leftCompany !== rightCompany) return false;
  if (leftLocation !== rightLocation) return false;

  if (leftRef && rightRef) return leftRef === rightRef;
  if (leftRef || rightRef) return false;
  const description = words(left.description);
  return description.length >= 120 && description === words(right.description);
}

type JobPdfFields = {
  pdf_source_url?: string | null;
  pdf_cached_url?: string | null;
  pdf_content?: string | null;
  pdf_extracted_data?: JobsPdfExtractedData | null;
};

export function duplicateJobPdfBackfill(current: JobPdfFields, incoming: JobPdfFields) {
  const incomingPdf = normalizeJobPdfUrl(incoming.pdf_source_url);
  if (!incomingPdf) return null;
  const currentPdf = normalizeJobPdfUrl(current.pdf_source_url);
  if (current.pdf_source_url && currentPdf !== incomingPdf) return null;

  // Never combine a cached file or extracted text from a different document.
  if (!current.pdf_source_url) {
    return {
      pdf_source_url: incoming.pdf_source_url,
      pdf_cached_url: incoming.pdf_cached_url ?? null,
      pdf_content: incoming.pdf_content ?? null,
      pdf_extracted_data: incoming.pdf_extracted_data ?? null,
    };
  }

  const patch: JobPdfFields = {};
  if (!current.pdf_cached_url && incoming.pdf_cached_url) patch.pdf_cached_url = incoming.pdf_cached_url;
  if (!current.pdf_content && incoming.pdf_content) patch.pdf_content = incoming.pdf_content;
  if (!current.pdf_extracted_data && incoming.pdf_extracted_data) patch.pdf_extracted_data = incoming.pdf_extracted_data;
  return Object.keys(patch).length ? patch : null;
}
