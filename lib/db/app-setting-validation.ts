import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { parseFeatureAccessModeStrict } from "@/lib/feature-access";

export const APP_SETTING_MAX_VALUE_BYTES = 1_048_576;

const FEATURE_ACCESS_SETTING_KEYS = new Set([
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY,
  VOICE_CHAT_LEGACY_FEATURE_FLAG_KEY,
  VOICE_CHAT_WEB_FEATURE_FLAG_KEY,
]);

const BOOLEAN_SETTING_KEYS = new Set([
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
]);

function unwrapStringValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  let current = value.trim();
  for (let index = 0; index < 32; index += 1) {
    if (!current.startsWith('"')) {
      break;
    }
    try {
      const parsed = JSON.parse(current);
      if (typeof parsed !== "string") {
        return parsed;
      }
      current = parsed.trim();
    } catch {
      break;
    }
  }
  return current;
}

function getJsonByteLength(value: unknown) {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

export function normalizeAppSettingValueForWrite<T>(key: string, value: T): T {
  const normalizedKey = key.trim();

  if (BOOLEAN_SETTING_KEYS.has(normalizedKey)) {
    const unwrapped = unwrapStringValue(value);
    if (typeof unwrapped === "boolean") {
      return unwrapped as T;
    }
    if (typeof unwrapped === "number") {
      return (unwrapped !== 0) as T;
    }
    if (typeof unwrapped === "string") {
      const normalized = unwrapped.trim().toLowerCase();
      if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
        return true as T;
      }
      if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
        return false as T;
      }
    }
    throw new Error(`invalid_boolean_app_setting:${normalizedKey}`);
  }

  if (normalizedKey === TRANSLATE_PROVIDER_MODE_SETTING_KEY) {
    const unwrapped = unwrapStringValue(value);
    const normalized =
      typeof unwrapped === "string" ? unwrapped.trim().toLowerCase() : "";

    if (normalized !== "ai" && normalized !== "google") {
      throw new Error("invalid_translate_provider_mode_setting");
    }

    return normalized as T;
  }

  if (FEATURE_ACCESS_SETTING_KEYS.has(normalizedKey)) {
    const normalizedMode = parseFeatureAccessModeStrict(value);
    if (!normalizedMode) {
      throw new Error("invalid_feature_access_setting");
    }
    return normalizedMode as T;
  }

  const byteLength = getJsonByteLength(value);
  if (byteLength > APP_SETTING_MAX_VALUE_BYTES) {
    throw new Error(
      `app_setting_value_too_large:${normalizedKey}:${byteLength}`
    );
  }

  return value;
}
