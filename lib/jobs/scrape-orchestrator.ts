import "server-only";
import {
  JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY,
  JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
  JOBS_SCRAPE_PROGRESS_SETTING_KEY,
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

export type JobsScrapeProgressState =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "skipped";

export type JobsScrapeProgressSnapshot = {
  runId: string;
  trigger: JobsScrapeTrigger;
  state: JobsScrapeProgressState;
  startedAt: string;
  updatedAt: string;
  finishedAt: string | null;
  totalSources: number;
  processedSources: number;
  currentSource: string | null;
  lastCompletedSource: string | null;
  lookbackDays: number;
  cancelRequested: boolean;
  inserted: number | null;
  updated: number | null;
  skippedDuplicates: number | null;
  message: string | null;
};

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

function parseBoolean(rawValue: unknown, fallback: boolean) {
  if (typeof rawValue === "boolean") {
    return rawValue;
  }
  if (typeof rawValue === "number") {
    if (rawValue === 1) {
      return true;
    }
    if (rawValue === 0) {
      return false;
    }
  }
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function normalizeProgressSnapshot(rawValue: unknown): JobsScrapeProgressSnapshot | null {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return null;
  }
  const candidate = rawValue as Record<string, unknown>;
  const runId =
    typeof candidate.runId === "string" && candidate.runId.trim()
      ? candidate.runId.trim()
      : "";
  const startedAt =
    typeof candidate.startedAt === "string" && candidate.startedAt.trim()
      ? candidate.startedAt.trim()
      : "";
  const updatedAt =
    typeof candidate.updatedAt === "string" && candidate.updatedAt.trim()
      ? candidate.updatedAt.trim()
      : "";
  if (!runId || !startedAt || !updatedAt) {
    return null;
  }

  const trigger: JobsScrapeTrigger =
    candidate.trigger === "manual" || candidate.trigger === "auto"
      ? candidate.trigger
      : "manual";
  const state = (() => {
    const value = typeof candidate.state === "string" ? candidate.state : "";
    if (
      value === "idle" ||
      value === "running" ||
      value === "success" ||
      value === "failed" ||
      value === "cancelled" ||
      value === "skipped"
    ) {
      return value;
    }
    return "idle";
  })();

  const finishedAt =
    typeof candidate.finishedAt === "string" && candidate.finishedAt.trim()
      ? candidate.finishedAt.trim()
      : null;

  return {
    runId,
    trigger,
    state,
    startedAt,
    updatedAt,
    finishedAt,
    totalSources:
      typeof candidate.totalSources === "number" && Number.isFinite(candidate.totalSources)
        ? Math.max(0, Math.trunc(candidate.totalSources))
        : 0,
    processedSources:
      typeof candidate.processedSources === "number" &&
      Number.isFinite(candidate.processedSources)
        ? Math.max(0, Math.trunc(candidate.processedSources))
        : 0,
    currentSource:
      typeof candidate.currentSource === "string" && candidate.currentSource.trim()
        ? candidate.currentSource.trim()
        : null,
    lastCompletedSource:
      typeof candidate.lastCompletedSource === "string" &&
      candidate.lastCompletedSource.trim()
        ? candidate.lastCompletedSource.trim()
        : null,
    lookbackDays:
      typeof candidate.lookbackDays === "number" && Number.isFinite(candidate.lookbackDays)
        ? Math.max(0, Math.trunc(candidate.lookbackDays))
        : DEFAULT_JOBS_SCRAPE_LOOKBACK_DAYS,
    cancelRequested: parseBoolean(candidate.cancelRequested, false),
    inserted:
      typeof candidate.inserted === "number" && Number.isFinite(candidate.inserted)
        ? Math.trunc(candidate.inserted)
        : null,
    updated:
      typeof candidate.updated === "number" && Number.isFinite(candidate.updated)
        ? Math.trunc(candidate.updated)
        : null,
    skippedDuplicates:
      typeof candidate.skippedDuplicates === "number" &&
      Number.isFinite(candidate.skippedDuplicates)
        ? Math.trunc(candidate.skippedDuplicates)
        : null,
    message:
      typeof candidate.message === "string" && candidate.message.trim()
        ? candidate.message.trim()
        : null,
  };
}

function resolveEarlierDate(first: Date | null, second: Date | null) {
  if (first && second) {
    return first.getTime() <= second.getTime() ? first : second;
  }
  return first ?? second;
}

async function setManyAppSettings(entries: AppSettingEntry[]) {
  for (const entry of entries) {
    if (entry.value === null || entry.value === undefined) {
      await deleteAppSetting(entry.key);
      continue;
    }

    await setAppSetting({
      key: entry.key,
      value: entry.value,
    });
  }
}

async function setProgressSafely(snapshot: JobsScrapeProgressSnapshot | null) {
  try {
    if (snapshot === null) {
      await deleteAppSetting(JOBS_SCRAPE_PROGRESS_SETTING_KEY);
      return;
    }
    await setAppSetting({
      key: JOBS_SCRAPE_PROGRESS_SETTING_KEY,
      value: snapshot,
    });
  } catch (error) {
    console.warn("[jobs-orchestrator] progress_update_failed", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
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

export async function getJobsScrapeProgressSnapshot() {
  const raw = await getAppSettingUncached<unknown>(JOBS_SCRAPE_PROGRESS_SETTING_KEY);
  return normalizeProgressSnapshot(raw);
}

export async function requestJobsScrapeCancel() {
  await setAppSetting({
    key: JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY,
    value: true,
  });

  const current = await getJobsScrapeProgressSnapshot();
  if (current?.state === "running") {
    await setProgressSafely({
      ...current,
      cancelRequested: true,
      updatedAt: new Date().toISOString(),
      message: "Cancellation requested. Waiting for current source to finish.",
    });
  }
}

export async function clearJobsScrapeCancelRequest() {
  await deleteAppSetting(JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY);
}

export async function runJobsScrapeWithScheduling({
  trigger,
  persistSkips = true,
  ignoreLockForManual = false,
  runId = crypto.randomUUID(),
}: {
  trigger: JobsScrapeTrigger;
  persistSkips?: boolean;
  ignoreLockForManual?: boolean;
  runId?: string;
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
  const shouldIgnoreLock = trigger === "manual" && ignoreLockForManual;
  const forcedManualRun = shouldIgnoreLock && decision.skipReason === "locked";
  const shouldRun =
    forcedManualRun ||
    (decision.skipReason === "locked" ? false : decision.shouldRun) ||
    oneTimeDue;

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

    if (persistSkips) {
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
    }

    await setProgressSafely({
      runId,
      trigger,
      state: "skipped",
      startedAt: startedAt.toISOString(),
      updatedAt: finishedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      totalSources: 0,
      processedSources: 0,
      currentSource: null,
      lastCompletedSource: null,
      lookbackDays: runtime.lookbackDays,
      cancelRequested: false,
      inserted: null,
      updated: null,
      skippedDuplicates: null,
      message: effectiveSkipReason ?? "Skipped",
    });

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

  const sourceResolution = await resolveJobsScrapeSources({
    uncached: true,
  });
  const totalSources = sourceResolution.scraperSources.length;

  const lockUntil = createScrapeLockUntil(startedAt);
  await setManyAppSettings([
    {
      key: JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
      value: lockUntil.toISOString(),
    },
    {
      key: JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY,
      value: false,
    },
  ]);

  let progressSnapshot: JobsScrapeProgressSnapshot = {
    runId,
    trigger,
    state: "running",
    startedAt: startedAt.toISOString(),
    updatedAt: startedAt.toISOString(),
    finishedAt: null,
    totalSources,
    processedSources: 0,
    currentSource: null,
    lastCompletedSource: null,
    lookbackDays: runtime.lookbackDays,
    cancelRequested: false,
    inserted: null,
    updated: null,
    skippedDuplicates: null,
    message: "Scrape started",
  };
  await setProgressSafely(progressSnapshot);

  const updateProgress = async (
    patch: Partial<JobsScrapeProgressSnapshot>,
    now: Date = new Date()
  ) => {
    progressSnapshot = {
      ...progressSnapshot,
      ...patch,
      updatedAt: now.toISOString(),
    };
    await setProgressSafely(progressSnapshot);
  };

  const shouldCancel = async () => {
    const rawCancel = await getAppSettingUncached<unknown>(
      JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY
    ).catch(() => false);
    const cancelRequested = parseBoolean(rawCancel, false);
    if (cancelRequested !== progressSnapshot.cancelRequested) {
      await updateProgress({
        cancelRequested,
        message: cancelRequested
          ? "Cancellation requested. Waiting for current source to finish."
          : progressSnapshot.message,
      });
    }
    return cancelRequested;
  };

  try {
    const scrapeResult = await runJobsScraper(sourceResolution.scraperSources, {
      lookbackDays: runtime.lookbackDays,
      shouldCancel,
      onSourceStart: async ({ source, sourceIndex }) => {
        await updateProgress({
          currentSource: source,
          processedSources: sourceIndex,
          message: `Processing ${source} (${sourceIndex + 1}/${totalSources})`,
        });
      },
      onSourceComplete: async ({ source, sourceIndex }) => {
        await updateProgress({
          currentSource: null,
          lastCompletedSource: source,
          processedSources: sourceIndex + 1,
          message: `Completed ${source} (${sourceIndex + 1}/${totalSources})`,
        });
      },
    });

    const finishedAt = new Date();
    const nextDueAt = getNextJobsScrapeDueAt({
      settings: runtime.settings,
      lastSuccessAt: finishedAt,
      now: finishedAt,
    });

    const wasCancelled = scrapeResult.summary.cancelled;
    const summary = {
      trigger,
      skipped: false,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      sourcesProcessed: scrapeResult.summary.sourcesProcessed,
      totalSources: scrapeResult.summary.totalSources,
      lookbackDays: scrapeResult.summary.lookbackDays,
      scrapedAfterFilters: scrapeResult.jobs.length,
      inserted: scrapeResult.persisted.insertedCount,
      updated: scrapeResult.persisted.updatedCount,
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
      cancelled: wasCancelled,
    };

    const successEntries: AppSettingEntry[] = [
      {
        key: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
        value: wasCancelled ? "cancelled" : "success",
      },
      {
        key: JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
        value: wasCancelled ? "cancel_requested" : null,
      },
      {
        key: JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
        value: summary,
      },
      {
        key: JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
        value: null,
      },
      {
        key: JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY,
        value: false,
      },
    ];
    if (!wasCancelled) {
      successEntries.push({
        key: JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
        value: finishedAt.toISOString(),
      });
    }
    if (oneTimeDue) {
      successEntries.push({
        key: JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
        value: null,
      });
    }
    await setManyAppSettings(successEntries);

    await updateProgress({
      state: wasCancelled ? "cancelled" : "success",
      finishedAt: finishedAt.toISOString(),
      currentSource: null,
      processedSources: scrapeResult.summary.sourcesProcessed,
      totalSources: scrapeResult.summary.totalSources,
      inserted: scrapeResult.persisted.insertedCount,
      updated: scrapeResult.persisted.updatedCount,
      skippedDuplicates:
        scrapeResult.persisted.skippedDuplicateCount +
        scrapeResult.summary.totalDuplicatesInRun,
      message: wasCancelled ? "Scrape cancelled" : "Scrape completed",
    });

    return {
      ok: true,
      trigger,
      skipped: false,
      skipReason: wasCancelled ? "cancel_requested" : null,
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
      {
        key: JOBS_SCRAPE_CANCEL_REQUESTED_SETTING_KEY,
        value: false,
      },
    ];
    if (oneTimeDue) {
      failedEntries.push({
        key: JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
        value: null,
      });
    }
    await setManyAppSettings(failedEntries);

    await updateProgress({
      state: "failed",
      finishedAt: finishedAt.toISOString(),
      currentSource: null,
      message,
    });

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
