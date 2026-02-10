import { FORUM_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
  type FeatureAccessMode,
  type FeatureAccessRole,
} from "@/lib/feature-access";

function coerceBoolean(value: unknown, fallback = true): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized.length === 0) {
      return fallback;
    }
    return ["true", "1", "yes", "enabled"].includes(normalized);
  }
  return fallback;
}

export function parseForumEnabledSetting(value: unknown): boolean {
  return coerceBoolean(value, true);
}

export const FORUM_ACCESS_MODE_FALLBACK: FeatureAccessMode = "enabled";

export function parseForumAccessModeSetting(value: unknown): FeatureAccessMode {
  return parseFeatureAccessMode(value, FORUM_ACCESS_MODE_FALLBACK);
}

export async function isForumEnabledForRole(role: FeatureAccessRole) {
  const rawValue = await getAppSetting<string | boolean | number>(
    FORUM_FEATURE_FLAG_KEY
  );
  const mode = parseForumAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}

export async function isForumEnabled() {
  return isForumEnabledForRole(null);
}
