import { CALCULATOR_FEATURE_FLAG_KEY } from "@/lib/constants";
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

export const CALCULATOR_ACCESS_MODE_FALLBACK: FeatureAccessMode = "enabled";
const CALCULATOR_FEATURE_ACCESS_TIMEOUT_MS = 2_000;

export function parseCalculatorAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, CALCULATOR_ACCESS_MODE_FALLBACK);
}

export async function isCalculatorEnabledForRole(
  role: FeatureAccessRole,
  userId?: string | null
) {
  const [featureAccessSettings, userOverride] = await Promise.all([
    loadFeatureAccessSettingsByKeys([CALCULATOR_FEATURE_FLAG_KEY], {
      source: "calculator.config.feature-access",
      timeoutMs: CALCULATOR_FEATURE_ACCESS_TIMEOUT_MS,
    }),
    loadUserFeatureAccessOverride({
      featureKey: CALCULATOR_FEATURE_FLAG_KEY,
      source: "calculator.config.user-feature-access",
      userId,
    }),
  ]);
  const rawValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
    CALCULATOR_FEATURE_FLAG_KEY
  );
  if (rawValue === undefined && featureAccessSettings.status === "unavailable") {
    return typeof userOverride === "boolean" ? userOverride : true;
  }
  const mode = parseCalculatorAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role, userOverride);
}

export async function isCalculatorEnabled() {
  return isCalculatorEnabledForRole(null);
}
