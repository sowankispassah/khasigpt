import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const BATCH_SIZE = 100;
const DB_RETRY_ATTEMPTS = 3;
const DB_RETRY_DELAY_MS = 300;

export type NewJobRow = {
  title: string;
  company: string;
  location: string;
  description: string;
  status?: "active" | "inactive";
  source_url: string;
};

export type SaveJobsResult = {
  attemptedCount: number;
  insertedCount: number;
  updatedCount: number;
  skippedDuplicateCount: number;
};

export type SaveJobsDuplicateMode = "skip" | "update";

export type SaveJobsOptions = {
  onDuplicate?: SaveJobsDuplicateMode;
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

function normalizeJobRows(rows: NewJobRow[]) {
  const dedupedByUrl = new Map<string, NewJobRow>();

  for (const row of rows) {
    const sourceUrl = row.source_url.trim();
    if (!sourceUrl) {
      continue;
    }

    dedupedByUrl.set(sourceUrl, {
      title: row.title.trim() || "Job opening",
      company: normalizeCompany({
        company: row.company,
        sourceUrl,
      }),
      location: row.location.trim() || "Unknown",
      description: row.description.trim(),
      status: row.status === "inactive" ? "inactive" : "active",
      source_url: sourceUrl,
    });
  }

  return Array.from(dedupedByUrl.values());
}

function stripStatusField(rows: NewJobRow[]) {
  return rows.map((row) => ({
    title: row.title,
    company: row.company,
    location: row.location,
    description: row.description,
    source_url: row.source_url,
  }));
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
    };
  }

  const supabase = createSupabaseAdminClient();
  const duplicateMode: SaveJobsDuplicateMode =
    options.onDuplicate === "update" ? "update" : "skip";
  let insertedCount = 0;
  let updatedCount = 0;
  let skippedDuplicateCount = 0;

  for (const batch of chunkArray(normalizedRows, BATCH_SIZE)) {
    const sourceUrls = batch.map((job) => job.source_url);

    const existingRows = await withDbRetry("select-existing-source-urls", async () => {
      const withStatus = await supabase
        .from("jobs")
        .select("source_url,status")
        .in("source_url", sourceUrls);
      if (!withStatus.error) {
        return withStatus.data ?? [];
      }

      // Backward compatibility if the status column is not added yet.
      if (/status/i.test(withStatus.error.message)) {
        const withoutStatus = await supabase
          .from("jobs")
          .select("source_url")
          .in("source_url", sourceUrls);
        if (withoutStatus.error) {
          throw new Error(withoutStatus.error.message);
        }
        return withoutStatus.data ?? [];
      }

      throw new Error(withStatus.error.message);
    });

    const existingUrlSet = new Set(
      existingRows
        .map((row) => (typeof row.source_url === "string" ? row.source_url.trim() : ""))
        .filter(Boolean)
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

    const rowsToWrite =
      duplicateMode === "update"
        ? batch.map((row) => {
            const existingStatus = existingStatusByUrl.get(row.source_url);
            if (existingStatus === "inactive" && row.status !== "inactive") {
              return {
                ...row,
                status: "inactive" as const,
              };
            }
            return row;
          })
        : batch.filter((job) => !existingUrlSet.has(job.source_url));

    skippedDuplicateCount += batch.length - rowsToWrite.length;

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

      // Backward compatibility if the status column is not added yet.
      if (/status/i.test(insertWithStatus.error.message)) {
        const fallbackRows = stripStatusField(rowsToWrite);
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

    for (const row of rowsToWrite) {
      if (!writtenUrlSet.has(row.source_url)) {
        skippedDuplicateCount += 1;
        continue;
      }

      if (existingUrlSet.has(row.source_url)) {
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }
    }
  }

  return {
    attemptedCount: normalizedRows.length,
    insertedCount,
    updatedCount,
    skippedDuplicateCount,
  };
}
