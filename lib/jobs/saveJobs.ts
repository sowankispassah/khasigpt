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
  skippedDuplicateCount: number;
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

function normalizeJobRows(rows: NewJobRow[]) {
  const dedupedByUrl = new Map<string, NewJobRow>();

  for (const row of rows) {
    const sourceUrl = row.source_url.trim();
    if (!sourceUrl) {
      continue;
    }

    dedupedByUrl.set(sourceUrl, {
      title: row.title.trim() || "Job opening",
      company: row.company.trim() || "Unknown",
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

export async function saveJobs(rows: NewJobRow[]): Promise<SaveJobsResult> {
  const normalizedRows = normalizeJobRows(rows);
  if (normalizedRows.length === 0) {
    return { attemptedCount: 0, insertedCount: 0, skippedDuplicateCount: 0 };
  }

  const supabase = createSupabaseAdminClient();
  let insertedCount = 0;
  let skippedDuplicateCount = 0;

  for (const batch of chunkArray(normalizedRows, BATCH_SIZE)) {
    const sourceUrls = batch.map((job) => job.source_url);

    const existingRows = await withDbRetry("select-existing-source-urls", async () => {
      const { data, error } = await supabase
        .from("jobs")
        .select("source_url")
        .in("source_url", sourceUrls);
      if (error) {
        throw new Error(error.message);
      }
      return data ?? [];
    });

    const existingUrlSet = new Set(
      existingRows
        .map((row) => (typeof row.source_url === "string" ? row.source_url.trim() : ""))
        .filter(Boolean)
    );

    const newRows = batch.filter((job) => !existingUrlSet.has(job.source_url));
    skippedDuplicateCount += batch.length - newRows.length;

    if (newRows.length === 0) {
      continue;
    }

    const insertedRows = await withDbRetry("insert-new-jobs", async () => {
      const insertWithStatus = await supabase
        .from("jobs")
        .upsert(newRows, { onConflict: "source_url", ignoreDuplicates: true })
        .select("id");

      if (!insertWithStatus.error) {
        return insertWithStatus.data ?? [];
      }

      // Backward compatibility if the status column is not added yet.
      if (/status/i.test(insertWithStatus.error.message)) {
        const fallbackRows = stripStatusField(newRows);
        const insertWithoutStatus = await supabase
          .from("jobs")
          .upsert(fallbackRows, { onConflict: "source_url", ignoreDuplicates: true })
          .select("id");
        if (insertWithoutStatus.error) {
          throw new Error(insertWithoutStatus.error.message);
        }
        return insertWithoutStatus.data ?? [];
      }

      throw new Error(insertWithStatus.error.message);
    });

    insertedCount += insertedRows.length;
    skippedDuplicateCount += newRows.length - insertedRows.length;
  }

  return {
    attemptedCount: normalizedRows.length,
    insertedCount,
    skippedDuplicateCount,
  };
}
