import { JOBS_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  type FeatureAccessMode,
  type FeatureAccessRole,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";

export const JOBS_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";

export function parseJobsAccessModeSetting(value: unknown): FeatureAccessMode {
  return parseFeatureAccessMode(value, JOBS_ACCESS_MODE_FALLBACK);
}

export async function isJobsEnabledForRole(role: FeatureAccessRole) {
  const rawValue = await getAppSetting<string | boolean | number>(
    JOBS_FEATURE_FLAG_KEY
  );
  const mode = parseJobsAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}

export async function isJobsEnabled() {
  return isJobsEnabledForRole(null);
}
