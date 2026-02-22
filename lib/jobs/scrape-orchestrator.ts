import "server-only";
import {
  JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
} from "@/lib/constants";
import { deleteAppSetting, getAppSettingUncached, setAppSetting } from "@/lib/db/queries";
import {
  JOBS_SCRAPE_SETTING_KEYS,
  type JobsScrapeScheduleSettings,
  type JobsScrapeTrigger,
  createScrapeLockUntil,
  evaluateJobsScrapeSchedule,
  getNextJobsScrapeDueAt,
  parseDateOrNull,
  resolveJobsScrapeScheduleSettings,
  resolveJobsScrapeScheduleState,
} from "@/lib/jobs/schedule";
import { resolveJobsScrapeSources } from "@/lib/jobs/source-registry";
import { runJobsScraper } from "@/lib/scraper/jobsScraper";

type ScrapeResultPayload = Awaited<ReturnType<typeof runJobsScraper>>;

export type JobsScrapeOrchestrationResult = {
  ok: boolean;
  trigger: JobsScrapeTrigger;
  skipped: boolean;
  skipReason: string | null;
  nextDueAt: string | null;
  settings: JobsScrapeScheduleSettings;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  scrapeResult: ScrapeResultPayload | null;
  errorMessage: string | null;
};

type AppSettingEntry = {
  key: string;
  value: unknown;
};

const DEFAULT_JOBS_SCRAPE_LOOKBACK_DAYS = 10;
const MIN_JOBS_SCRAPE_LOOKBACK_DAYS = 1;
const MAX_JOBS_SCRAPE_LOOKBACK_DAYS = 365;

function parseLookbackDays(rawValue: unknown) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return Math.max(
      MIN_JOBS_SCRAPE_LOOKBACK_DAYS,
      Math.min(MAX_JOBS_SCRAPE_LOOKBACK_DAYS, Math.trunc(rawValue))
    );
  }
  if (typeof rawValue === "string") {
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(
        MIN_JOBS_SCRAPE_LOOKBACK_DAYS,
        Math.min(MAX_JOBS_SCRAPE_LOOKBACK_DAYS, Math.trunc(parsed))
      );
    }
  }
  return DEFAULT_JOBS_SCRAPE_LOOKBACK_DAYS;
}

function resolveEarlierDate(first: Date | null, second: Date | null) {
  if (first && second) {
    return first.getTime() <= second.getTime() ? first : second;
  }
  return first ?? second;
}

async function setManyAppSettings(entries: AppSettingEntry[]) {
  await Promise.all(
    entries.map((entry) => {
      if (entry.value === null || entry.value === undefined) {
        return deleteAppSetting(entry.key);
      }
      return setAppSetting({
        key: entry.key,
        value: entry.value,
      });
    })
  );
}

async function loadJobsScrapeRuntimeState() {
  const [
    enabledRaw,
    intervalRaw,
    startTimeRaw,
    timezoneRaw,
    lookbackDaysRaw,
    oneTimeAtRaw,
    lastSuccessAtRaw,
    lockUntilRaw,
    lastRunStatusRaw,
    lastSkipReasonRaw,
  ] = await Promise.all([
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.enabled),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.intervalHours),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.startTime),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.timezone),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.lastSuccessAt),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.lockUntil),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.lastRunStatus),
    getAppSettingUncached<unknown>(JOBS_SCRAPE_SETTING_KEYS.lastSkipReason),
  ]);

  const settings = resolveJobsScrapeScheduleSettings({
    enabled: enabledRaw,
    intervalHours: intervalRaw,
    startTime: startTimeRaw,
    timezone: timezoneRaw,
  });

  const state = resolveJobsScrapeScheduleState({
    lastSuccessAt: lastSuccessAtRaw,
    lockUntil: lockUntilRaw,
    lastRunStatus: lastRunStatusRaw,
    lastSkipReason: lastSkipReasonRaw,
  });

  const lookbackDays = parseLookbackDays(lookbackDaysRaw);
  const oneTimeAt = parseDateOrNull(oneTimeAtRaw);

  return { settings, state, lookbackDays, oneTimeAt };
}

