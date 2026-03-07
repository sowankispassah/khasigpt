const NOT_SPECIFIED_LABEL = "Not specified";
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const DATE_PATTERN =
  "(?:\\d{1,2}[./-]\\d{1,2}[./-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?(?:\\s+of)?\\s+[A-Za-z]{3,9},?\\s+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{2,4})";

const RELATIVE_DATE_PATTERN =
  /\b(?:(\d{1,2})\s+(minute|hour|day|week|month|year)s?\s+ago|yesterday|today|just now)\b/i;

const NOTIFICATION_DATE_LABELS = [
  "notification date",
  "date of notification",
  "advertisement date",
  "date of publication",
  "published on",
  "date of issue",
  "issue date",
  "dated",
] as const;

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return normalizeWhitespace(
    value
      .replace(/\r\n/g, "\n")
      .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")
      .replace(/[*_`#>|~]/g, " ")
  );
}

function normalizeExtractedDate(value: string) {
  return normalizeWhitespace(value.replace(/\b(\d{1,2})(st|nd|rd|th)\b/gi, "$1$2"));
}

function formatDateLabel(value: Date) {
  return value.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function extractDateByLabels(text: string, labels: readonly string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const expression = new RegExp(`${escaped}[^\\n\\r]{0,120}?(${DATE_PATTERN})`, "i");
    const match = text.match(expression);
    if (match?.[1]) {
      return normalizeExtractedDate(match[1]);
    }
  }

  return null;
}

function extractDatedDate(text: string) {
  const match = text.match(new RegExp(`\\bdated\\b[^\\d\\n\\r]{0,40}?(${DATE_PATTERN})`, "i"));
  if (!match?.[1]) {
    return null;
  }

  return normalizeExtractedDate(match[1]);
}

function extractRelativeDateLabel(text: string, referenceDate: Date | null) {
  if (!referenceDate) {
    return null;
  }

  const match = text.match(RELATIVE_DATE_PATTERN);
  if (!match) {
    return null;
  }

  const normalized = match[0].trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  let targetDate = referenceDate;
  if (normalized.includes("just now") || normalized.includes("today")) {
    targetDate = referenceDate;
  } else if (normalized.includes("yesterday")) {
    targetDate = new Date(referenceDate.getTime() - DAY_IN_MS);
  } else {
    const amount = Number.parseInt(match[1] ?? "", 10);
    const unit = match[2]?.toLowerCase() ?? "";
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }

    const unitMs =
      unit === "minute"
        ? 60 * 1000
        : unit === "hour"
          ? 60 * 60 * 1000
          : unit === "day"
            ? DAY_IN_MS
            : unit === "week"
              ? 7 * DAY_IN_MS
              : unit === "month"
                ? 30 * DAY_IN_MS
                : 365 * DAY_IN_MS;
    targetDate = new Date(referenceDate.getTime() - amount * unitMs);
  }

  return formatDateLabel(targetDate);
}

export function resolveJobNotificationDateLabel({
  content,
  pdfContent,
  referenceDate,
}: {
  content?: string | null;
  pdfContent?: string | null;
  referenceDate?: Date | null;
}) {
  for (const candidate of [pdfContent, content]) {
    const normalized = normalizeSearchText(candidate);
    if (!normalized) {
      continue;
    }

    const labelled = extractDateByLabels(normalized, NOTIFICATION_DATE_LABELS);
    if (labelled) {
      return labelled;
    }

    const dated = extractDatedDate(normalized);
    if (dated) {
      return dated;
    }

    const relative = extractRelativeDateLabel(normalized, referenceDate ?? null);
    if (relative) {
      return relative;
    }
  }

  return NOT_SPECIFIED_LABEL;
}
