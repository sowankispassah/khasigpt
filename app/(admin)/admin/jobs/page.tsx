import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { AdminJobsScrapeControl } from "@/components/admin-jobs-scrape-control";
import { JobsAutoScrapeStatus } from "@/components/jobs-auto-scrape-status";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  JOBS_SCRAPE_ENABLED_SETTING_KEY,
  JOBS_SCRAPE_INTERVAL_HOURS_SETTING_KEY,
  JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
  JOBS_SCRAPE_SOURCES_SETTING_KEY,
  JOBS_SCRAPE_START_TIME_SETTING_KEY,
  JOBS_SCRAPE_TIMEZONE_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  deleteAppSetting,
  getAppSetting,
  getAppSettingUncached,
  setAppSetting,
} from "@/lib/db/queries";
import { listJobPostingEntries } from "@/lib/jobs/service";
import { saveJobs } from "@/lib/jobs/saveJobs";
import {
  getJobsScrapeHistory,
  getJobsScrapeProgressSnapshot,
  type JobsScrapeHistoryEntry,
} from "@/lib/jobs/scrape-orchestrator";
import {
  JOBS_SCRAPE_SETTING_KEYS,
  getNextJobsScrapeDueAt,
  parseDateOrNull,
  parseBoolean,
  resolveJobsScrapeScheduleSettings,
  resolveJobsScrapeScheduleState,
} from "@/lib/jobs/schedule";
import {
  addManagedJobSource,
  deleteManagedJobSource,
  listManagedJobSources,
  type ManagedJobSourceLocationScope,
  type ManagedJobSourceType,
  setManagedJobSourceLocationScope,
  setManagedJobSourceEnabled,
} from "@/lib/jobs/source-registry";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";

const JOBS_SCRAPE_SETTINGS_KEYS = [
  JOBS_SCRAPE_ENABLED_SETTING_KEY,
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
  JOBS_SCRAPE_SOURCES_SETTING_KEY,
];

const DEFAULT_JOBS_SCRAPE_LOOKBACK_DAYS = 10;
const MIN_JOBS_SCRAPE_LOOKBACK_DAYS = 1;
const MAX_JOBS_SCRAPE_LOOKBACK_DAYS = 365;
const JOBS_ADMIN_ACTION_TIMEOUT_MS = 20_000;
const JOBS_ADMIN_ACTION_VERIFY_TIMEOUT_MS = 6_000;
const JOBS_ADMIN_ACTION_RETRY_ATTEMPTS = 2;
const TIMEZONE_OFFSETS_MINUTES = {
  UTC: 0,
  "Asia/Kolkata": 330,
} as const;

type SupportedScrapeTimezone = keyof typeof TIMEZONE_OFFSETS_MINUTES;

function revalidateJobsScrapeSettingCaches() {
  for (const key of JOBS_SCRAPE_SETTINGS_KEYS) {
    revalidateTag(appSettingCacheTagForKey(key));
  }
}

function normalizeSummary(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function formatDescription(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "No description captured for this listing.";
  }
  return normalized.length > 260 ? `${normalized.slice(0, 260)}...` : normalized;
}

function formatMaybeDateTime(value: Date | null, timezone: string) {
  if (!value) {
    return "Not available";
  }
  return value.toLocaleString("en-IN", {
    timeZone: timezone,
  });
}

function formatIsoDateTime(value: string, timezone: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Not available";
  }
  return parsed.toLocaleString("en-IN", {
    timeZone: timezone,
  });
}

