import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ActionSubmitButton } from "@/components/action-submit-button";
import { JobsAutoScrapeTrigger } from "@/components/jobs-auto-scrape-trigger";
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
  setAppSetting,
} from "@/lib/db/queries";
import { listJobPostingEntries } from "@/lib/jobs/service";
import { saveJobs } from "@/lib/jobs/saveJobs";
import {
  JOBS_SCRAPE_SETTING_KEYS,
  getNextJobsScrapeDueAt,
  parseDateOrNull,
  parseBoolean,
  resolveJobsScrapeScheduleSettings,
  resolveJobsScrapeScheduleState,
} from "@/lib/jobs/schedule";
import { runJobsScrapeWithScheduling } from "@/lib/jobs/scrape-orchestrator";
import {
  addManagedJobSource,
  deleteManagedJobSource,
  listManagedJobSources,
  type ManagedJobSourceType,
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
const JOBS_ADMIN_ACTION_TIMEOUT_MS = 12_000;
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

function resolveEarlierDate(first: Date | null, second: Date | null) {
  if (first && second) {
    return first.getTime() <= second.getTime() ? first : second;
  }
  return first ?? second;
}

function normalizeJobStatus(value: string | null | undefined): "active" | "inactive" {
  return value === "inactive" ? "inactive" : "active";
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
    await withTimeout(
      setAppSetting({
        key: update.key,
        value: update.value,
      }),
      JOBS_ADMIN_ACTION_TIMEOUT_MS
    );
  }

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function runManualJobsScrapeAction() {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  const result = await runJobsScrapeWithScheduling({
    trigger: "manual",
  });
  if (!result.ok) {
    throw new Error(result.errorMessage ?? "Manual scrape failed.");
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

  await withTimeout(
    setAppSetting({
      key: JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY,
      value: oneTimeAt.toISOString(),
    }),
    JOBS_ADMIN_ACTION_TIMEOUT_MS
  );

  revalidateJobsScrapeSettingCaches();
  revalidatePath("/admin/jobs");
}

async function clearOneTimeJobsScrapeAction() {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "admin") {
    redirect("/");
  }

  await withTimeout(
    deleteAppSetting(JOBS_SCRAPE_ONE_TIME_AT_SETTING_KEY),
    JOBS_ADMIN_ACTION_TIMEOUT_MS
  );
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
  const enabled = formData
    .getAll("enabled")
    .some((entry) => parseBoolean(entry, false));

  await addManagedJobSource({
    name,
    url,
    type,
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
  const enabledSourcesCount = managedSources.filter((source) => source.enabled).length;

  return (
    <div className="flex flex-col gap-6">
      <JobsAutoScrapeTrigger />
      <Card>
        <CardHeader>
          <CardTitle>Automated Jobs Ingestion</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-muted-foreground text-sm">
          <p>
            Jobs are scraped automatically in the background and inserted into Supabase.
          </p>
          <p>
            Meghalaya-only filtering is always enforced by the scraper.
          </p>
          <p>
            Configure source sites in the Source Management section below.
          </p>
          <form action={runManualJobsScrapeAction}>
            <ActionSubmitButton
              className="mt-2 cursor-pointer"
              pendingLabel="Scraping..."
              refreshOnSuccess
              successMessage="Job scrape completed."
            >
              Run Scrape Now
            </ActionSubmitButton>
          </form>
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
          </div>
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
            patterns and still enforce Meghalaya-location and lookback-days filtering.
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

          <div className="space-y-3">
            {managedSources.length === 0 ? (
              <p className="text-muted-foreground">
                No managed sources added yet. Add at least one source URL above.
              </p>
            ) : (
              managedSources.map((source) => (
                <div className="rounded-md border p-3" key={source.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{source.name}</span>
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {source.type}
                    </span>
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      {source.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  <a
                    className="mt-2 inline-block text-primary text-xs underline"
                    href={source.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {source.url}
                  </a>
                  <p className="mt-1 text-muted-foreground text-xs">
                    Updated {formatIsoDateTime(source.updatedAt, scheduleSettings.timezone)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={toggleScrapeSourceAction}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <input
                        name="nextEnabled"
                        type="hidden"
                        value={source.enabled ? "false" : "true"}
                      />
                      <ActionSubmitButton
                        className="cursor-pointer"
                        pendingLabel="Updating..."
                        successMessage="Source updated."
                        variant="outline"
                      >
                        {source.enabled ? "Disable Source" : "Enable Source"}
                      </ActionSubmitButton>
                    </form>
                    <form action={deleteScrapeSourceAction}>
                      <input name="sourceId" type="hidden" value={source.id} />
                      <ActionSubmitButton
                        className="cursor-pointer"
                        pendingLabel="Removing..."
                        successMessage="Source removed."
                        variant="destructive"
                      >
                        Remove Source
                      </ActionSubmitButton>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
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
          <div className="flex flex-col gap-4">
            {jobs.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No jobs are available in the Supabase jobs table yet.
              </p>
            ) : (
              jobs.map((job) => (
                <div className="rounded-lg border p-4" key={job.id}>
                  <div className="font-medium text-sm">{job.title}</div>
                  <div className="mt-1 text-muted-foreground text-xs">
                    {job.company} / {job.location}
                  </div>
                  <div className="mt-1">
                    <span className="rounded-full border px-2 py-0.5 text-xs">
                      status: {job.status}
                    </span>
                  </div>
                  <div className="mt-1 text-muted-foreground text-xs">
                    Added {job.createdAt.toLocaleString()}
                  </div>
                  <p className="mt-2 text-sm">{formatDescription(job.content)}</p>
                  {job.sourceUrl ? (
                    <a
                      className="mt-2 inline-block text-primary text-sm underline"
                      href={job.sourceUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open source listing
                    </a>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={updateJobStatusAction}>
                      <input name="id" type="hidden" value={job.id} />
                      <input
                        name="nextStatus"
                        type="hidden"
                        value={job.status === "active" ? "inactive" : "active"}
                      />
                      <ActionSubmitButton
                        className="cursor-pointer"
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
                        className="cursor-pointer"
                        pendingLabel="Deleting..."
                        successMessage="Job deleted."
                        variant="destructive"
                      >
                        Delete Job
                      </ActionSubmitButton>
                    </form>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
