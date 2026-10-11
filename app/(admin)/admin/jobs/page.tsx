import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AdminPageHeader } from "@/components/admin/admin-ui";
import { AdminJobsRunnerModeControl } from "@/components/admin-jobs-runner-mode-control";
import { AdminJobsScrapeControl } from "@/components/admin-jobs-scrape-control";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { getAdminQueryTimeoutMs } from "@/lib/admin/safe-query";
import {
  JOBS_SCRAPE_ENABLED_SETTING_KEY,
  JOBS_SCRAPE_INTERVAL_HOURS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
  JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
  JOBS_SCRAPE_PDF_EXTRACTION_MODE_SETTING_KEY,
  JOBS_SCRAPE_PDF_EXTRACTION_MODEL_ID_SETTING_KEY,
  JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY,
  JOBS_SCRAPE_SOURCES_SETTING_KEY,
  JOBS_SCRAPE_START_TIME_SETTING_KEY,
  JOBS_SCRAPE_TIMEZONE_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  deleteAppSetting,
  getAppSettingsByKeysUncached,
  getAppSettingUncached,
  setAppSetting,
} from "@/lib/db/queries";
import {
  normalizeJobsPdfExtractionModelId,
  resolveJobsPdfExtractionSettings,
} from "@/lib/jobs/pdf-extraction-settings";
import {
  archiveJobPostingFromRag,
  syncJobPostingsToRag,
} from "@/lib/jobs/rag-sync";
import { saveJobs } from "@/lib/jobs/saveJobs";
import {
  getNextJobsScrapeDueAt,
  JOBS_SCRAPE_SETTING_KEYS,
  type JobsScrapeRunnerMode,
  parseBoolean,
  parseDateOrNull,
  parseJobsScrapeRunnerMode,
  resolveJobsScrapeScheduleSettings,
  resolveJobsScrapeScheduleState,
} from "@/lib/jobs/schedule";
import {
  getJobsScrapeHistory,
  getJobsScrapeProgressSnapshot,
  requestJobsScrapeCancel,
} from "@/lib/jobs/scrape-orchestrator";
import { getJobPostingCount, listJobPostingEntries } from "@/lib/jobs/service";
import {
  addManagedJobSource,
  deleteManagedJobSource,
  listManagedJobSources,
  type ManagedJobSourceLocationScope,
  type ManagedJobSourceType,
  setManagedJobSourceEnabled,
  setManagedJobSourceLocationScope,
} from "@/lib/jobs/source-registry";
import {
  getActiveAdminSession,
  requireAdminPageSession,
} from "@/lib/security/admin-session";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/utils/async";
import {
  JobsHistoryPanel,
  JobsImportPanel,
  JobsListPanel,
  JobsManualEntryCard,
  JobsOverview,
  JobsPanelFallback,
  JobsPdfSettingsCard,
  JobsScheduleSettingsCard,
  JobsSourcesPanel,
} from "./jobs-sections";

export const dynamic = "force-dynamic";

const JOBS_SCRAPE_SETTINGS_KEYS = [
  JOBS_SCRAPE_ENABLED_SETTING_KEY,
  JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY,
  JOBS_SCRAPE_INTERVAL_HOURS_SETTING_KEY,
  JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
  JOBS_SCRAPE_START_TIME_SETTING_KEY,
  JOBS_SCRAPE_TIMEZONE_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
  JOBS_SCRAPE_PDF_EXTRACTION_MODE_SETTING_KEY,
  JOBS_SCRAPE_PDF_EXTRACTION_MODEL_ID_SETTING_KEY,
  JOBS_SCRAPE_SOURCES_SETTING_KEY,
];