export async function runJobsScrapeWithScheduling({
  trigger,
}: {
  trigger: JobsScrapeTrigger;
}): Promise<JobsScrapeOrchestrationResult> {
  const startedAt = new Date();
  const runtime = await loadJobsScrapeRuntimeState();
  const decision = evaluateJobsScrapeSchedule({
    trigger,
    settings: runtime.settings,
    state: runtime.state,
    now: startedAt,
  });
  const oneTimeDue =
    trigger === "auto" &&
    runtime.oneTimeAt !== null &&
    startedAt.getTime() >= runtime.oneTimeAt.getTime();
  const oneTimeUpcoming =
    trigger === "auto" &&
    runtime.oneTimeAt !== null &&
    startedAt.getTime() < runtime.oneTimeAt.getTime()
      ? runtime.oneTimeAt
      : null;
  const shouldRun = decision.skipReason === "locked" ? false : decision.shouldRun || oneTimeDue;

  if (!shouldRun) {
    const finishedAt = new Date();
    const mergedNextDueAt = resolveEarlierDate(decision.nextDueAt, oneTimeUpcoming);
    const effectiveSkipReason =
      oneTimeUpcoming && decision.skipReason !== "locked"
        ? "waiting_for_one_time"
        : decision.skipReason;
    const summary = {
      trigger,
      skipped: true,
      skipReason: effectiveSkipReason,
      nextDueAt: mergedNextDueAt?.toISOString() ?? null,
      oneTimeScheduledAt: runtime.oneTimeAt?.toISOString() ?? null,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    };

    await setManyAppSettings([
      {
        key: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
        value: "skipped",
      },
      {
        key: JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
        value: effectiveSkipReason ?? null,
      },
      {
        key: JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
        value: summary,
      },
    ]);

    return {
      ok: true,
      trigger,
      skipped: true,
      skipReason: effectiveSkipReason,
      nextDueAt: mergedNextDueAt?.toISOString() ?? null,
      settings: runtime.settings,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: summary.durationMs,
      scrapeResult: null,
      errorMessage: null,
    };
  }

  const lockUntil = createScrapeLockUntil(startedAt);
  await setAppSetting({
    key: JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
    value: lockUntil.toISOString(),
  });

  try {
    const sourceResolution = await resolveJobsScrapeSources({
      uncached: true,
    });
    const scrapeResult = await runJobsScraper(sourceResolution.scraperSources, {
      lookbackDays: runtime.lookbackDays,
    });
    const finishedAt = new Date();
    const nextDueAt = getNextJobsScrapeDueAt({
      settings: runtime.settings,
      lastSuccessAt: finishedAt,
      now: finishedAt,
    });
    const summary = {
      trigger,
      skipped: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      sourcesProcessed: scrapeResult.summary.sourcesProcessed,
      lookbackDays: scrapeResult.summary.lookbackDays,
      scrapedAfterFilters: scrapeResult.jobs.length,
      inserted: scrapeResult.persisted.insertedCount,
      skippedDuplicates:
        scrapeResult.persisted.skippedDuplicateCount +
        scrapeResult.summary.totalDuplicatesInRun,
      filteredByLocation: scrapeResult.summary.totalFilteredByLocation,
      filteredByDate: scrapeResult.summary.totalFilteredByDate,
      sourceStats: scrapeResult.summary.sourceStats,
      usingFallbackSources: sourceResolution.usingFallbackSources,
      managedSourceCount: sourceResolution.managedSources.length,
      enabledManagedSourceCount: sourceResolution.enabledManagedSources.length,
      oneTimeTriggered: oneTimeDue,
      oneTimeScheduledAt: runtime.oneTimeAt?.toISOString() ?? null,
    };
    const successEntries: AppSettingEntry[] = [
      {
        key: JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
        value: finishedAt.toISOString(),
      },
      {
        key: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
        value: "success",
      },
      {
        key: JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
        value: null,
      },
      {
        key: JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
        value: summary,
      },
      {
        key: JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
        value: null,
      },
    ];
    if (oneTimeDue) {
      successEntries.push({
        key: JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
        value: null,
      });
    }
    await setManyAppSettings(successEntries);

    return {
      ok: true,
      trigger,
      skipped: false,
      skipReason: null,
      nextDueAt: nextDueAt?.toISOString() ?? null,
      settings: runtime.settings,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: summary.durationMs,
      scrapeResult,
      errorMessage: null,
    };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : String(error);
    const summary = {
      trigger,
      skipped: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      oneTimeTriggered: oneTimeDue,
      oneTimeScheduledAt: runtime.oneTimeAt?.toISOString() ?? null,
      error: message,
    };
    const failedEntries: AppSettingEntry[] = [
      {
        key: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
        value: "failed",
      },
      {
        key: JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
        value: summary,
      },
      {
        key: JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
        value: null,
      },
    ];
    if (oneTimeDue) {
      failedEntries.push({
        key: JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
        value: null,
      });
    }
    await setManyAppSettings(failedEntries);

    return {
      ok: false,
      trigger,
      skipped: false,
      skipReason: null,
      nextDueAt: null,
      settings: runtime.settings,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: summary.durationMs,
      scrapeResult: null,
      errorMessage: message,
    };
  }
}
