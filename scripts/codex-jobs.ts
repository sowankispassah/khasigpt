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
import { getAppSettingUncached, setAppSetting } from "@/lib/db/queries";
import { getJobsScrapeRunnerModeUncached } from "@/lib/jobs/runner-mode";
import { type NewJobRow, saveJobs } from "@/lib/jobs/saveJobs";
import { getJobsScrapeHistory, getJobsScrapeProgressSnapshot } from "@/lib/jobs/scrape-orchestrator";
import { resolveJobsScrapeSources } from "@/lib/jobs/source-registry";
import { isMeghalayaLocation } from "@/lib/scraper/scraper-utils";

const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_JOBS = 300;
const DAY_MS = 24 * 60 * 60 * 1000;

type Source = { name: string; url: string; locationScope?: string };
type SourceVisit = { url: string; status: "ok" | "failed" };
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

function text(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function publicUrl(value: unknown, maxLength = 2048) {
  const raw = text(value, maxLength);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      /^(localhost|127\.|0\.|\[?::1\]?)/i.test(url.hostname)
    ) {
      return null;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function canonicalJobUrl(value: unknown) {
  const normalized = publicUrl(value);
  if (!normalized) return null;
  const url = new URL(normalized);
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|refid$|trackingid$|position$|pagenum$)/i.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

function lookbackDays(value: unknown) {
  const parsed = typeof value === "number" ? value : Number.parseInt(text(value, 16), 10);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(365, Math.trunc(parsed))) : 10;
}

function normalizeVisits(value: unknown, sources: Source[]): SourceVisit[] {
  if (!Array.isArray(value)) throw new Error("visitedSources must be an array");
  const allowed = new Set(sources.map((source) => publicUrl(source.url)));
  const visits = new Map<string, SourceVisit>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const candidate = entry as Record<string, unknown>;
    const url = publicUrl(candidate.url);
    if (!url || !allowed.has(url)) continue;
    if (candidate.status !== "ok" && candidate.status !== "failed") continue;
    visits.set(url, { url, status: candidate.status });
  }
  if (visits.size !== sources.length) {
    throw new Error("Every enabled source must have an ok or failed visit result");
  }
  return [...visits.values()];
}

function normalizeJob(
  value: unknown,
  sourceByUrl: Map<string, Source>,
  fetchedUrls: Set<string>,
  days: number,
  now: Date
): NewJobRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const sourcePageUrl = publicUrl(candidate.sourcePageUrl);
  const source = sourcePageUrl ? sourceByUrl.get(sourcePageUrl) : null;
  if (!sourcePageUrl || !source || !fetchedUrls.has(sourcePageUrl)) return null;

  const sourceUrl = canonicalJobUrl(candidate.sourceUrl);
  const applicationUrl = canonicalJobUrl(candidate.applicationUrl) ?? sourceUrl;
  const title = text(candidate.title, 220);
  const company = text(candidate.company, 220);
  const location = text(candidate.location, 220);
  const description = text(candidate.description, 10_000);
  if (
    !sourceUrl ||
    sourceUrl === sourcePageUrl ||
    !title ||
    !company ||
    !location ||
    description.length < 20
  ) {
    return null;
  }
  if (
    /(^|\.)linkedin\.com$/i.test(new URL(sourcePageUrl).hostname) &&
    (!/(^|\.)linkedin\.com$/i.test(new URL(sourceUrl).hostname) ||
      !new URL(sourceUrl).pathname.startsWith("/jobs/view/"))
  ) {
    return null;
  }
  if (source.locationScope !== "all_locations" && !isMeghalayaLocation(location)) {
    return null;
  }

  const dateText = text(candidate.publishedAt, 80);
  if (!dateText && /(^|\.)linkedin\.com$/i.test(new URL(sourceUrl).hostname)) {
    return null;
  }
  if (dateText) {
    const published = new Date(dateText);
    if (
      Number.isNaN(published.getTime()) ||
      published.getTime() < now.getTime() - days * DAY_MS ||
      published.getTime() > now.getTime() + DAY_MS
    ) {
      return null;
    }
  }

  return {
    title,
    company,
    location,
    description,
    source: source.name,
    source_url: sourceUrl,
    application_link: applicationUrl,
    salary: text(candidate.salary, 220) || null,
    status: "active",
  };
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
  await setAppSetting({ key: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY, value: status });
  await setAppSetting({ key: JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY, value: summary });
  await setAppSetting({
    key: JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
    value: null,
  });
  if (status === "success") {
    await setAppSetting({
      key: JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
      value: finishedAt.toISOString(),
    });
  }
  await setAppSetting({
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
  await setAppSetting({
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
      .map((job) => normalizeJob(job, sourceByUrl, fetchedUrls, days, now))
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
    await setAppSetting({
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
