import { STUDY_MODE_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  type FeatureAccessMode,
  type FeatureAccessRole,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";

const STUDY_MODE_FEATURE_ACCESS_TIMEOUT_MS = 2_000;

function coerceBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return fallback;
    }
    return ["true", "1", "yes", "enabled", "on"].includes(normalized);
  }
  return fallback;
}

export const STUDY_MODE_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";

export function parseStudyModeAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, STUDY_MODE_ACCESS_MODE_FALLBACK);
}

export function parseStudyModeEnabledSetting(value: unknown): boolean {
  return coerceBoolean(value, false);
}

export async function isStudyModeEnabledForRole(role: FeatureAccessRole) {
  const featureAccessSettings = await loadFeatureAccessSettingsByKeys(
    [STUDY_MODE_FEATURE_FLAG_KEY],
    {
      source: "study.config.feature-access",
      timeoutMs: STUDY_MODE_FEATURE_ACCESS_TIMEOUT_MS,
    }
  );
  const rawValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
    STUDY_MODE_FEATURE_FLAG_KEY
  );
  if (rawValue === undefined && featureAccessSettings.status === "unavailable") {
    return true;
  }
  const mode = parseStudyModeAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}

export async function isStudyModeEnabled() {
  return isStudyModeEnabledForRole(null);
}