const DEFAULT_JOBS_SCRAPE_LOOKBACK_DAYS = 10;
const MIN_JOBS_SCRAPE_LOOKBACK_DAYS = 1;
const MAX_JOBS_SCRAPE_LOOKBACK_DAYS = 365;
const JOBS_ADMIN_ACTION_TIMEOUT_MS = 20_000;
const JOBS_ADMIN_ACTION_VERIFY_TIMEOUT_MS = 6_000;
const JOBS_ADMIN_ACTION_RETRY_ATTEMPTS = 2;
const JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS = getAdminQueryTimeoutMs(5_000);

type AdminQueryState<T> = {
  data: T;
  unavailable: boolean;
};
const ADMIN_JOBS_PAGE_SIZE = 25;
const TIMEZONE_OFFSETS_MINUTES = {
  UTC: 0,
  "Asia/Kolkata": 330,
} as const;

type SupportedScrapeTimezone = keyof typeof TIMEZONE_OFFSETS_MINUTES;

function revalidateJobsAdminMutation({
  includeScrapeSettings = false,
  source,
}: {
  includeScrapeSettings?: boolean;
  source: string;
}) {
  invalidateAdminMutation({
    paths: [{ path: "/admin/jobs" }],
    source,
    tags: includeScrapeSettings
      ? JOBS_SCRAPE_SETTINGS_KEYS.map((key) => appSettingCacheTagForKey(key))
      : [],
  });
}

