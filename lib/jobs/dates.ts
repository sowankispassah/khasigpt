const NOT_SPECIFIED_LABEL = "Not specified";

const DATE_PATTERN =
  "(?:\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}|\\d{1,2}(?:st|nd|rd|th)?\\s+[A-Za-z]{3,9},?\\s+\\d{2,4}|[A-Za-z]{3,9}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{2,4})";

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

export function resolveJobNotificationDateLabel({
  content,
  pdfContent,
}: {
  content?: string | null;
  pdfContent?: string | null;
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
  }

  return NOT_SPECIFIED_LABEL;
}
