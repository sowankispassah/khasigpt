import "server-only";
import crypto from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { fetchWithTimeout } from "@/lib/utils/async";

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const DEFAULT_BUCKET = "jobs-pdfs";
const DEFAULT_PATH_PREFIX = "jobs";
const DEFAULT_CACHE_CONTROL = "3600";
const DEFAULT_RETRY_ATTEMPTS = 1;
const DEFAULT_RETRY_BASE_DELAY_MS = 350;
const DEFAULT_HOST_FAILURE_THRESHOLD = 2;
const DEFAULT_HOST_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;
const DEFAULT_STORAGE_FAILURE_COOLDOWN_MS = 60 * 1000;
const SCRAPER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
let ensuredBucketName: string | null = null;
let storageFailureCooldownUntilMs = 0;
const hostFailureCounts = new Map<string, number>();
const hostFailureCooldownUntilByHost = new Map<string, number>();

export type CacheJobPdfAssetOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  retryAttempts?: number;
};

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

function parseOptionalPositiveInt(rawValue: number | undefined, fallback: number) {
  if (!(typeof rawValue === "number" && Number.isFinite(rawValue))) {
    return fallback;
  }
  const parsed = Math.trunc(rawValue);
  if (parsed <= 0) {
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

function normalizeErrorMessage(error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  return error instanceof Error ? error.message : String(error);
}

function isRetryableNetworkError(error: unknown) {
  const message = normalizeErrorMessage(error).toLowerCase();
  return (
    message.includes("aborted") ||
    message.includes("timeout") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("econnreset") ||
    message.includes("socket") ||
    message.includes("enotfound") ||
    message.includes("eai_again")
  );
}

function sourceHostFromPdfUrl(pdfUrl: string) {
  try {
    return new URL(pdfUrl).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function isStoragePhaseError(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes("failed to ensure storage bucket") ||
    normalized.includes("failed to upload cached pdf")
  );
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function clearHostFailureState(host: string) {
  if (!host) {
    return;
  }
  hostFailureCounts.delete(host);
  hostFailureCooldownUntilByHost.delete(host);
}

function registerHostFailure(host: string) {
  if (!host) {
    return;
  }

  const threshold = parsePositiveInt(
    process.env.JOBS_PDF_HOST_FAILURE_THRESHOLD,
    DEFAULT_HOST_FAILURE_THRESHOLD
  );
  const cooldownMs = parsePositiveInt(
    process.env.JOBS_PDF_HOST_FAILURE_COOLDOWN_MS,
    DEFAULT_HOST_FAILURE_COOLDOWN_MS
  );
  const nextCount = (hostFailureCounts.get(host) ?? 0) + 1;
  hostFailureCounts.set(host, nextCount);
  if (nextCount < threshold) {
    return;
  }

  hostFailureCounts.delete(host);
  hostFailureCooldownUntilByHost.set(host, Date.now() + cooldownMs);
}

async function downloadPdfBuffer(
  url: string,
  {
    timeoutMs,
    maxBytes,
  }: {
    timeoutMs: number;
    maxBytes: number;
  }
) {
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

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";

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

  const hasPdfContentType =
    contentType.includes("application/pdf") || contentType.includes("application/x-pdf");
  const hasPdfMagicHeader = buffer.subarray(0, 8).toString("latin1").includes("%PDF-");
  if (!hasPdfContentType && !hasPdfMagicHeader) {
    throw new Error("Downloaded file is not a PDF.");
  }

  return buffer;
}

async function downloadPdfBufferWithRetry(
  url: string,
  {
    timeoutMs,
    maxBytes,
    retryAttempts,
  }: {
    timeoutMs: number;
    maxBytes: number;
    retryAttempts: number;
  }
) {
  const attempts = Math.max(1, retryAttempts);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await downloadPdfBuffer(url, { timeoutMs, maxBytes });
    } catch (error) {
      lastError = error;
      const retrying = attempt < attempts && isRetryableNetworkError(error);
      if (!retrying) {
        break;
      }

      const baseDelayMs = parsePositiveInt(
        process.env.JOBS_PDF_DOWNLOAD_RETRY_BASE_DELAY_MS,
        DEFAULT_RETRY_BASE_DELAY_MS
      );
      await wait(baseDelayMs * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function ensurePdfBucket(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
  bucket: string
) {
  if (ensuredBucketName === bucket) {
    return;
  }

  const { data: existingBucket, error: getBucketError } = await supabase.storage.getBucket(bucket);
  if (existingBucket && !getBucketError) {
    if (existingBucket.public !== false) {
      const { error: updateBucketError } = await supabase.storage.updateBucket(bucket, {
        public: false,
        fileSizeLimit: `${DEFAULT_MAX_BYTES}`,
        allowedMimeTypes: ["application/pdf"],
      });

      if (updateBucketError) {
        throw new Error(
          `Failed to update storage bucket "${bucket}": ${updateBucketError.message}`
        );
      }
    }
    ensuredBucketName = bucket;
    return;
  }
  if (getBucketError && isRetryableNetworkError(getBucketError)) {
    throw new Error(
      `Failed to ensure storage bucket "${bucket}": ${getBucketError.message}`
    );
  }

  const createResult = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: `${DEFAULT_MAX_BYTES}`,
    allowedMimeTypes: ["application/pdf"],
  });

  if (createResult.error && !/already exists|duplicate/i.test(createResult.error.message)) {
    throw new Error(
      `Failed to ensure storage bucket "${bucket}": ${createResult.error.message}`
    );
  }

  ensuredBucketName = bucket;
}

export async function cacheJobPdfAsset(
  pdfUrl: string,
  options: CacheJobPdfAssetOptions = {}
): Promise<string | null> {
  const trimmedUrl = pdfUrl.trim();
  if (!trimmedUrl) {
    return null;
  }

  const disabled = (process.env.JOBS_PDF_CACHE_ENABLED ?? "true").trim().toLowerCase();
  if (disabled === "false" || disabled === "0" || disabled === "off" || disabled === "no") {
    return null;
  }

  try {
    new URL(trimmedUrl);
  } catch {
    return null;
  }

  const sourceHost = sourceHostFromPdfUrl(trimmedUrl);
  const nowMs = Date.now();
  if (storageFailureCooldownUntilMs > nowMs) {
    return null;
  }
  if (
    sourceHost &&
    (hostFailureCooldownUntilByHost.get(sourceHost) ?? 0) > nowMs
  ) {
    return null;
  }

  const timeoutMs = parseOptionalPositiveInt(
    options.timeoutMs,
    parsePositiveInt(process.env.JOBS_PDF_DOWNLOAD_TIMEOUT_MS, DEFAULT_TIMEOUT_MS)
  );
  const maxBytes = parseOptionalPositiveInt(
    options.maxBytes,
    parsePositiveInt(process.env.JOBS_PDF_MAX_BYTES, DEFAULT_MAX_BYTES)
  );
  const retryAttempts = parseOptionalPositiveInt(
    options.retryAttempts,
    parsePositiveInt(process.env.JOBS_PDF_DOWNLOAD_RETRY_ATTEMPTS, DEFAULT_RETRY_ATTEMPTS)
  );
  const bucket = process.env.JOBS_PDF_STORAGE_BUCKET?.trim() || DEFAULT_BUCKET;
  const storagePath = buildStoragePath(trimmedUrl);
  const supabase = createSupabaseAdminClient();

  try {
    await ensurePdfBucket(supabase, bucket);
    const buffer = await downloadPdfBufferWithRetry(trimmedUrl, {
      timeoutMs,
      maxBytes,
      retryAttempts,
    });
    const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, buffer, {
      cacheControl: DEFAULT_CACHE_CONTROL,
      contentType: "application/pdf",
      upsert: false,
    });

    if (
      uploadError &&
      !/already exists|duplicate/i.test(uploadError.message)
    ) {
      throw new Error(`Failed to upload cached PDF: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(storagePath);
    const publicUrl = data.publicUrl?.trim() ?? "";
    if (!publicUrl) {
      console.warn("[jobs-scraper] pdf_cache_failed", {
        pdfUrl: trimmedUrl,
        storagePath,
        bucket,
        error: "No public URL returned after upload.",
      });
      return null;
    }
    clearHostFailureState(sourceHost);
    return publicUrl;
  } catch (error) {
    const errorMessage = normalizeErrorMessage(error);
    const retryableNetworkFailure = isRetryableNetworkError(error);
    if (retryableNetworkFailure) {
      if (isStoragePhaseError(errorMessage)) {
        const storageCooldownMs = parsePositiveInt(
          process.env.JOBS_PDF_STORAGE_FAILURE_COOLDOWN_MS,
          DEFAULT_STORAGE_FAILURE_COOLDOWN_MS
        );
        storageFailureCooldownUntilMs = Date.now() + storageCooldownMs;
      } else {
        registerHostFailure(sourceHost);
      }
    }

    console.warn("[jobs-scraper] pdf_cache_failed", {
      pdfUrl: trimmedUrl,
      storagePath,
      bucket,
      error: errorMessage,
    });
    return null;
  }
}