function normalizeSummary(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function settingMatchesExpectedValue({
  expected,
  persisted,
}: {
  expected: unknown;
  persisted: unknown;
}) {
  if (expected === null || typeof expected === "undefined") {
    return persisted === null;
  }

  if (typeof expected === "boolean") {
    return parseBoolean(persisted, !expected) === expected;
  }

  if (typeof expected === "number") {
    if (typeof persisted === "number") {
      return persisted === expected;
    }
    if (typeof persisted === "string") {
      const parsed = Number.parseFloat(persisted);
      return Number.isFinite(parsed) && parsed === expected;
    }
    return false;
  }

  if (typeof expected === "string") {
    if (typeof persisted === "string") {
      return persisted === expected;
    }
    return String(persisted ?? "") === expected;
  }

  return JSON.stringify(persisted) === JSON.stringify(expected);
}

async function persistAppSettingWithRetry({
  key,
  value,
}: {
  key: string;
  value: unknown;
}) {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= JOBS_ADMIN_ACTION_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    try {
      await withTimeout(
        setAppSetting({
          key,
          value,
        }),
        JOBS_ADMIN_ACTION_TIMEOUT_MS
      );
    } catch (error) {
      lastError = error;
      console.warn("[admin/jobs] setting_write_attempt_failed", {
        key,
        attempt,
        retrying: attempt < JOBS_ADMIN_ACTION_RETRY_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const persisted = await withTimeout(
      getAppSettingUncached<unknown>(key),
      JOBS_ADMIN_ACTION_VERIFY_TIMEOUT_MS
    ).catch(() => undefined);

    if (
      settingMatchesExpectedValue({
        expected: value,
        persisted,
      })
    ) {
      return;
    }
  }

  throw (
    lastError ??
    new Error(`Failed to persist application setting: ${key}`)
  );
}

async function deleteAppSettingWithRetry(key: string) {
  let lastError: unknown = null;

  for (
    let attempt = 1;
    attempt <= JOBS_ADMIN_ACTION_RETRY_ATTEMPTS;
    attempt += 1
  ) {
    try {
      await withTimeout(deleteAppSetting(key), JOBS_ADMIN_ACTION_TIMEOUT_MS);
    } catch (error) {
      lastError = error;
      console.warn("[admin/jobs] setting_delete_attempt_failed", {
        key,
        attempt,
        retrying: attempt < JOBS_ADMIN_ACTION_RETRY_ATTEMPTS,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    const persisted = await withTimeout(
      getAppSettingUncached<unknown>(key),
      JOBS_ADMIN_ACTION_VERIFY_TIMEOUT_MS
    ).catch(() => undefined);
    if (persisted === null) {
      return;
    }
  }

  throw (
    lastError ??
    new Error(`Failed to delete application setting: ${key}`)
  );
}

function resolveEarlierDate(first: Date | null, second: Date | null) {
  if (first && second) {
    return first.getTime() <= second.getTime() ? first : second;
  }
  return first ?? second;
}

function normalizeJobStatus(value: string | null | undefined): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
}

function normalizeLocationScope(
  value: string | null | undefined
): ManagedJobSourceLocationScope {
  return value === "all_locations" ? "all_locations" : "meghalaya_only";
}

function parseLookbackDays(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(
      MIN_JOBS_SCRAPE_LOOKBACK_DAYS,
      Math.min(MAX_JOBS_SCRAPE_LOOKBACK_DAYS, Math.trunc(value))
    );
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(
        MIN_JOBS_SCRAPE_LOOKBACK_DAYS,
        Math.min(MAX_JOBS_SCRAPE_LOOKBACK_DAYS, Math.trunc(parsed))
      );
    }
  }
  return DEFAULT_JOBS_SCRAPE_LOOKBACK_DAYS;
}

function resolveScrapeTimezone(value: unknown): SupportedScrapeTimezone {
  return value === "UTC" || value === "Asia/Kolkata" ? value : "Asia/Kolkata";
}

function parseDateTimeLocalToUtcIso({
  value,
  timezone,
}: {
  value: string;
  timezone: SupportedScrapeTimezone;
}) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const year = Number.parseInt(match[1] ?? "", 10);
  const month = Number.parseInt(match[2] ?? "", 10);
  const day = Number.parseInt(match[3] ?? "", 10);
  const hour = Number.parseInt(match[4] ?? "", 10);
  const minute = Number.parseInt(match[5] ?? "", 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    year < 2000 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  const offsetMinutes = TIMEZONE_OFFSETS_MINUTES[timezone];
  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60_000;
  const parsed = new Date(utcMs);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatUtcDateToLocalInput({
  value,
  timezone,
}: {
  value: Date | null;
  timezone: SupportedScrapeTimezone;
}) {
  if (!value) {
    return "";
  }

  const offsetMinutes = TIMEZONE_OFFSETS_MINUTES[timezone];
  const shifted = new Date(value.getTime() + offsetMinutes * 60_000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  const hour = String(shifted.getUTCHours()).padStart(2, "0");
  const minute = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

async function saveJobsScrapeScheduleAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const enabled = formData
    .getAll("autoScrapeEnabled")
    .some((entry) => parseBoolean(entry, false));
  const intervalHoursRaw = formData.get("intervalHours");
  const lookbackDaysRaw = formData.get("lookbackDays");
  const startTimeRaw = formData.get("startTime");
  const timezoneRaw = formData.get("timezone");

  const settings = resolveJobsScrapeScheduleSettings({
    enabled,
    intervalHours: intervalHoursRaw,
    startTime: startTimeRaw,
    timezone: timezoneRaw,
  });
  const lookbackDays = parseLookbackDays(lookbackDaysRaw);

  const updates: Array<{ key: string; value: unknown }> = [
    {
      key: JOBS_SCRAPE_ENABLED_SETTING_KEY,
      value: settings.enabled,
    },
    {
      key: JOBS_SCRAPE_INTERVAL_HOURS_SETTING_KEY,
      value: settings.intervalHours,
    },
    {
      key: JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
      value: lookbackDays,
    },
    {
      key: JOBS_SCRAPE_START_TIME_SETTING_KEY,
      value: settings.startTime,
    },
    {
      key: JOBS_SCRAPE_TIMEZONE_SETTING_KEY,
      value: settings.timezone,
    },
  ];

  for (const update of updates) {
    await persistAppSettingWithRetry({
      key: update.key,
      value: update.value,
    });
  }

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_schedule.save",
  });
}

async function saveJobsRunnerModeAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const requestedMode = formData.get("runnerMode");
  if (requestedMode !== "project" && requestedMode !== "chatgpt") {
    throw new Error("Choose a valid jobs runner.");
  }

  await persistAppSettingWithRetry({
    key: JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY,
    value: requestedMode,
  });

  const activeRun = await getJobsScrapeProgressSnapshot().catch(() => null);
  if (activeRun?.state === "running") {
    await requestJobsScrapeCancel();
  }

  invalidateAdminMutation({
    paths: [{ path: "/admin/jobs" }],
    source: "jobs.runner_mode.save",
    tags: [appSettingCacheTagForKey(JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY)],
  });
}

async function saveOneTimeJobsScrapeAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const oneTimeAtLocal = formData.get("oneTimeAtLocal")?.toString().trim() ?? "";
  const timezone = resolveScrapeTimezone(formData.get("timezone"));
  const oneTimeAtIso = parseDateTimeLocalToUtcIso({
    value: oneTimeAtLocal,
    timezone,
  });
  if (!oneTimeAtIso) {
    throw new Error("Please choose a valid one-time date and time.");
  }

  const oneTimeAt = new Date(oneTimeAtIso);
  if (Number.isNaN(oneTimeAt.getTime())) {
    throw new Error("Invalid one-time schedule date.");
  }

  await persistAppSettingWithRetry({
    key: JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
    value: oneTimeAt.toISOString(),
  });

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_one_time.save",
  });
}

