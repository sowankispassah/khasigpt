import { extractDocumentText } from "@/lib/uploads/document-parser";

const PDF_META_TEXT_MAX_CHARS = 20_000;
const PDF_META_TEXT_TIMEOUT_MS = 45_000;
const PDF_META_TEXT_CACHE_TTL_MS = 5 * 60 * 1000;

type JobPdfFields = {
  sourceUrl: string | null;
  pdfSourceUrl: string | null;
  pdfCachedUrl: string | null;
  pdfContent?: string | null;
  content: string;
};

type PdfMetaCacheEntry = {
  promise: Promise<string | null>;
  expiresAt: number;
};

const pdfMetaTextCache = new Map<string, PdfMetaCacheEntry>();

function hasUsefulPdfMetaText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!normalized) {
    return false;
  }

  const withoutPageMarkers = normalized
    .replace(/--\s*\d+\s*of\s*\d+\s*--/gi, " ")
    .replace(/\bpage\s+\d+\s+of\s+\d+\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return withoutPageMarkers.length >= 40;
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

export function resolveJobPdfUrl({
  sourceUrl,
  pdfSourceUrl,
  pdfCachedUrl,
  content,
}: JobPdfFields) {
  if (isPdfUrl(pdfCachedUrl)) {
    return pdfCachedUrl;
  }
  if (isPdfUrl(pdfSourceUrl)) {
    return pdfSourceUrl;
  }
  if (isPdfUrl(sourceUrl)) {
    return sourceUrl;
  }
  return extractPdfUrlFromContent(content);
}

function getCachedPdfMetaText(pdfUrl: string) {
  const now = Date.now();
  const cached = pdfMetaTextCache.get(pdfUrl);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const promise = extractDocumentText(
    {
      name: "job-posting.pdf",
      url: pdfUrl,
      mediaType: "application/pdf",
    },
    {
      maxTextChars: PDF_META_TEXT_MAX_CHARS,
      downloadTimeoutMs: PDF_META_TEXT_TIMEOUT_MS,
    }
  )
    .then((parsed) => parsed.text)
    .catch(() => null);

  pdfMetaTextCache.set(pdfUrl, {
    promise,
    expiresAt: now + PDF_META_TEXT_CACHE_TTL_MS,
  });

  return promise;
}

export async function resolveJobPdfMetaText(job: JobPdfFields) {
  if (hasUsefulPdfMetaText(job.pdfContent)) {
    return job.pdfContent;
  }

  const pdfUrl = resolveJobPdfUrl(job);
  if (!pdfUrl) {
    return null;
  }

  return getCachedPdfMetaText(pdfUrl).catch(() => null);
}
