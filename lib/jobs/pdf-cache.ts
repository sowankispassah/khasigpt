import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchWithTimeout } from "@/lib/utils/async";

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_BUCKET = "jobs-pdfs";
const DEFAULT_PATH_PREFIX = "jobs";
const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

function parsePositiveInt(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function sanitizePathSegment(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function buildStoragePath(pdfUrl: string) {
  const parsed = new URL(pdfUrl);
  const host = sanitizePathSegment(parsed.hostname.replace(/^www\./i, "")) || "source";
  const basename = parsed.pathname.split("/").filter(Boolean).pop() ?? "document.pdf";
  const rawStem = basename.replace(/\.pdf$/i, "") || "document";
  const stem = sanitizePathSegment(rawStem) || "document";
  const hash = crypto.createHash("sha256").update(pdfUrl).digest("hex").slice(0, 16);
  const prefix = sanitizePathSegment(process.env.JOBS_PDF_STORAGE_PREFIX?.trim() || "") || DEFAULT_PATH_PREFIX;

  return `${prefix}/${host}/${stem}-${hash}.pdf`;
}

async function downloadPdfBuffer(url: string) {
  const timeoutMs = parsePositiveInt(
    process.env.JOBS_PDF_DOWNLOAD_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS
  );
  const maxBytes = parsePositiveInt(process.env.JOBS_PDF_MAX_BYTES, DEFAULT_MAX_BYTES);
  const response = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent": SCRAPER_USER_AGENT,
        accept: "application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
      },
    },
    timeoutMs
  );

  if (!response.ok) {
    throw new Error(`Failed to download PDF (HTTP ${response.status})`);
  }

  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error("PDF is larger than configured max bytes.");
    }
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) {
    throw new Error("Downloaded PDF is empty.");
  }
  if (buffer.byteLength > maxBytes) {
    throw new Error("PDF is larger than configured max bytes.");
  }

  return buffer;
}

export async function cacheJobPdfAsset(pdfUrl: string): Promise<string | null> {
  const trimmedUrl = pdfUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const disabled = (process.env.JOBS_PDF_CACHE_ENABLED ?? "true").trim().toLowerCase();
  if (disabled === "false" || disabled === "0" || disabled === "off" || disabled === "no") {
    return null;
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(trimmedUrl);
  } catch {
    return null;
  }

  if (!parsedUrl.pathname.toLowerCase().includes(".pdf")) {
    return null;
  }

  const bucket = process.env.JOBS_PDF_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
  const storagePath = buildStoragePath(trimmedUrl);
  const supabase = createSupabaseAdminClient();

  try {
    const buffer = await downloadPdfBuffer(trimmedUrl);
    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      cacheControl: "3600",
      contentType: "application/pdf",
      upsert: false,
    });

    if (
      uploadError &&
      !/already exists|duplicate/i.test(uploadError.message)
    ) {
      throw new Error(uploadError.message);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = data.publicUrl?.trim() ?? "";
    if (!publicUrl) {
      return null;
    }
    return publicUrl;
  } catch (error) {
    console.warn("[jobs-scraper] pdf_cache_failed", {
      pdfUrl: trimmedUrl,
      storagePath,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
