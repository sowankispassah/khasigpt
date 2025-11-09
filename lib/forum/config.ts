import { getAppSetting } from "@/lib/db/queries";
import { FORUM_FEATURE_FLAG_KEY } from "@/lib/constants";

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

export async function isForumEnabled() {
  const rawValue = await getAppSetting<string | boolean | number>(
    FORUM_FEATURE_FLAG_KEY
  );
  return parseForumEnabledSetting(rawValue);
}