async function clearOneTimeJobsScrapeAction() {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  await deleteAppSettingWithRetry(JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY);
  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_one_time.clear",
  });
}

async function saveJobsPdfExtractionSettingsAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const settings = resolveJobsPdfExtractionSettings({
    mode: formData.get("pdfExtractionMode"),
    modelId: formData.get("pdfExtractionModelId"),
  });

  await persistAppSettingWithRetry({
    key: JOBS_SCRAPE_PDF_EXTRACTION_MODE_SETTING_KEY,
    value: settings.mode,
  });
  await persistAppSettingWithRetry({
    key: JOBS_SCRAPE_PDF_EXTRACTION_MODEL_ID_SETTING_KEY,
    value: normalizeJobsPdfExtractionModelId(
      formData.get("pdfExtractionModelId")
    ),
  });

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.pdf_extraction_settings.save",
  });
}

async function addScrapeSourceAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const url = formData.get("url")?.toString().trim() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const typeRaw = formData.get("type")?.toString().trim() ?? "";
  const type: ManagedJobSourceType =
    typeRaw === "linkedin" || typeRaw === "generic" || typeRaw === "auto"
      ? typeRaw
      : "auto";
  const locationScope = normalizeLocationScope(
    formData.get("locationScope")?.toString().trim()
  );
  const enabled = formData
    .getAll("enabled")
    .some((entry) => parseBoolean(entry, false));

  await addManagedJobSource({
    name,
    url,
    type,
    locationScope,
    enabled,
  });

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_source.add",
  });
}

async function toggleScrapeSourceAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const sourceId = formData.get("sourceId")?.toString().trim() ?? "";
  const nextEnabled = formData
    .getAll("nextEnabled")
    .some((entry) => parseBoolean(entry, false));
  await setManagedJobSourceEnabled({
    id: sourceId,
    enabled: nextEnabled,
  });

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_source.toggle",
  });
}

async function setScrapeSourceLocationScopeAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const sourceId = formData.get("sourceId")?.toString().trim() ?? "";
  const nextLocationScope = normalizeLocationScope(
    formData.get("nextLocationScope")?.toString().trim()
  );
  await setManagedJobSourceLocationScope({
    id: sourceId,
    locationScope: nextLocationScope,
  });

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_source.location_scope",
  });
}

async function deleteScrapeSourceAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const sourceId = formData.get("sourceId")?.toString().trim() ?? "";
  await deleteManagedJobSource(sourceId);

  revalidateJobsAdminMutation({
    includeScrapeSettings: true,
    source: "jobs.scrape_source.delete",
  });
}

