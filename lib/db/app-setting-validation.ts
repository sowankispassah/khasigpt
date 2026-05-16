import { TRANSLATE_PROVIDER_MODE_SETTING_KEY } from "@/lib/constants";

export const APP_SETTING_MAX_VALUE_BYTES = 1_048_576;

function unwrapStringValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  let current = value.trim();
  for (let index = 0; index < 4; index += 1) {
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

  if (normalizedKey === TRANSLATE_PROVIDER_MODE_SETTING_KEY) {
    const unwrapped = unwrapStringValue(value);
    const normalized =
      typeof unwrapped === "string" ? unwrapped.trim().toLowerCase() : "";

    if (normalized !== "ai" && normalized !== "google") {
      throw new Error("invalid_translate_provider_mode_setting");
    }

    return normalized as T;
  }

  const byteLength = getJsonByteLength(value);
  if (byteLength > APP_SETTING_MAX_VALUE_BYTES) {
    throw new Error(
      `app_setting_value_too_large:${normalizedKey}:${byteLength}`
    );
  }

  return value;
}
