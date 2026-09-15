import { JOBS_FEATURE_FLAG_KEY } from "@/lib/constants";
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
import { loadUserFeatureAccessOverride } from "@/lib/settings/user-feature-access";

export const JOBS_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";
const JOBS_ACCESS_READ_TIMEOUT_MS = 3000;

export type JobsAccessResult = {
  degraded: boolean;
  enabled: boolean;
  mode: FeatureAccessMode;
};

export function parseJobsAccessModeSetting(value: unknown): FeatureAccessMode {
  return parseFeatureAccessMode(value, JOBS_ACCESS_MODE_FALLBACK);
}

export async function getJobsAccessForRole(
  role: FeatureAccessRole,
  userId?: string | null
): Promise<JobsAccessResult> {
  const [featureAccessSettings, userOverride] = await Promise.all([
    loadFeatureAccessSettingsByKeys([JOBS_FEATURE_FLAG_KEY], {
      source: "jobs.config.feature-access",
      timeoutMs: JOBS_ACCESS_READ_TIMEOUT_MS,
    }),
    loadUserFeatureAccessOverride({
      featureKey: JOBS_FEATURE_FLAG_KEY,
      source: "jobs.config.user-feature-access",
      userId,
    }),
  ]);
  const rawValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
    JOBS_FEATURE_FLAG_KEY
  );
  const degraded = featureAccessSettings.status !== "confirmed";
  const mode = parseJobsAccessModeSetting(rawValue);
  return {
    degraded,
    enabled:
      degraded && rawValue === undefined && typeof userOverride !== "boolean"
        ? true
        : isFeatureEnabledForRole(mode, role, userOverride),
    mode,
  };
}

export async function isJobsEnabledForRole(
  role: FeatureAccessRole,
  userId?: string | null
) {
  const access = await getJobsAccessForRole(role, userId);
  return access.enabled;
}

export async function isJobsEnabled() {
  return isJobsEnabledForRole(null);
}
