import { JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY } from "@/lib/constants";
import { getAppSettingUncached } from "@/lib/db/queries";
import { getJobsScrapeRunnerModeUncached } from "@/lib/jobs/runner-mode";
import { parseDateOrNull } from "@/lib/jobs/schedule";
import {
  getJobsScrapeProgressSnapshot,
  runJobsScrapeWithScheduling,
} from "@/lib/jobs/scrape-orchestrator";
import { resolveJobsScrapeSources } from "@/lib/jobs/source-registry";

const INDIA_UTC_OFFSET_MS = 330 * 60_000;
const DAILY_DUE_HOUR_INDIA = 6;

function getLatestDailyDueAt(now: Date) {
  const indiaClock = new Date(now.getTime() + INDIA_UTC_OFFSET_MS);
  const todayDueAt = new Date(
    Date.UTC(
      indiaClock.getUTCFullYear(),
      indiaClock.getUTCMonth(),
      indiaClock.getUTCDate(),
      DAILY_DUE_HOUR_INDIA
    ) - INDIA_UTC_OFFSET_MS
  );

  return now >= todayDueAt
    ? todayDueAt
    : new Date(todayDueAt.getTime() - 24 * 60 * 60_000);
}

function getIndiaDateKey(value: Date) {
  const indiaClock = new Date(value.getTime() + INDIA_UTC_OFFSET_MS);
  return `${indiaClock.getUTCFullYear()}-${indiaClock.getUTCMonth() + 1}-${indiaClock.getUTCDate()}`;
}

function getSatisfiedDueReason(lastSuccessAt: Date | null, now: Date, dueAt: Date) {
  if (!lastSuccessAt) {
    return null;
  }
  if (getIndiaDateKey(lastSuccessAt) === getIndiaDateKey(now)) {
    return "already_ran_today";
  }
  return lastSuccessAt >= dueAt ? "already_ran_since_due" : null;
}

async function getLastSuccessfulRunAt() {
  const raw = await getAppSettingUncached<unknown>(JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY);
  return parseDateOrNull(raw);
}

function writeSkipped(skipReason: string, dueAt: Date | null = null) {
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      skipped: true,
      skipReason,
      dueAt: dueAt?.toISOString() ?? null,
      sourcesProcessed: 0,
      sourcesFetched: 0,
      inserted: 0,
      updated: 0,
      skippedDuplicates: 0,
      error: null,
    })}\n`
  );
}

async function main() {
  if (process.argv.includes("--check")) {
    const [runnerMode, sources, lastSuccessAt] = await Promise.all([
      getJobsScrapeRunnerModeUncached(),
      resolveJobsScrapeSources({ uncached: true }),
      getLastSuccessfulRunAt(),
    ]);
    const now = new Date();
    const dueAt = getLatestDailyDueAt(now);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        runnerMode,
        sourceCount: sources.scraperSources.length,
        usingFallbackSources: sources.usingFallbackSources,
        catchupDue:
          runnerMode === "chatgpt" &&
          getSatisfiedDueReason(lastSuccessAt, now, dueAt) === null,
        dueAt: dueAt.toISOString(),
      })}\n`
    );
    return;
  }

  const runnerMode = await getJobsScrapeRunnerModeUncached();
  if (runnerMode !== "chatgpt") {
    writeSkipped("runner_mode");
    return;
  }

  const now = new Date();
  const dueAt = getLatestDailyDueAt(now);
  const lastSuccessAt = await getLastSuccessfulRunAt();
  const satisfiedDueReason = getSatisfiedDueReason(lastSuccessAt, now, dueAt);
  if (satisfiedDueReason) {
    writeSkipped(satisfiedDueReason, dueAt);
    return;
  }

  const activeRun = await getJobsScrapeProgressSnapshot();
  if (activeRun?.state === "running") {
    writeSkipped("running", dueAt);
    return;
  }

  const result = await runJobsScrapeWithScheduling({
    trigger: "chatgpt",
    persistSkips: false,
  });
  const scrape = result.scrapeResult;
  const fetchedSources = scrape?.summary.sourceStats.filter((source) => source.fetched).length ?? 0;

  process.stdout.write(
    `${JSON.stringify({
      ok: result.ok,
      skipped: result.skipped,
      skipReason: result.skipReason,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      sourcesProcessed: scrape?.summary.sourcesProcessed ?? 0,
      sourcesFetched: fetchedSources,
      inserted: scrape?.persisted.insertedCount ?? 0,
      updated: scrape?.persisted.updatedCount ?? 0,
      skippedDuplicates: scrape?.persisted.skippedDuplicateCount ?? 0,
      error: result.errorMessage,
    })}\n`
  );

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[jobs-scheduled] run_failed", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
