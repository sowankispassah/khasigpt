import { readFile, stat } from "node:fs/promises";
import {
  JOBS_SCRAPE_HISTORY_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
  JOBS_SCRAPE_PROGRESS_SETTING_KEY,
} from "@/lib/constants";
import { deleteAppSetting, getAppSettingUncached, setAppSetting } from "@/lib/db/queries";
import { lookbackDays, normalizeCodexJob, normalizeVisits, publicUrl } from "@/lib/jobs/codex-import";
import { getJobsScrapeRunnerModeUncached } from "@/lib/jobs/runner-mode";
import { type NewJobRow, saveJobs } from "@/lib/jobs/saveJobs";
import { getJobsScrapeHistory, getJobsScrapeProgressSnapshot } from "@/lib/jobs/scrape-orchestrator";
import { resolveJobsScrapeSources } from "@/lib/jobs/source-registry";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_JOBS = 300;

type ImportOutcome = {
  attempted: number;
  inserted: number;
  updated: number;
  skippedDuplicates: number;
  skippedInvalid: number;
  sourcesVisited: number;
  sourcesFetched: number;
  sourceFailures: number;
};

function output(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function writeSetting(input: Parameters<typeof setAppSetting>[0]) {
  // This CLI runs outside a Next.js request, where revalidateTag has no store.
  return setAppSetting(input, { revalidateCache: false });
}

async function recordRun({
  runId,
  startedAt,
  status,
  outcome,
  days,
  errorMessage,
}: {
  runId: string;
  startedAt: Date;
  status: "success" | "failed";
  outcome: ImportOutcome;
  days: number;
  errorMessage?: string;
}) {
  const finishedAt = new Date();
  const summary = {
    trigger: "chatgpt",
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    sourcesProcessed: outcome.sourcesVisited,
    totalSources: outcome.sourcesVisited,
    sourcesFetched: outcome.sourcesFetched,
    sourceFailures: outcome.sourceFailures,
    inserted: outcome.inserted,
    updated: outcome.updated,
    skippedDuplicates: outcome.skippedDuplicates,
    skippedInvalid: outcome.skippedInvalid,
    errorMessage: errorMessage ?? null,
  };
  await writeSetting({ key: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY, value: status });
  await writeSetting({ key: JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY, value: summary });
  await deleteAppSetting(JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY, {
    revalidateCache: false,
  });
  if (status === "success") {
    await writeSetting({
      key: JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
      value: finishedAt.toISOString(),
    });
  }
  await writeSetting({
    key: JOBS_SCRAPE_PROGRESS_SETTING_KEY,
    value: {
      runId,
      trigger: "chatgpt",
      state: status,
      startedAt: startedAt.toISOString(),
      updatedAt: finishedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      totalSources: outcome.sourcesVisited,
      processedSources: outcome.sourcesVisited,
      currentSource: null,
      lastCompletedSource: null,
      lookbackDays: days,
      cancelRequested: false,
      inserted: outcome.inserted,
      updated: outcome.updated,
      skippedDuplicates: outcome.skippedDuplicates,
      message: status === "success" ? "Codex jobs import completed" : "Codex jobs import failed",
      failureDetails: [],
    },
  });
  const history = await getJobsScrapeHistory({ limit: 99 });
  await writeSetting({
    key: JOBS_SCRAPE_HISTORY_SETTING_KEY,
    value: [
      {
        runId,
        trigger: "chatgpt",
        status,
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        durationMs: summary.durationMs,
        completionPercent: status === "success" ? 100 : 0,
        processedSources: outcome.sourcesVisited,
        totalSources: outcome.sourcesVisited,
        inserted: outcome.inserted,
        updated: outcome.updated,
        skippedDuplicates: outcome.skippedDuplicates,
        skipReason: null,
        errorMessage: errorMessage ?? null,
      },
      ...history,
    ],
  });
}

async function main() {
  const mode = await getJobsScrapeRunnerModeUncached();
  if (mode !== "chatgpt") {
    output({ ok: true, skipped: true, skipReason: "runner_mode" });
    return;
  }
  const sourceResolution = await resolveJobsScrapeSources({ uncached: true });
  const sources = sourceResolution.scraperSources.map(({ name, url, locationScope }) => ({
    name,
    url,
    locationScope: locationScope ?? "meghalaya_only",
  }));
  const days = lookbackDays(
    await getAppSettingUncached<unknown>(JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY)
  );
  if (process.argv[2] === "sources") {
    output({ ok: true, mode, lookbackDays: days, sources });
    return;
  }
  if (process.argv[2] !== "import" || !process.argv[3]) {
    throw new Error("Usage: pnpm jobs:codex sources | pnpm jobs:codex import <json-file>");
  }
  const inputPath = process.argv[3];
  if ((await stat(inputPath)).size > MAX_INPUT_BYTES) {
    throw new Error("Import file is too large");
  }
  const payload = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>;
  const visits = normalizeVisits(payload.visitedSources, sources);
  const fetchedUrls = new Set(visits.filter((item) => item.status === "ok").map((item) => item.url));
  const outcome: ImportOutcome = {
    attempted: 0,
    inserted: 0,
    updated: 0,
    skippedDuplicates: 0,
    skippedInvalid: 0,
    sourcesVisited: visits.length,
    sourcesFetched: fetchedUrls.size,
    sourceFailures: visits.length - fetchedUrls.size,
  };
  const runId = crypto.randomUUID();
  const startedAt = new Date();
  try {
    if (fetchedUrls.size === 0) {
      throw new Error("All job sources failed; import was not marked successful");
    }
    if (!Array.isArray(payload.jobs) || payload.jobs.length > MAX_JOBS) {
      throw new Error("jobs must be an array of at most 300 listings");
    }
    const sourceByUrl = new Map(
      sources.map((source) => [publicUrl(source.url) as string, source])
    );
    const now = new Date();
    const rows = payload.jobs
      .map((job) => normalizeCodexJob(job, sourceByUrl, fetchedUrls, days, now))
      .filter((job): job is NewJobRow => job !== null);
    outcome.attempted = payload.jobs.length;
    outcome.skippedInvalid = payload.jobs.length - rows.length;
    if (payload.jobs.length > 0 && rows.length === 0) {
      throw new Error("All job listings failed validation");
    }
    const activeRun = await getJobsScrapeProgressSnapshot();
    if (activeRun?.state === "running") {
      output({ ok: true, skipped: true, skipReason: "running" });
      return;
    }
    await writeSetting({
      key: JOBS_SCRAPE_PROGRESS_SETTING_KEY,
      value: {
        runId,
        trigger: "chatgpt",
        state: "running",
        startedAt: startedAt.toISOString(),
        updatedAt: startedAt.toISOString(),
        finishedAt: null,
        totalSources: visits.length,
        processedSources: visits.length,
        currentSource: null,
        lastCompletedSource: null,
        lookbackDays: days,
        cancelRequested: false,
        inserted: null,
        updated: null,
        skippedDuplicates: null,
        message: "Saving Codex-gathered jobs",
        failureDetails: [],
      },
    });
    // This command writes only to the jobs database. Codex gathers the pages;
    // no project scraper, PDF processor, Google API, or RAG sync is invoked.
    const saved = await saveJobs(rows, { onDuplicate: "skip", syncRag: false });
    outcome.inserted = saved.insertedCount;
    outcome.updated = saved.updatedCount;
    outcome.skippedDuplicates = saved.skippedDuplicateCount;
    await recordRun({ runId, startedAt, status: "success", outcome, days });
    output({ ok: true, skipped: false, ...outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordRun({
      runId,
      startedAt,
      status: "failed",
      outcome,
      days,
      errorMessage: message,
    }).catch((recordError) => {
      console.error("[codex-jobs] failed_to_record_failure", recordError);
    });
    throw error;
  }
}

main().catch((error) => {
  console.error("[codex-jobs] import_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
