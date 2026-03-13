import "server-only";
import { DEFAULT_JOB_LOCATION } from "@/lib/jobs/location";
import type { JobsPdfExtractedData } from "@/lib/jobs/pdf-extraction";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { syncJobPostingsToRag } from "@/lib/jobs/rag-sync";

const BATCH_SIZE = 100;
const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_DELAY_MS = 300;

export type NewJobRow = {
  title: string;
  company: string;
  location: string;
  salary?: string | null;
  description: string;
  source?: string | null;
  application_link?: string | null;
  status?: "active" | "inactive";
  source_url: string;
  pdf_source_url?: string | null;
  pdf_cached_url?: string | null;
  pdf_content?: string | null;
  pdf_extracted_data?: JobsPdfExtractedData | null;
  content_hash?: string | null;
};

export type SaveJobsResult = {
  attemptedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedDuplicateCount: number;
  writtenJobIds: string[];
  insertedJobIds: string[];
};

export type SaveJobsDuplicateMode = "skip" | "update";

export type SaveJobsOptions = {
  onDuplicate?: SaveJobsDuplicateMode;
  syncRag?: boolean;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withDbRetry<T>(label: string, task: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DB_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const shouldRetry = attempt < DB_RETRY_ATTEMPTS;
      console.warn("[jobs-save] operation_failed", {
        label,
        attempt,
        retrying: shouldRetry,
        error: error instanceof Error ? error.message : String(error),
      });
      if (shouldRetry) {
        await sleep(DB_RETRY_DELAY_MS * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function chunkArray<T>(items: T[], chunkSize: number) {
  if (items.length <= chunkSize) {
    return [items];
  }

  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
}

function resolveCompanyFallbackFromSourceUrl(sourceUrl: string) {
  const normalizedUrl = sourceUrl.trim();
  if (!normalizedUrl) {
    return "Source";
  }

  if (normalizedUrl.startsWith("manual://")) {
    return "Manual source";
  }

  try {
    const hostname = new URL(normalizedUrl).hostname.replace(/^www\./i, "").trim();
    if (!hostname) {
      return "Source";
    }

    if (hostname.toLowerCase().includes("linkedin.")) {
      return "LinkedIn";
    }

    return hostname;
  } catch {
    return "Source";
  }
}

function normalizeCompany({
  company,
  sourceUrl,
}: {
  company: string;
  sourceUrl: string;
}) {
  const normalized = company.trim();
  if (normalized) {
    const lowered = normalized.toLowerCase();
    if (
      lowered !== "unknown" &&
      lowered !== "n/a" &&
      lowered !== "na" &&
      lowered !== "not available"
    ) {
      return normalized;
    }
  }

  return resolveCompanyFallbackFromSourceUrl(sourceUrl);
}

function normalizeOptionalUrl(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeJobRows(rows: NewJobRow[]) {
  const dedupedByUrl = new Map<string, NewJobRow>();
  const seenContentHashes = new Set<string>();

  for (const row of rows) {
    const sourceUrl = (normalizeOptionalUrl(row.source_url) ||
      normalizeOptionalUrl(row.application_link) ||
      "")
      .trim();
    if (!sourceUrl) {
      continue;
    }

    const contentHash = normalizeOptionalText(row.content_hash)?.toLowerCase() ?? null;
    if (contentHash && seenContentHashes.has(contentHash)) {
      continue;
    }
    if (contentHash) {
      seenContentHashes.add(contentHash);
    }

    dedupedByUrl.set(sourceUrl, {
      title: row.title.trim() || "Job opening",
      company: normalizeCompany({
        company: row.company,
        sourceUrl,
      }),
      location: row.location.trim() || DEFAULT_JOB_LOCATION,
      salary: normalizeOptionalText(row.salary),
      description: row.description.trim(),
      source: normalizeOptionalText(row.source),
      application_link: normalizeOptionalUrl(row.application_link) ?? sourceUrl,
      status: row.status === "inactive" ? "inactive" : "active",
      source_url: sourceUrl,
      pdf_source_url: normalizeOptionalUrl(row.pdf_source_url),
      pdf_cached_url: normalizeOptionalUrl(row.pdf_cached_url),
      pdf_content: normalizeOptionalText(row.pdf_content),
      pdf_extracted_data: row.pdf_extracted_data ?? null,
      content_hash: contentHash,
    });
  }

  return Array.from(dedupedByUrl.values());
}

function stripUnsupportedColumns({
  rows,
  stripStatus,
  stripPdfColumns,
  stripSalaryColumn,
  stripSourceColumn,
  stripApplicationLinkColumn,
  stripPdfContentColumn,
  stripPdfExtractedDataColumn,
  stripContentHashColumn,
}: {
  rows: NewJobRow[];
  stripStatus: boolean;
  stripPdfColumns: boolean;
  stripSalaryColumn: boolean;
  stripSourceColumn: boolean;
  stripApplicationLinkColumn: boolean;
  stripPdfContentColumn: boolean;
  stripPdfExtractedDataColumn: boolean;
  stripContentHashColumn: boolean;
}) {
  return rows.map((row) => {
    const payload: Record<string, unknown> = {
      title: row.title,
      company: row.company,
      location: row.location,
      description: row.description,
      source_url: row.source_url,
    };

    if (!stripStatus) {
      payload.status = row.status;
    }

    if (!stripSalaryColumn) {
      payload.salary = row.salary ?? null;
    }

    if (!stripSourceColumn) {
      payload.source = row.source ?? null;
    }

    if (!stripApplicationLinkColumn) {
      payload.application_link = row.application_link ?? null;
    }

    if (!stripPdfColumns) {
      payload.pdf_source_url = row.pdf_source_url ?? null;
      payload.pdf_cached_url = row.pdf_cached_url ?? null;
    }

    if (!stripPdfContentColumn) {
      payload.pdf_content = row.pdf_content ?? null;
    }

    if (!stripPdfExtractedDataColumn) {
      payload.pdf_extracted_data = row.pdf_extracted_data ?? null;
    }

    if (!stripContentHashColumn) {
      payload.content_hash = row.content_hash ?? null;
    }

    return payload;
  });
}

export async function saveJobs(
  rows: NewJobRow[],
  options: SaveJobsOptions = {}
): Promise<SaveJobsResult> {
  const normalizedRows = normalizeJobRows(rows);
  if (normalizedRows.length === 0) {
    return {
      attemptedCount: 0,
      insertedCount: 0,
      updatedCount: 0,
      skippedDuplicateCount: 0,
      writtenJobIds: [],
      insertedJobIds: [],
    };
  }

  const supabase = createSupabaseAdminClient();
  const duplicateMode: SaveJobsDuplicateMode =
    options.onDuplicate === "update" ? "update" : "skip";
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedDuplicateCount = 0;
  const writtenJobIds = new Set<string>();
  const insertedJobIds = new Set<string>();

  for (const batch of chunkArray(normalizedRows, BATCH_SIZE)) {
    const sourceUrls = batch.map((job) => job.source_url);
    const contentHashes = Array.from(
      new Set(
        batch
          .map((job) => normalizeOptionalText(job.content_hash))
          .filter((value): value is string => Boolean(value))
      )
    );

    const existingRows = await withDbRetry("select-existing-source-urls", async () => {
      const withStatusAndHash = await supabase
        .from("jobs")
        .select("source_url,status,content_hash")
        .in("source_url", sourceUrls);
      if (!withStatusAndHash.error) {
        return withStatusAndHash.data ?? [];
      }

      if (/status|content_hash/i.test(withStatusAndHash.error.message)) {
        const withoutOptional = await supabase
          .from("jobs")
          .select("source_url")
          .in("source_url", sourceUrls);
        if (withoutOptional.error) {
          throw new Error(withoutOptional.error.message);
        }
        return withoutOptional.data ?? [];
      }

      throw new Error(withStatusAndHash.error.message);
    });

    const existingHashRows = contentHashes.length
      ? await withDbRetry("select-existing-content-hashes", async () => {
          const withHash = await supabase
            .from("jobs")
            .select("content_hash")
            .in("content_hash", contentHashes);
          if (!withHash.error) {
            return withHash.data ?? [];
          }
          if (/content_hash/i.test(withHash.error.message)) {
            return [] as Array<{ content_hash?: unknown }>;
          }
          throw new Error(withHash.error.message);
        })
      : [];

    const existingUrlSet = new Set(
      existingRows
        .map((row) => (typeof row.source_url === "string" ? row.source_url.trim() : ""))
        .filter(Boolean)
    );

    const existingHashSet = new Set(
      [
        ...existingRows.map((row) =>
          typeof (row as { content_hash?: unknown }).content_hash === "string"
            ? (row as { content_hash?: string }).content_hash?.trim()
            : ""
        ),
        ...existingHashRows.map((row) =>
          typeof (row as { content_hash?: unknown }).content_hash === "string"
            ? (row as { content_hash?: string }).content_hash?.trim()
            : ""
        ),
      ].filter((value): value is string => Boolean(value))
    );

    const existingStatusByUrl = new Map<string, "active" | "inactive">();
    for (const row of existingRows as Array<{ source_url?: unknown; status?: unknown }>) {
      const sourceUrl =
        typeof row.source_url === "string" ? row.source_url.trim() : "";
      if (!sourceUrl) {
        continue;
      }
      const status = typeof row.status === "string" ? row.status.trim().toLowerCase() : "";
      if (status === "inactive") {
        existingStatusByUrl.set(sourceUrl, "inactive");
      } else {
        existingStatusByUrl.set(sourceUrl, "active");
      }
    }

    const rowsToWrite: NewJobRow[] = [];
    for (const row of batch) {
      const normalizedHash = normalizeOptionalText(row.content_hash);
      const duplicateByHash =
        !!normalizedHash &&
        existingHashSet.has(normalizedHash) &&
        !existingUrlSet.has(row.source_url);
      const duplicateBySourceUrl = existingUrlSet.has(row.source_url);

      if (duplicateMode === "skip" && (duplicateBySourceUrl || duplicateByHash)) {
        skippedDuplicateCount += 1;
        continue;
      }

      if (duplicateMode === "update" && duplicateByHash) {
        skippedDuplicateCount += 1;
        continue;
      }

      const existingStatus = existingStatusByUrl.get(row.source_url);
      if (existingStatus === "inactive" && row.status !== "inactive") {
        rowsToWrite.push({
          ...row,
          status: "inactive",
        });
      } else {
        rowsToWrite.push(row);
      }
    }

    if (rowsToWrite.length === 0) {
      continue;
    }

    const writtenRows = await withDbRetry("upsert-jobs", async () => {
      const insertWithStatus = await supabase
        .from("jobs")
        .upsert(rowsToWrite, {
          onConflict: "source_url",
          ignoreDuplicates: duplicateMode === "skip",
        })
        .select("id, source_url");

      if (!insertWithStatus.error) {
        return insertWithStatus.data ?? [];
      }

      const errorMessage = insertWithStatus.error.message.toLowerCase();
      const isMissingColumnError =
        errorMessage.includes("does not exist") || errorMessage.includes("unknown column");
      const shouldStripStatus = isMissingColumnError && /status/.test(errorMessage);
      const shouldStripPdfColumns =
        isMissingColumnError && /pdf_source_url|pdf_cached_url/.test(errorMessage);
      const shouldStripSalaryColumn = isMissingColumnError && /salary/.test(errorMessage);
      const shouldStripSourceColumn =
        isMissingColumnError && /column .*source[^_a-z]|source[^_a-z].*does not exist/.test(errorMessage);
      const shouldStripApplicationLinkColumn =
        isMissingColumnError && /application_link/.test(errorMessage);
      const shouldStripPdfContentColumn =
        isMissingColumnError && /pdf_content/.test(errorMessage);
      const shouldStripPdfExtractedDataColumn =
        isMissingColumnError && /pdf_extracted_data/.test(errorMessage);
      const shouldStripContentHashColumn =
        isMissingColumnError && /content_hash/.test(errorMessage);

      // Backward compatibility when optional columns have not been added yet.
      if (
        shouldStripStatus ||
        shouldStripPdfColumns ||
        shouldStripSalaryColumn ||
        shouldStripSourceColumn ||
        shouldStripApplicationLinkColumn ||
        shouldStripPdfContentColumn ||
        shouldStripPdfExtractedDataColumn ||
        shouldStripContentHashColumn
      ) {
        const fallbackRows = stripUnsupportedColumns({
          rows: rowsToWrite,
          stripStatus: shouldStripStatus,
          stripPdfColumns: shouldStripPdfColumns,
          stripSalaryColumn: shouldStripSalaryColumn,
          stripSourceColumn: shouldStripSourceColumn,
          stripApplicationLinkColumn: shouldStripApplicationLinkColumn,
          stripPdfContentColumn: shouldStripPdfContentColumn,
          stripPdfExtractedDataColumn: shouldStripPdfExtractedDataColumn,
          stripContentHashColumn: shouldStripContentHashColumn,
        });
        const insertWithoutStatus = await supabase
          .from("jobs")
          .upsert(fallbackRows, {
            onConflict: "source_url",
            ignoreDuplicates: duplicateMode === "skip",
          })
          .select("id, source_url");
        if (insertWithoutStatus.error) {
          throw new Error(insertWithoutStatus.error.message);
        }
        return insertWithoutStatus.data ?? [];
      }

      throw new Error(insertWithStatus.error.message);
    });

    const writtenUrlSet = new Set(
      writtenRows
        .map((row) => (typeof row.source_url === "string" ? row.source_url.trim() : ""))
        .filter(Boolean)
    );
    const writtenIdByUrl = new Map(
      writtenRows
        .map((row) => {
          const sourceUrl =
            typeof row.source_url === "string" ? row.source_url.trim() : "";
          const id = typeof row.id === "string" ? row.id.trim() : "";
          return sourceUrl && id ? ([sourceUrl, id] as const) : null;
        })
        .filter(
          (entry): entry is readonly [string, string] => Array.isArray(entry)
        )
    );
    for (const row of writtenRows) {
      if (typeof row.id === "string" && row.id.trim().length > 0) {
        writtenJobIds.add(row.id.trim());
      }
    }

    for (const row of rowsToWrite) {
      if (!writtenUrlSet.has(row.source_url)) {
        skippedDuplicateCount += 1;
        continue;
      }

      if (existingUrlSet.has(row.source_url)) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
        const insertedId = writtenIdByUrl.get(row.source_url);
        if (insertedId) {
          insertedJobIds.add(insertedId);
        }
      }
    }
  }

  const syncedJobIds = Array.from(writtenJobIds);
  const syncedInsertedJobIds = Array.from(insertedJobIds);
  const shouldSyncRag = options.syncRag !== false;
  if (shouldSyncRag && syncedInsertedJobIds.length > 0) {
    try {
      await syncJobPostingsToRag({
        jobIds: syncedInsertedJobIds,
        createMissing: true,
      });
    } catch (error) {
      console.warn("[jobs-save] rag_sync_failed", {
        count: syncedInsertedJobIds.length,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    attemptedCount: normalizedRows.length,
    insertedCount,
    updatedCount,
    skippedDuplicateCount,
    writtenJobIds: syncedJobIds,
    insertedJobIds: syncedInsertedJobIds,
  };
}
