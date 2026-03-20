import Module from "node:module";
import { config } from "dotenv";

const DEFAULT_BATCH_SIZE = 100;

type SyncResult = {
  created: number;
  updated: number;
  failed: number;
  failureDetails?: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
};

function patchServerOnly() {
  const moduleWithLoad = Module as typeof Module & {
    _load?: (request: string, parent: unknown, isMain: boolean) => unknown;
  };
  const originalLoad = moduleWithLoad._load;

  if (!originalLoad) {
    return;
  }

  moduleWithLoad._load = function patchedLoad(
    request: string,
    parent: unknown,
    isMain: boolean
  ) {
    if (request === "server-only") {
      return {};
    }

    return originalLoad.call(this, request, parent, isMain);
  };
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.trunc(parsed);
}

async function loadJobIds({
  supabase,
  onlyStale,
  onlyFailedEmbeddings,
  limit,
}: {
  supabase: Awaited<ReturnType<(typeof import("../lib/supabase/server"))["createSupabaseAdminClient"]>>;
  onlyStale: boolean;
  onlyFailedEmbeddings: boolean;
  limit: number | null;
}) {
  if (!onlyStale && !onlyFailedEmbeddings) {
    let query = supabase
      .from("jobs")
      .select("id")
      .order("created_at", { ascending: false });
    if (limit !== null) {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(`[rebuild-jobs-rag] Failed to load job ids: ${error.message}`);
    }

    return (data ?? [])
      .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
      .filter((value) => value.length > 0);
  }

  const [{ default: postgres }] = await Promise.all([import("postgres")]);
  const url = process.env.POSTGRES_URL?.trim();
  if (!url) {
    throw new Error("[rebuild-jobs-rag] POSTGRES_URL is required for stale-only mode.");
  }

  const sql = postgres(url, {
    max: 1,
    ssl: url.includes("sslmode") ? "require" : undefined,
    onnotice: () => {},
  });
  try {
    const limitClause = limit !== null ? ` limit ${limit}` : "";
    const staleWhere = onlyFailedEmbeddings
      ? `
        r.metadata ->> 'jobs_kind' = 'job_posting'
        and r.metadata ->> 'jobs_source' = 'supabase_jobs_table'
        and r."embeddingStatus" = 'failed'
      `
      : `
        r.id is null
        or r.metadata ->> 'jobs_kind' <> 'job_posting'
        or r.metadata ->> 'jobs_source' <> 'supabase_jobs_table'
        or r.metadata ->> 'jobs_sync_version' <> '2'
      `;
    const joinType = onlyFailedEmbeddings ? `join` : `left join`;
    const rows = await sql.unsafe<Array<{ id: string }>>(
      `
        select j.id
        from public.jobs j
        ${joinType} "RagEntry" r on r.id = j.id and r."deletedAt" is null
        where ${staleWhere}
        order by j.created_at desc${limitClause}
      `
    );

    return rows
      .map((row) => (typeof row.id === "string" ? row.id.trim() : ""))
      .filter((value) => value.length > 0);
  } finally {
    await sql.end();
  }
}

async function main() {
  patchServerOnly();
  config({ path: ".env.local" });
  config({ path: ".env", override: false });

  const batchSize = parsePositiveInt(
    process.env.JOBS_RAG_REBUILD_BATCH_SIZE,
    DEFAULT_BATCH_SIZE
  );
  const limitRaw = process.env.JOBS_RAG_REBUILD_LIMIT;
  const limit = limitRaw ? parsePositiveInt(limitRaw, batchSize) : null;
  const onlyStale = process.env.JOBS_RAG_REBUILD_ONLY_STALE === "1";
  const onlyFailedEmbeddings =
    process.env.JOBS_RAG_REBUILD_ONLY_FAILED_EMBEDDINGS === "1";

  const [{ syncJobPostingsToRag }, { createSupabaseAdminClient }] =
    await Promise.all([
      import("../lib/jobs/rag-sync"),
      import("../lib/supabase/server"),
    ]);

  const supabase = createSupabaseAdminClient();
  const jobIds = await loadJobIds({
    supabase,
    onlyStale,
    onlyFailedEmbeddings,
    limit,
  });

  if (jobIds.length === 0) {
    console.log("[rebuild-jobs-rag] No jobs found.");
    return;
  }

  let created = 0;
  let updated = 0;
  let failed = 0;
  const failureDetails: Array<{ id: string; title: string; reason: string }> = [];

  for (const batch of chunk(jobIds, batchSize)) {
    const result = (await syncJobPostingsToRag({
      jobIds: batch,
    })) as SyncResult;
    created += result.created;
    updated += result.updated;
    failed += result.failed;

    if (Array.isArray(result.failureDetails)) {
      failureDetails.push(...result.failureDetails);
    }

    console.log("[rebuild-jobs-rag] Batch complete", {
      batchSize: batch.length,
      created: result.created,
      updated: result.updated,
      failed: result.failed,
    });
  }

  console.log("[rebuild-jobs-rag] Finished", {
    total: jobIds.length,
    created,
    updated,
    failed,
    failures: failureDetails.slice(0, 10),
  });
}

main().catch((error) => {
  console.error("[rebuild-jobs-rag] Failed", error);
  process.exit(1);
});
