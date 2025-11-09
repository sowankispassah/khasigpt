const BLOCKED_TAG_REGEX =
  /<\s*(script|style|iframe|object|embed|svg)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi;
const EVENT_HANDLER_ATTR_REGEX = /\s+on\w+="[^"]*"/gi;
const MULTI_DASH_REGEX = /-{2,}/g;
const LEADING_TRAILING_DASH_REGEX = /^-+|-+$/g;
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]+/gi;
const MARKUP_BREAK_REGEX = /\n{3,}/g;

export function sanitizeForumContent(value: string) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(BLOCKED_TAG_REGEX, "")
    .replace(EVENT_HANDLER_ATTR_REGEX, "")
    .replace(/javascript:/gi, "")
    .replace(/\r\n?/g, "\n")
    .replace(MARKUP_BREAK_REGEX, "\n\n")
    .trim();
}

export function getForumSlugBase(input: string) {
  const fallback = "discussion";
  if (typeof input !== "string") {
    return fallback;
  }

  const normalized = input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NON_ALPHANUMERIC_REGEX, "-")
    .replace(MULTI_DASH_REGEX, "-")
    .replace(LEADING_TRAILING_DASH_REGEX, "")
    .slice(0, 64);

  return normalized.length > 0 ? normalized : fallback;
}

export function buildForumExcerpt(content: string, maxLength = 280) {
  if (!content) {
    return "";
  }
  const safeContent = sanitizeForumContent(content).replace(/\s+/g, " ");
  if (safeContent.length <= maxLength) {
    return safeContent;
  }
  return `${safeContent.slice(0, maxLength).replace(/\s+\S*$/, "").trim()}…`;
}

export function formatForumUserName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string | null | undefined
) {
  const fullName = [firstName?.trim(), lastName?.trim()]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fullName.length > 0) {
    return fullName;
  }

  return email ?? "Community member";
}
