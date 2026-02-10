import type { UserRole } from "@/lib/db/schema";

export type FeatureAccessMode = "disabled" | "admin_only" | "enabled";

export type FeatureAccessRole = UserRole | null | undefined;

const ENABLED_VALUES = new Set([
  "1",
  "true",
  "yes",
  "on",
  "enabled",
  "enable",
  "all",
  "public",
]);

const DISABLED_VALUES = new Set([
  "0",
  "false",
  "no",
  "off",
  "disabled",
  "disable",
  "none",
]);

const ADMIN_ONLY_VALUES = new Set([
  "admin_only",
  "adminonly",
  "admin",
  "admins_only",
  "admins",
]);

function parseFeatureAccessModePrimitive(
  value: unknown
): FeatureAccessMode | null {
  if (typeof value === "boolean") {
    return value ? "enabled" : "disabled";
  }

  if (typeof value === "number") {
    return value === 0 ? "disabled" : "enabled";
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const compact = normalized.replace(/[\s-]+/g, "_");
  const compactNoUnderscore = compact.replaceAll("_", "");

  if (ENABLED_VALUES.has(compact)) {
    return "enabled";
  }
  if (DISABLED_VALUES.has(compact)) {
    return "disabled";
  }
  if (
    ADMIN_ONLY_VALUES.has(compact) ||
    ADMIN_ONLY_VALUES.has(compactNoUnderscore)
  ) {
    return "admin_only";
  }

  if (compact === "enabled_for_all") {
    return "enabled";
  }
  if (compact === "disabled_for_all") {
    return "disabled";
  }

  return null;
}

export function parseFeatureAccessMode(
  value: unknown,
  fallback: FeatureAccessMode
): FeatureAccessMode {
  const directMode = parseFeatureAccessModePrimitive(value);
  if (directMode) {
    return directMode;
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;

    const candidateKeys = ["accessMode", "mode", "value", "state"];
    for (const key of candidateKeys) {
      const mode = parseFeatureAccessModePrimitive(record[key]);
      if (mode) {
        return mode;
      }
    }

    const adminOnlyFlag =
      record.adminOnly ?? record.admin_only ?? record.adminOnlyAccess;
    if (adminOnlyFlag === true) {
      return "admin_only";
    }

    const enabledFlag =
      record.enabled ?? record.isEnabled ?? record.is_enabled ?? record.active;
    if (typeof enabledFlag === "boolean") {
      return enabledFlag ? "enabled" : "disabled";
    }
  }

  return fallback;
}

export function isFeatureEnabledForRole(
  mode: FeatureAccessMode,
  role: FeatureAccessRole
): boolean {
  if (mode === "disabled") {
    return false;
  }

  if (mode === "enabled") {
    return true;
  }

  return role === "admin";
}
