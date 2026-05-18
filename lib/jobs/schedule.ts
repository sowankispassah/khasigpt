import {
  JOBS_SCRAPE_ENABLED_SETTING_KEY,
  JOBS_SCRAPE_INTERVAL_HOURS_SETTING_KEY,
  JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
  JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  JOBS_SCRAPE_START_TIME_SETTING_KEY,
  JOBS_SCRAPE_TIMEZONE_SETTING_KEY,
} from "@/lib/constants";

export const DEFAULT_JOBS_SCRAPE_ENABLED = true;
export const DEFAULT_JOBS_SCRAPE_INTERVAL_HOURS = 6;
export const DEFAULT_JOBS_SCRAPE_START_TIME = "06:00";
export const DEFAULT_JOBS_SCRAPE_TIMEZONE = "Asia/Kolkata";
export const MIN_JOBS_SCRAPE_INTERVAL_HOURS = 1;
export const MAX_JOBS_SCRAPE_INTERVAL_HOURS = 168;
export const JOBS_SCRAPE_LOCK_MINUTES = 20;

const TIMEZONE_OFFSETS_MINUTES = {
  UTC: 0,
  "Asia/Kolkata": 330,
} as const;

type SupportedTimezone = keyof typeof TIMEZONE_OFFSETS_MINUTES;

export type JobsScrapeRunStatus = "success" | "failed" | "skipped";
export type JobsScrapeTrigger = "auto" | "manual";
export type JobsScrapeSkipReason =
  | "disabled"
  | "locked"
  | "not_due"
  | "waiting_for_start_time";

export type JobsScrapeScheduleSettings = {
  enabled: boolean;
  intervalHours: number;
  startTime: string;
  timezone: SupportedTimezone;
};

export type JobsScrapeScheduleState = {
  lastSuccessAt: Date | null;
  lockUntil: Date | null;
  lastRunStatus: JobsScrapeRunStatus | null;
  lastSkipReason: string | null;
};

export type JobsScrapeScheduleDecision = {
  shouldRun: boolean;
  skipped: boolean;
  skipReason: JobsScrapeSkipReason | null;
  nextDueAt: Date | null;
};

export const JOBS_SCRAPE_SETTING_KEYS = {
  enabled: JOBS_SCRAPE_ENABLED_SETTING_KEY,
  intervalHours: JOBS_SCRAPE_INTERVAL_HOURS_SETTING_KEY,
  startTime: JOBS_SCRAPE_START_TIME_SETTING_KEY,
  timezone: JOBS_SCRAPE_TIMEZONE_SETTING_KEY,
  lastSuccessAt: JOBS_SCRAPE_LAST_SUCCESS_AT_SETTING_KEY,
  lockUntil: JOBS_SCRAPE_LOCK_UNTIL_SETTING_KEY,
  lastRunStatus: JOBS_SCRAPE_LAST_RUN_STATUS_SETTING_KEY,
  lastSkipReason: JOBS_SCRAPE_LAST_SKIP_REASON_SETTING_KEY,
} as const;

export function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  if (typeof value === "number") {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  return fallback;
}

function parseIntervalHours(rawValue: unknown) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return Math.max(
      MIN_JOBS_SCRAPE_INTERVAL_HOURS,
      Math.min(MAX_JOBS_SCRAPE_INTERVAL_HOURS, Math.trunc(rawValue))
    );
  }
  if (typeof rawValue === "string") {
    const parsed = Number.parseInt(rawValue.trim(), 10);
    if (Number.isFinite(parsed)) {
      return Math.max(
        MIN_JOBS_SCRAPE_INTERVAL_HOURS,
        Math.min(MAX_JOBS_SCRAPE_INTERVAL_HOURS, Math.trunc(parsed))
      );
    }
  }
  return DEFAULT_JOBS_SCRAPE_INTERVAL_HOURS;
}

function parseTime(rawValue: unknown) {
  const value =
    typeof rawValue === "string" ? rawValue.trim() : DEFAULT_JOBS_SCRAPE_START_TIME;
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return DEFAULT_JOBS_SCRAPE_START_TIME;
  }

  const hour = Number.parseInt(match[1] ?? "", 10);
  const minute = Number.parseInt(match[2] ?? "", 10);
  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return DEFAULT_JOBS_SCRAPE_START_TIME;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function parseTimezone(rawValue: unknown): SupportedTimezone {
  if (rawValue === "UTC" || rawValue === "Asia/Kolkata") {
    return rawValue;
  }
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim();
    if (normalized === "UTC" || normalized === "Asia/Kolkata") {
      return normalized;
    }
  }
  return DEFAULT_JOBS_SCRAPE_TIMEZONE;
}

export function parseDateOrNull(rawValue: unknown) {
  if (rawValue instanceof Date) {
    return Number.isNaN(rawValue.getTime()) ? null : rawValue;
  }

  if (typeof rawValue === "string" && rawValue.trim().length > 0) {
    const parsed = new Date(rawValue);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

export function parseRunStatus(rawValue: unknown): JobsScrapeRunStatus | null {
  if (rawValue === "success" || rawValue === "failed" || rawValue === "skipped") {
    return rawValue;
  }
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim().toLowerCase();
    if (normalized === "success" || normalized === "failed" || normalized === "skipped") {
      return normalized;
    }
  }
  return null;
}

function parseTimeToMinutes(time: string) {
  const [hoursPart, minutesPart] = time.split(":");
  const hours = Number.parseInt(hoursPart ?? "", 10);
  const minutes = Number.parseInt(minutesPart ?? "", 10);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return 0;
  }
  return hours * 60 + minutes;
}