async function createManualJobAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const title = formData.get("title")?.toString().trim() ?? "";
  const company = formData.get("company")?.toString().trim() ?? "";
  const location = formData.get("location")?.toString().trim() ?? "";
  const description = formData.get("description")?.toString().trim() ?? "";
  const sourceUrlInput = formData.get("sourceUrl")?.toString().trim() ?? "";
  const status = normalizeJobStatus(formData.get("status")?.toString().trim() ?? "");

  if (!title) {
    throw new Error("Title is required.");
  }
  if (!company) {
    throw new Error("Company is required.");
  }
  if (!location) {
    throw new Error("Location is required.");
  }

  const sourceUrl = sourceUrlInput || `manual://job/${crypto.randomUUID()}`;
  const result = await saveJobs([
    {
      title,
      company,
      location,
      description,
      status,
      source_url: sourceUrl,
    },
  ]);

  if (result.insertedCount === 0) {
    throw new Error("Job was not added. Source URL already exists.");
  }

  revalidateJobsAdminMutation({ source: "jobs.manual.create" });
}

async function deleteManualJobAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const id = formData.get("id")?.toString().trim() ?? "";
  if (!id) {
    throw new Error("Job id is required.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("jobs").delete().eq("id", id);
  if (error) {
    throw new Error(`Failed to delete job: ${error.message}`);
  }
  try {
    await archiveJobPostingFromRag({ jobId: id });
  } catch (syncError) {
    console.warn("[admin/jobs] failed to archive deleted job from RAG", {
      id,
      error:
        syncError instanceof Error ? syncError.message : String(syncError),
    });
  }

  revalidateJobsAdminMutation({ source: "jobs.manual.delete" });
}

async function updateJobStatusAction(formData: FormData) {
  "use server";

  if (!(await getActiveAdminSession())) {
    redirect("/");
  }

  const id = formData.get("id")?.toString().trim() ?? "";
  const nextStatus = normalizeJobStatus(
    formData.get("nextStatus")?.toString().trim() ?? ""
  );
  if (!id) {
    throw new Error("Job id is required.");
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("jobs")
    .update({ status: nextStatus })
    .eq("id", id);
  if (error) {
    throw new Error(`Failed to update status: ${error.message}`);
  }
  try {
    await syncJobPostingsToRag({
      jobIds: [id],
    });
  } catch (syncError) {
    console.warn("[admin/jobs] failed to sync job status to RAG", {
      id,
      nextStatus,
      error:
        syncError instanceof Error ? syncError.message : String(syncError),
    });
  }

  revalidateJobsAdminMutation({ source: "jobs.manual.status" });
}

async function withTimeoutState<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
): Promise<AdminQueryState<T>> {
  try {
    return {
      data: await withTimeout(promise, timeoutMs, () => {
        console.error(`[admin/jobs] ${label} query timed out.`, {
          timeoutMs,
        });
      }),
      unavailable: false,
    };
  } catch (error) {
    console.error(`[admin/jobs] ${label} query failed.`, error);
    return {
      data: fallback,
      unavailable: true,
    };
  }
}

async function withTimeoutFallback<T>(
  label: string,
  promise: Promise<T>,
  fallback: T,
  timeoutMs = JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
) {
  const result = await withTimeoutState(label, promise, fallback, timeoutMs);
  return result.data;
}

function parsePage(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export default async function AdminJobsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPageSession();
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedPage = parsePage(resolvedSearchParams?.page);
  const jobsOffset = (requestedPage - 1) * ADMIN_JOBS_PAGE_SIZE;

  const scrapeProgressPromise = withTimeoutFallback(
    "jobs.scrape-progress",
    getJobsScrapeProgressSnapshot(),
    null,
    JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
  );
  const jobsPageRowsPromise = withTimeoutState(
    "jobs.rows",
    listJobPostingEntries({
      includeInactive: true,
      includeRagState: false,
      limit: ADMIN_JOBS_PAGE_SIZE,
      offset: jobsOffset,
    }),
    [],
    JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
  );
  const totalJobsPromise = withTimeoutState(
    "jobs.count",
    getJobPostingCount({ includeInactive: true }),
    0,
    JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
  );
  const managedSourcesPromise = withTimeoutState(
    "jobs.managed-sources",
    listManagedJobSources({ uncached: true }),
    [],
    JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
  );
  const jobSettingsPromise = withTimeoutState(
    "jobs.settings",
    getAppSettingsByKeysUncached([...JOBS_SCRAPE_SETTINGS_KEYS]),
    [],
    JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
  );
  const scrapeHistoryPromise = withTimeoutFallback<
    Awaited<ReturnType<typeof getJobsScrapeHistory>> | null
  >(
    "jobs.scrape-history",
    getJobsScrapeHistory({ limit: 50 }),
    null,
    JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
  );

  const [jobsPageRowsResult, totalJobsResult, jobSettingsResult] =
    await Promise.all([
      jobsPageRowsPromise,
      totalJobsPromise,
      jobSettingsPromise,
    ]);

  const totalJobs = totalJobsResult.data;
  const totalJobsUnavailable = totalJobsResult.unavailable;
  const totalJobPages = totalJobsUnavailable
    ? requestedPage
    : Math.max(1, Math.ceil(totalJobs / ADMIN_JOBS_PAGE_SIZE));
  const jobsPage = totalJobsUnavailable
    ? requestedPage
    : Math.min(requestedPage, totalJobPages);
  let jobsRowsUnavailable = jobsPageRowsResult.unavailable;
  let jobs =
    jobsPage === requestedPage
      ? jobsPageRowsResult.data
      : [];
  if (jobsPage !== requestedPage) {
    const correctedRowsResult = await withTimeoutState(
      "jobs.corrected-page-rows",
      listJobPostingEntries({
        includeInactive: true,
        includeRagState: false,
        limit: ADMIN_JOBS_PAGE_SIZE,
        offset: (jobsPage - 1) * ADMIN_JOBS_PAGE_SIZE,
      }),
      [],
      JOBS_ADMIN_PAGE_LOAD_TIMEOUT_MS
    );
    jobsRowsUnavailable = correctedRowsResult.unavailable;
    jobs = correctedRowsResult.data;
  }
  const jobSettings = jobSettingsResult.data;
  const jobSettingsUnavailable = jobSettingsResult.unavailable;
  const jobSettingsByKey = new Map(jobSettings.map((setting) => [setting.key, setting.value]));
  const enabledRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.enabled) ?? null;
  const intervalHoursRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.intervalHours) ?? null;
  const lookbackDaysRaw = jobSettingsByKey.get(JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY) ?? null;
  const startTimeRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.startTime) ?? null;
  const timezoneRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.timezone) ?? null;
  const oneTimeAtRaw = jobSettingsByKey.get(JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY) ?? null;
  const pdfExtractionModeRaw =
    jobSettingsByKey.get(JOBS_SCRAPE_PDF_EXTRACTION_MODE_SETTING_KEY) ?? null;
  const pdfExtractionModelIdRaw =
    jobSettingsByKey.get(JOBS_SCRAPE_PDF_EXTRACTION_MODEL_ID_SETTING_KEY) ?? null;
  const lastSuccessAtRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.lastSuccessAt) ?? null;
  const lockUntilRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.lockUntil) ?? null;
  const lastRunStatusRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.lastRunStatus) ?? null;
  const lastSkipReasonRaw = jobSettingsByKey.get(JOBS_SCRAPE_SETTING_KEYS.lastSkipReason) ?? null;
  const lastRunSummaryRaw = jobSettingsByKey.get(JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY) ?? null;
  const runnerMode = parseJobsScrapeRunnerMode(
    jobSettingsByKey.get(JOBS_SCRAPE_RUNNER_MODE_SETTING_KEY)
  );

  const scheduleSettings = resolveJobsScrapeScheduleSettings({
    enabled: enabledRaw,
    intervalHours: intervalHoursRaw,
    startTime: startTimeRaw,
    timezone: timezoneRaw,
  });
  const lookbackDays = parseLookbackDays(lookbackDaysRaw);
  const timezone = resolveScrapeTimezone(scheduleSettings.timezone);
  const pdfExtractionSettings = resolveJobsPdfExtractionSettings({
    mode: pdfExtractionModeRaw,
    modelId: pdfExtractionModelIdRaw,
  });
  const oneTimeAt = parseDateOrNull(oneTimeAtRaw);
  const oneTimeAtLocalDefault = formatUtcDateToLocalInput({
    value: oneTimeAt,
    timezone,
  });

  const scheduleState = resolveJobsScrapeScheduleState({
    lastSuccessAt: lastSuccessAtRaw,
    lockUntil: lockUntilRaw,
    lastRunStatus: lastRunStatusRaw,
    lastSkipReason: lastSkipReasonRaw,
  });
  const now = new Date();
  const nextScheduleDueAt = getNextJobsScrapeDueAt({
    settings: scheduleSettings,
    lastSuccessAt: scheduleState.lastSuccessAt,
    now,
  });
  const nextDueAt = resolveEarlierDate(nextScheduleDueAt, oneTimeAt);
  const oneTimeDueNow =
    oneTimeAt !== null && oneTimeAt.getTime() <= now.getTime();
  const lastRunSummary = normalizeSummary(lastRunSummaryRaw);
  const insertedLastRun =
    typeof lastRunSummary?.inserted === "number"
      ? lastRunSummary.inserted
      : typeof lastRunSummary?.inserted === "number"
        ? (lastRunSummary.inserted as number)
        : null;
  const updatedLastRun =
    typeof lastRunSummary?.updated === "number"
      ? lastRunSummary.updated
      : typeof lastRunSummary?.updated === "number"
        ? (lastRunSummary.updated as number)
        : null;
  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        description="Job listings, sources, scraping schedule and ingestion history."
        navHref="/admin/jobs"
        title="Jobs"
      />

      <JobsOverview
        lastSuccessAt={scheduleState.lastSuccessAt}
        nextDueAt={nextDueAt}
        runnerMode={runnerMode}
        scheduleSettings={scheduleSettings}
        settingsUnavailable={jobSettingsUnavailable}
        totalJobs={totalJobs}
        totalJobsUnavailable={totalJobsUnavailable}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <JobsImportPanel>
          <Suspense fallback={<div className="h-10 animate-pulse rounded-lg bg-muted/50" />}>
            <JobsScrapeControlSection
              runnerMode={runnerMode}
              scrapeProgressPromise={scrapeProgressPromise}
              unavailable={jobSettingsUnavailable}
            />
          </Suspense>
        </JobsImportPanel>
        <AdminJobsRunnerModeControl
          action={saveJobsRunnerModeAction}
          mode={runnerMode}
          unavailable={jobSettingsUnavailable}
        />
      </div>

      <JobsListPanel
        deleteAction={deleteManualJobAction}
        jobs={jobs}
        jobsUnavailable={jobsRowsUnavailable}
        page={jobsPage}
        pageSize={ADMIN_JOBS_PAGE_SIZE}
        searchParams={resolvedSearchParams}
        statusAction={updateJobStatusAction}
        timezone={scheduleSettings.timezone}
        totalJobs={totalJobs}
        totalJobsUnavailable={totalJobsUnavailable}
      />

      <Suspense fallback={<JobsPanelFallback rows={6} title="Scraping history" />}>
        <JobsScrapeHistorySection
          nextDueAt={nextDueAt}
          runnerMode={runnerMode}
          scheduleSettings={scheduleSettings}
          scrapeHistoryPromise={scrapeHistoryPromise}
        />
      </Suspense>

      <Suspense fallback={<JobsPanelFallback rows={6} title="Source management" />}>
        <JobsSourceManagementSection
          managedSourcesPromise={managedSourcesPromise}
          scheduleTimezone={scheduleSettings.timezone}
        />
      </Suspense>

      {runnerMode === "project" ? (
        <JobsScheduleSettingsCard
          clearOneTimeAction={clearOneTimeJobsScrapeAction}
          insertedLastRun={insertedLastRun}
          lookbackDays={lookbackDays}
          maxLookbackDays={MAX_JOBS_SCRAPE_LOOKBACK_DAYS}
          minLookbackDays={MIN_JOBS_SCRAPE_LOOKBACK_DAYS}
          nextDueAt={nextDueAt}
          oneTimeAt={oneTimeAt}
          oneTimeAtLocalDefault={oneTimeAtLocalDefault}
          oneTimeDueNow={oneTimeDueNow}
          saveOneTimeAction={saveOneTimeJobsScrapeAction}
          saveScheduleAction={saveJobsScrapeScheduleAction}
          scheduleSettings={scheduleSettings}
          scheduleState={scheduleState}
          settingsUnavailable={jobSettingsUnavailable}
          updatedLastRun={updatedLastRun}
        />
      ) : null}

      {runnerMode === "project" ? (
        <JobsPdfSettingsCard
          pdfExtractionSettings={pdfExtractionSettings}
          saveAction={saveJobsPdfExtractionSettingsAction}
          settingsUnavailable={jobSettingsUnavailable}
        />
      ) : null}

      <JobsManualEntryCard createAction={createManualJobAction} />
    </div>
  );
}

