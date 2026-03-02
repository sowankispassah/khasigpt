import { STUDY_MODE_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
  type FeatureAccessMode,
  type FeatureAccessRole,
} from "@/lib/feature-access";

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
  const rawValue = await getAppSetting<string | boolean | number>(
    STUDY_MODE_FEATURE_FLAG_KEY
  );
  const mode = parseStudyModeAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}

export async function isStudyModeEnabled() {
  return isStudyModeEnabledForRole(null);
}