function formatDurationMs(value: number) {
  if (!(Number.isFinite(value) && value >= 0)) {
    return "0s";
  }
  const totalSeconds = Math.floor(value / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

function getHistoryStatusBadgeClasses(status: JobsScrapeHistoryEntry["status"]) {
  if (status === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (status === "failed") {
    return "border-red-300 bg-red-50 text-red-700";
  }
  if (status === "cancelled") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
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

function getJobPdfCacheState(job: { pdfCachedUrl: string | null; pdfSourceUrl: string | null }) {
  if (job.pdfCachedUrl) {
    return "cached";
  }
  if (job.pdfSourceUrl) {
    return "external";
  }
  return "none";
}

function normalizeLocationScope(
  value: string | null | undefined
): ManagedJobSourceLocationScope {
  return value === "all_locations" ? "all_locations" : "meghalaya_only";
}

function formatLocationScope(value: ManagedJobSourceLocationScope) {
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

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function saveOneTimeJobsScrapeAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function clearOneTimeJobsScrapeAction() {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  await deleteAppSettingWithRetry(JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY);
  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function addScrapeSourceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function toggleScrapeSourceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function setScrapeSourceLocationScopeAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function deleteScrapeSourceAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const sourceId = formData.get("sourceId")?.toString().trim() ?? "";
  await deleteManagedJobSource(sourceId);

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function createManualJobAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidatePath("/admin/jobs");
}

async function deleteManualJobAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidatePath("/admin/jobs");
}

async function updateJobStatusAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
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

  revalidatePath("/admin/jobs");
}

export default async function AdminJobsPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const [
    jobs,
    managedSources,
    enabledRaw,
    intervalHoursRaw,
    lookbackDaysRaw,
    startTimeRaw,
    timezoneRaw,
    oneTimeAtRaw,
    lastSuccessAtRaw,
    lockUntilRaw,
    lastRunStatusRaw,
    lastSkipReasonRaw,
    lastRunSummaryRaw,
    scrapeProgress,
    scrapeHistory,
  ] = await Promise.all([
    listJobPostingEntries({ includeInactive: true }),
    listManagedJobSources(),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.enabled),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.intervalHours),
    getAppSetting<unknown>(JOBS_SCRAPE_LOOKBACK_DAYS_SETTING_KEY),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.startTime),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.timezone),
    getAppSetting<unknown>(JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.lastSuccessAt),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.lockUntil),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.lastRunStatus),
    getAppSetting<unknown>(JOBS_SCRAPE_SETTING_KEYS.lastSkipReason),
    getAppSetting<unknown>(JOBS_SCRAPE_LAST_RUN_SUMMARY_SETTING_KEY),
    getJobsScrapeProgressSnapshot(),
    getJobsScrapeHistory({ limit: 50 }),
  ]);

  const scheduleSettings = resolveJobsScrapeScheduleSettings({
    enabled: enabledRaw,
    intervalHours: intervalHoursRaw,
    startTime: startTimeRaw,
    timezone: timezoneRaw,
  });
  const lookbackDays = parseLookbackDays(lookbackDaysRaw);
  const timezone = resolveScrapeTimezone(scheduleSettings.timezone);
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
      : typeof lastRunSummary?.["inserted"] === "number"
        ? (lastRunSummary["inserted"] as number)
        : null;
  const updatedLastRun =
    typeof lastRunSummary?.updated === "number"
      ? lastRunSummary.updated
      : typeof lastRunSummary?.["updated"] === "number"
        ? (lastRunSummary["updated"] as number)
        : null;
  const enabledSourcesCount = managedSources.filter((source) => source.enabled).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Automated Jobs Ingestion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground text-sm">
          <p>
            Jobs are scraped automatically in the background and inserted into Supabase.
          </p>
          <p>
            Each source can use Meghalaya-only or all-locations scraping scope.
          </p>
          <p>
            Configure source sites in the Source Management section below.
          </p>
          <div className="mt-2">
            <AdminJobsScrapeControl initialProgress={scrapeProgress} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Auto Scrape Schedule</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <form action={saveJobsScrapeScheduleAction} className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 md:col-span-2">
              <input
                defaultChecked={scheduleSettings.enabled}
                name="autoScrapeEnabled"
                type="checkbox"
                value="true"
              />
              Enable automatic scraping
            </label>
            <label className="flex flex-col gap-1">
              Interval (hours)
              <input
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={scheduleSettings.intervalHours}
                max={168}
                min={1}
                name="intervalHours"
                required
                type="number"
              />
            </label>
            <label className="flex flex-col gap-1">
              Lookback days
              <input
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={lookbackDays}
                max={MAX_JOBS_SCRAPE_LOOKBACK_DAYS}
                min={MIN_JOBS_SCRAPE_LOOKBACK_DAYS}
                name="lookbackDays"
                required
                type="number"
              />
            </label>
            <label className="flex flex-col gap-1">
              Preferred start time
              <input
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={scheduleSettings.startTime}
                name="startTime"
                required
                step={60}
                type="time"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              Timezone
              <select
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={scheduleSettings.timezone}
                name="timezone"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                pendingLabel="Saving..."
                refreshOnSuccess
                successMessage="Auto-scrape schedule saved."
              >
                Save Schedule
              </ActionSubmitButton>
            </div>
          </form>

          <form action={saveOneTimeJobsScrapeAction} className="grid gap-3 md:grid-cols-2">
            <input name="timezone" type="hidden" value={scheduleSettings.timezone} />
            <label className="flex flex-col gap-1 md:col-span-2">
              One-time scrape date and time ({scheduleSettings.timezone})
              <input
                className="rounded-md border bg-background px-3 py-2"
                defaultValue={oneTimeAtLocalDefault}
                name="oneTimeAtLocal"
                required
                type="datetime-local"
              />
            </label>
            <p className="text-muted-foreground text-xs md:col-span-2">
              One-time schedules run once on or after the selected time when the
              scheduled background trigger runs. If you pick a past time, it will
              run on the next scheduled trigger.
            </p>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                pendingLabel="Saving..."
                refreshOnSuccess
                successMessage="One-time scrape scheduled."
                variant="outline"
              >
                Save One-Time Schedule
              </ActionSubmitButton>
            </div>
          </form>
          {oneTimeAt ? (
            <form action={clearOneTimeJobsScrapeAction}>
              <ActionSubmitButton
                className="cursor-pointer"
                pendingLabel="Clearing..."
                refreshOnSuccess
                successMessage="One-time schedule cleared."
                variant="destructive"
              >
                Clear One-Time Schedule
              </ActionSubmitButton>
            </form>
          ) : null}

          <div className="rounded-md border p-3 text-muted-foreground text-sm">
            <p>
              Status:{" "}
              <span className="font-medium text-foreground">
                {scheduleState.lastRunStatus ?? "not_started"}
              </span>
            </p>
            <p>
              Last success:{" "}
              <span className="font-medium text-foreground">
                {formatMaybeDateTime(scheduleState.lastSuccessAt, scheduleSettings.timezone)}
              </span>
            </p>
            <p>
              Next due:{" "}
              <span className="font-medium text-foreground">
                {formatMaybeDateTime(nextDueAt, scheduleSettings.timezone)}
              </span>
            </p>
            <p>
              Active lock until:{" "}
              <span className="font-medium text-foreground">
                {formatMaybeDateTime(scheduleState.lockUntil, scheduleSettings.timezone)}
              </span>
            </p>
            <p>
              Lookback window:{" "}
              <span className="font-medium text-foreground">{lookbackDays} days</span>
            </p>
            <p>
              One-time run at:{" "}
              <span className="font-medium text-foreground">
                {formatMaybeDateTime(oneTimeAt, scheduleSettings.timezone)}
              </span>
            </p>
            {oneTimeDueNow ? (
              <p>
                One-time status:{" "}
                <span className="font-medium text-foreground">
                  due now (will run on next auto trigger)
                </span>
              </p>
            ) : null}
            {scheduleState.lastSkipReason ? (
              <p>
                Last skip reason:{" "}
                <span className="font-medium text-foreground">
                  {scheduleState.lastSkipReason}
                </span>
              </p>
            ) : null}
            {insertedLastRun !== null ? (
              <p>
                Last inserted count:{" "}
                <span className="font-medium text-foreground">{insertedLastRun}</span>
              </p>
            ) : null}
            {updatedLastRun !== null ? (
              <p>
                Last updated count:{" "}
                <span className="font-medium text-foreground">{updatedLastRun}</span>
              </p>
            ) : null}
            <div className="mt-2 border-t pt-2">
              <JobsAutoScrapeStatus />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Scraping History</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Latest 50 scrape runs across auto schedule and manual runs.
          </p>
          {scrapeHistory.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No scrape history yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-max border-collapse whitespace-nowrap text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Run Time</th>
                    <th className="px-3 py-2 text-left font-medium">Trigger</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Progress</th>
                    <th className="px-3 py-2 text-left font-medium">Sources</th>
                    <th className="px-3 py-2 text-left font-medium">Duration</th>
                    <th className="px-3 py-2 text-left font-medium">Result</th>
                    <th className="px-3 py-2 text-left font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {scrapeHistory.map((entry) => {
                    const progressBarColor =
                      entry.status === "success"
                        ? "bg-emerald-500"
                        : entry.status === "failed"
                          ? "bg-red-500"
                          : entry.status === "cancelled"
                            ? "bg-amber-500"
                            : "bg-slate-500";
                    return (
                      <tr className="border-t align-top" key={entry.runId}>
                        <td className="px-3 py-3 text-xs">
                          {formatIsoDateTime(entry.startedAt, scheduleSettings.timezone)}
                        </td>
                        <td className="px-3 py-3 text-xs">{entry.trigger}</td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full border px-2 py-0.5 text-xs ${getHistoryStatusBadgeClasses(
                              entry.status
                            )}`}
                          >
                            {entry.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="w-36">
                            <div className="h-2 w-full overflow-hidden rounded bg-muted">
                              <div
                                className={`h-full ${progressBarColor}`}
                                style={{ width: `${entry.completionPercent}%` }}
                              />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {entry.completionPercent}%
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {entry.processedSources}/{entry.totalSources}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {formatDurationMs(entry.durationMs)}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          <div>Inserted: {entry.inserted}</div>
                          <div>Updated: {entry.updated}</div>
                          <div>Duplicates: {entry.skippedDuplicates}</div>
                        </td>
                        <td className="max-w-xs px-3 py-3 whitespace-normal text-xs text-muted-foreground">
                          {entry.errorMessage ??
                            entry.skipReason ??
                            (entry.status === "success"
                              ? "Completed successfully."
                              : "No additional details.")}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Source Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Managed sources: {managedSources.length} total / {enabledSourcesCount} enabled.
            {enabledSourcesCount === 0
              ? " No enabled source is configured, so fallback sources from config/jobSources.ts will be used."
              : " Enabled sources are used for all manual and automatic scrape runs."}
          </p>
          <p className="text-muted-foreground text-xs">
            Use <strong>Auto</strong> for most sites. The scraper will try generic extraction
            patterns. You can choose per-source location scope below.
          </p>

          <form action={addScrapeSourceAction} className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 md:col-span-2">
              Source URL
              <input
                className="rounded-md border bg-background px-3 py-2"
                name="url"
                placeholder="https://in.linkedin.com/jobs/search/?keywords=Shillong&location=Meghalaya"
                required
                type="url"
              />
            </label>
            <label className="flex flex-col gap-1">
              Display name (optional)
              <input
                className="rounded-md border bg-background px-3 py-2"
                name="name"
                placeholder="LinkedIn Meghalaya Shillong"
              />
            </label>
            <label className="flex flex-col gap-1">
              Source type
              <select
                className="rounded-md border bg-background px-3 py-2"
                defaultValue="auto"
                name="type"
              >
                <option value="auto">Auto (recommended)</option>
                <option value="generic">Generic website</option>
                <option value="linkedin">LinkedIn</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              Location scope
              <select
                className="rounded-md border bg-background px-3 py-2"
                defaultValue="meghalaya_only"
                name="locationScope"
              >
                <option value="meghalaya_only">Meghalaya-only</option>
                <option value="all_locations">All locations</option>
              </select>
            </label>
            <label className="flex items-center gap-2 md:col-span-2">
              <input defaultChecked name="enabled" type="checkbox" value="true" />
              Enable this source immediately
            </label>
            <div className="md:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                pendingLabel="Saving source..."
                refreshOnSuccess
                successMessage="Source saved."
              >
                Add Source
              </ActionSubmitButton>
            </div>
          </form>

          {managedSources.length === 0 ? (
            <p className="text-muted-foreground">
              No managed sources added yet. Add at least one source URL above.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-max border-collapse whitespace-nowrap text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      Source
                    </th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      Type
                    </th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      Scope
                    </th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      Status
                    </th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      URL
                    </th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      Updated
                    </th>
                    <th className="px-3 py-2 text-left font-medium whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {managedSources.map((source) => (
                    <tr className="border-t" key={source.id}>
                      <td className="px-3 py-3 align-top">
                        <span className="font-medium">{source.name}</span>
                      </td>
                      <td className="px-3 py-3 align-top text-xs">{source.type}</td>
                      <td className="px-3 py-3 align-top text-xs">
                        {formatLocationScope(source.locationScope)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className="rounded-full border px-2 py-0.5 text-xs">
                          {source.enabled ? "enabled" : "disabled"}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <a
                          className="text-primary text-xs underline"
                          href={source.url}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {source.url}
                        </a>
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {formatIsoDateTime(source.updatedAt, scheduleSettings.timezone)}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <form action={toggleScrapeSourceAction}>
                            <input name="sourceId" type="hidden" value={source.id} />
                            <input
                              name="nextEnabled"
                              type="hidden"
                              value={source.enabled ? "false" : "true"}
                            />
                            <ActionSubmitButton
                              className="h-7 cursor-pointer px-2 text-xs"
                              pendingLabel="Updating..."
                              successMessage="Source updated."
                              variant="outline"
                            >
                              {source.enabled ? "Disable" : "Enable"}
                            </ActionSubmitButton>
                          </form>
                          <form action={setScrapeSourceLocationScopeAction}>
                            <input name="sourceId" type="hidden" value={source.id} />
                            <input
                              name="nextLocationScope"
                              type="hidden"
                              value={
                                source.locationScope === "meghalaya_only"
                                  ? "all_locations"
                                  : "meghalaya_only"
                              }
                            />
                            <ActionSubmitButton
                              className="h-7 cursor-pointer px-2 text-xs"
                              pendingLabel="Updating..."
                              successMessage="Source scope updated."
                              variant="outline"
                            >
                              {source.locationScope === "meghalaya_only"
                                ? "All locations"
                                : "Meghalaya-only"}
                            </ActionSubmitButton>
                          </form>
                          <form action={deleteScrapeSourceAction}>
                            <input name="sourceId" type="hidden" value={source.id} />
                            <ActionSubmitButton
                              className="h-7 cursor-pointer px-2 text-xs"
                              pendingLabel="Removing..."
                              successMessage="Source removed."
                              variant="destructive"
                            >
                              Remove
                            </ActionSubmitButton>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manual Job Entry</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            You can add jobs manually. These entries are stored in the same Supabase jobs table.
          </p>
          <form action={createManualJobAction} className="grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              Title
              <input
                className="rounded-md border bg-background px-3 py-2"
                name="title"
                placeholder="Software Engineer"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              Company
              <input
                className="rounded-md border bg-background px-3 py-2"
                name="company"
                placeholder="Acme Pvt Ltd"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              Location
              <input
                className="rounded-md border bg-background px-3 py-2"
                name="location"
                placeholder="Shillong, Meghalaya"
                required
              />
            </label>
            <label className="flex flex-col gap-1">
              Source URL (optional)
              <input
                className="rounded-md border bg-background px-3 py-2"
                name="sourceUrl"
                placeholder="https://example.com/job-post"
                type="url"
              />
            </label>
            <label className="flex flex-col gap-1 md:col-span-2">
              Description
              <textarea
                className="min-h-28 rounded-md border bg-background px-3 py-2"
                name="description"
                placeholder="Job description..."
              />
            </label>
            <label className="flex flex-col gap-1">
              Status
              <select
                className="rounded-md border bg-background px-3 py-2"
                defaultValue="active"
                name="status"
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </label>
            <div className="md:col-span-2">
              <ActionSubmitButton
                className="cursor-pointer"
                pendingLabel="Adding..."
                refreshOnSuccess
                successMessage="Manual job added."
              >
                Add Job Manually
              </ActionSubmitButton>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest Jobs ({jobs.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {jobs.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No jobs are available in the Supabase jobs table yet.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="min-w-max border-collapse whitespace-nowrap text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Title</th>
                    <th className="px-3 py-2 text-left font-medium">Company</th>
                    <th className="px-3 py-2 text-left font-medium">Location</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">PDF Cache</th>
                    <th className="px-3 py-2 text-left font-medium">Added</th>
                    <th className="px-3 py-2 text-left font-medium">Description</th>
                    <th className="px-3 py-2 text-left font-medium">Links</th>
                    <th className="px-3 py-2 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => {
                    const pdfCacheState = getJobPdfCacheState(job);
                    return (
                      <tr className="border-t align-top" key={job.id}>
                        <td className="px-3 py-3">
                          <span className="font-medium">{job.title}</span>
                        </td>
                        <td className="px-3 py-3">{job.company}</td>
                        <td className="px-3 py-3">{job.location}</td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border px-2 py-0.5 text-xs">
                            {job.status}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full border px-2 py-0.5 text-xs">
                            {pdfCacheState}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {job.createdAt.toLocaleString()}
                        </td>
                        <td className="max-w-sm px-3 py-3 whitespace-normal text-xs text-muted-foreground">
                          {formatDescription(job.content)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-1 text-xs">
                            {job.sourceUrl ? (
                              <a
                                className="text-primary underline"
                                href={job.sourceUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Source
                              </a>
                            ) : null}
                            {job.pdfCachedUrl ? (
                              <a
                                className="text-primary underline"
                                href={job.pdfCachedUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Cached PDF
                              </a>
                            ) : null}
                            {!job.pdfCachedUrl && job.pdfSourceUrl ? (
                              <a
                                className="text-primary underline"
                                href={job.pdfSourceUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                Source PDF
                              </a>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-2">
                            <form action={updateJobStatusAction}>
                              <input name="id" type="hidden" value={job.id} />
                              <input
                                name="nextStatus"
                                type="hidden"
                                value={job.status === "active" ? "inactive" : "active"}
                              />
                              <ActionSubmitButton
                                className="h-7 cursor-pointer px-2 text-xs"
                                pendingLabel="Updating..."
                                successMessage="Job status updated."
                                variant="outline"
                              >
                                {job.status === "active" ? "Set inactive" : "Set active"}
                              </ActionSubmitButton>
                            </form>
                            <form action={deleteManualJobAction}>
                              <input name="id" type="hidden" value={job.id} />
                              <ActionSubmitButton
                                className="h-7 cursor-pointer px-2 text-xs"
                                pendingLabel="Deleting..."
                                successMessage="Job deleted."
                                variant="destructive"
                              >
                                Delete Job
                              </ActionSubmitButton>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
