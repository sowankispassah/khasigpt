type TimestampedMessage = {
  id: string;
  createdAt?: string;
  metadata?: { createdAt?: string };
};

export function parseMessageDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarDay(date: Date, timeZone?: string) {
  if (!timeZone) return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"));
}

/** Group the complete loaded history before slicing or virtualizing it. Missing
 * timestamps never borrow the time at which a conversation was opened. */
export function getMessageDateSeparators(
  messages: readonly TimestampedMessage[],
  timeZone?: string
) {
  const separators = new Map<string, Date>();
  let previousDay: number | undefined;
  for (const message of messages) {
    const date = parseMessageDate(message.metadata?.createdAt ?? message.createdAt);
    if (!date) continue;
    const day = calendarDay(date, timeZone);
    if (day !== previousDay) separators.set(message.id, date);
    previousDay = day;
  }
  return separators;
}

export function formatMessageDateSeparator(
  date: Date,
  now: Date,
  timeZone?: string
) {
  const day = calendarDay(date, timeZone);
  const today = calendarDay(now, timeZone);
  const kind = day === today ? "today" : day === today - 86_400_000 ? "yesterday" : "date";
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
  const calendarDate = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return { kind, time, calendarDate };
}

/** Schedule by local midnight rather than a fixed 24-hour interval (DST). */
export function millisecondsUntilLocalMidnight(now: Date) {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(1, midnight.getTime() - now.getTime());
}
