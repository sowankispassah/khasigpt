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
  if (typeof job.pdfContent === "string" && job.pdfContent.trim().length > 0) {
    return job.pdfContent;
  }

  const pdfUrl = resolveJobPdfUrl(job);
  if (!pdfUrl) {
    return null;
  }

  return getCachedPdfMetaText(pdfUrl).catch(() => null);
}