function getTimezoneOffsetMinutes(timezone: SupportedTimezone) {
  return TIMEZONE_OFFSETS_MINUTES[timezone];
}

function toTimezoneClock(nowUtc: Date, timezone: SupportedTimezone) {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const shifted = new Date(nowUtc.getTime() + offsetMinutes * 60_000);

  return {
    offsetMinutes,
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function fromTimezoneClockToUtc({
  year,
  month,
  day,
  hour,
  minute,
  second,
  timezone,
}: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second?: number;
  timezone: SupportedTimezone;
}) {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const utcMillis =
    Date.UTC(year, month - 1, day, hour, minute, second ?? 0, 0) -
    offsetMinutes * 60_000;
  return new Date(utcMillis);
}

export function resolveJobsScrapeScheduleSettings({
  enabled,
  intervalHours,
  startTime,
  timezone,
}: {
  enabled: unknown;
  intervalHours: unknown;
  startTime: unknown;
  timezone: unknown;
}): JobsScrapeScheduleSettings {
  return {
    enabled: parseBoolean(enabled, DEFAULT_JOBS_SCRAPE_ENABLED),
    intervalHours: parseIntervalHours(intervalHours),
    startTime: parseTime(startTime),
    timezone: parseTimezone(timezone),
  };
}

export function resolveJobsScrapeScheduleState({
  lastSuccessAt,
  lockUntil,
  lastRunStatus,
  lastSkipReason,
}: {
  lastSuccessAt: unknown;
  lockUntil: unknown;
  lastRunStatus: unknown;
  lastSkipReason: unknown;
}): JobsScrapeScheduleState {
  return {
    lastSuccessAt: parseDateOrNull(lastSuccessAt),
    lockUntil: parseDateOrNull(lockUntil),
    lastRunStatus: parseRunStatus(lastRunStatus),
    lastSkipReason:
      typeof lastSkipReason === "string" && lastSkipReason.trim().length > 0
        ? lastSkipReason.trim()
        : null,
  };
}

function resolveFirstRunCandidateUtc({
  nowUtc,
  settings,
}: {
  nowUtc: Date;
  settings: JobsScrapeScheduleSettings;
}) {
  const clock = toTimezoneClock(nowUtc, settings.timezone);
  const startMinutes = parseTimeToMinutes(settings.startTime);
  const nowMinutes = clock.hour * 60 + clock.minute;

  if (nowMinutes >= startMinutes) {
    return nowUtc;
  }

  const startHour = Math.floor(startMinutes / 60);
  const startMinute = startMinutes % 60;
  return fromTimezoneClockToUtc({
    year: clock.year,
    month: clock.month,
    day: clock.day,
    hour: startHour,
    minute: startMinute,
    timezone: settings.timezone,
  });
}

export function getNextJobsScrapeDueAt({
  settings,
  lastSuccessAt,
  now = new Date(),
}: {
  settings: JobsScrapeScheduleSettings;
  lastSuccessAt: Date | null;
  now?: Date;
}) {
  if (!settings.enabled) {
    return null;
  }

  if (!lastSuccessAt) {
    return resolveFirstRunCandidateUtc({
      nowUtc: now,
      settings,
    });
  }

  return new Date(lastSuccessAt.getTime() + settings.intervalHours * 60 * 60 * 1000);
}

export function evaluateJobsScrapeSchedule({
  trigger,
  settings,
  state,
  now = new Date(),
}: {
  trigger: JobsScrapeTrigger;
  settings: JobsScrapeScheduleSettings;
  state: JobsScrapeScheduleState;
  now?: Date;
}): JobsScrapeScheduleDecision {
  if (state.lockUntil && now < state.lockUntil) {
    return {
      shouldRun: false,
      skipped: true,
      skipReason: "locked",
      nextDueAt: state.lockUntil,
    };
  }

  if (trigger === "manual") {
    return {
      shouldRun: true,
      skipped: false,
      skipReason: null,
      nextDueAt: now,
    };
  }

  if (!settings.enabled) {
    return {
      shouldRun: false,
      skipped: true,
      skipReason: "disabled",
      nextDueAt: null,
    };
  }

  const nextDueAt = getNextJobsScrapeDueAt({
    settings,
    lastSuccessAt: state.lastSuccessAt,
    now,
  });

  if (nextDueAt && now < nextDueAt) {
    return {
      shouldRun: false,
      skipped: true,
      skipReason: state.lastSuccessAt ? "not_due" : "waiting_for_start_time",
      nextDueAt,
    };
  }

  return {
    shouldRun: true,
    skipped: false,
    skipReason: null,
    nextDueAt,
  };
}

export function createScrapeLockUntil(now = new Date()) {
  return new Date(now.getTime() + JOBS_SCRAPE_LOCK_MINUTES * 60 * 1000);
}