async function JobsScrapeControlSection({
  scrapeProgressPromise,
  runnerMode,
  unavailable,
}: {
  scrapeProgressPromise: Promise<
    Awaited<ReturnType<typeof getJobsScrapeProgressSnapshot>> | null
  >;
  runnerMode: JobsScrapeRunnerMode;
  unavailable: boolean;
}) {
  const scrapeProgress = await scrapeProgressPromise;
  return (
    <AdminJobsScrapeControl
      initialProgress={scrapeProgress}
      runnerMode={runnerMode}
      unavailable={unavailable}
    />
  );
}

async function JobsScrapeHistorySection({
  nextDueAt,
  runnerMode,
  scheduleSettings,
  scrapeHistoryPromise,
}: {
  nextDueAt: Date | null;
  runnerMode: JobsScrapeRunnerMode;
  scheduleSettings: ReturnType<typeof resolveJobsScrapeScheduleSettings>;
  scrapeHistoryPromise: Promise<
    Awaited<ReturnType<typeof getJobsScrapeHistory>> | null
  >;
}) {
  const scrapeHistory = await scrapeHistoryPromise;
  return (
    <JobsHistoryPanel
      entries={scrapeHistory}
      nextDueAt={nextDueAt}
      runnerMode={runnerMode}
      scheduleSettings={scheduleSettings}
    />
  );
}

async function JobsSourceManagementSection({
  managedSourcesPromise,
  scheduleTimezone,
}: {
  managedSourcesPromise: Promise<
    AdminQueryState<Awaited<ReturnType<typeof listManagedJobSources>>>
  >;
  scheduleTimezone: string;
}) {
  const managedSourcesResult = await managedSourcesPromise;
  return (
    <JobsSourcesPanel
      addAction={addScrapeSourceAction}
      deleteAction={deleteScrapeSourceAction}
      scopeAction={setScrapeSourceLocationScopeAction}
      sources={managedSourcesResult.data}
      timezone={scheduleTimezone}
      toggleAction={toggleScrapeSourceAction}
      unavailable={managedSourcesResult.unavailable}
    />
  );
}
