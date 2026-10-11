export const DEFAULT_ADMIN_ENTRY_PATH = "/admin-entry";

const MAX_ADMIN_ENTRY_PATH_LENGTH = 96;
const RESERVED_PATHS = new Set([
  "/",
  "/api",
  "/coming-soon",
  "/maintenance",
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/password-reset",
  "/verify-email",
  "/complete-profile",
  "/impersonate",
]);

function normalizePathSlashes(value: string) {
  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  const collapsed = withLeadingSlash.replace(/\/{2,}/g, "/");
  if (collapsed.length > 1 && collapsed.endsWith("/")) {
    return collapsed.slice(0, -1);
  }
  return collapsed;
}

function parseAdminEntryPath(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = normalizePathSlashes(trimmed);
  if (
    normalized.length > MAX_ADMIN_ENTRY_PATH_LENGTH ||
    !/^\/[A-Za-z0-9/_-]+$/.test(normalized)
  ) {
    return null;
  }

  if (RESERVED_PATHS.has(normalized)) {
    return null;
  }

  if (
    normalized.startsWith("/api/") ||
    normalized.startsWith("/_next/") ||
    normalized.startsWith("/invite/")
  ) {
    return null;
  }

  return normalized;
}

export function normalizeAdminEntryPathSetting(value: unknown) {
  return parseAdminEntryPath(value) ?? DEFAULT_ADMIN_ENTRY_PATH;
}

export function sanitizeAdminEntryPathInput(value: unknown) {
  return parseAdminEntryPath(value);
}
