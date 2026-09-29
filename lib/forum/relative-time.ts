const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30.4375 * DAY;
const YEAR = 365.25 * DAY;

export function formatForumRelativeTime(
  value: string | null | undefined,
  locale: string,
  fallback: string,
  now = Date.now()
) {
  if (!value) return fallback;

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return fallback;

  const difference = timestamp - now;
  const distance = Math.abs(difference);
  const [unit, duration]: [Intl.RelativeTimeFormatUnit, number] =
    distance < MINUTE ? ["second", SECOND]
      : distance < HOUR ? ["minute", MINUTE]
        : distance < DAY ? ["hour", HOUR]
          : distance < WEEK ? ["day", DAY]
            : distance < MONTH ? ["week", WEEK]
              : distance < YEAR ? ["month", MONTH]
                : ["year", YEAR];

  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
    Math.round(difference / duration),
    unit
  );
}
