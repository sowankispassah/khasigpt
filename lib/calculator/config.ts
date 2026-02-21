import { CALCULATOR_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
  type FeatureAccessMode,
  type FeatureAccessRole,
} from "@/lib/feature-access";

export const CALCULATOR_ACCESS_MODE_FALLBACK: FeatureAccessMode = "enabled";

export function parseCalculatorAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, CALCULATOR_ACCESS_MODE_FALLBACK);
}

export async function isCalculatorEnabledForRole(role: FeatureAccessRole) {
  const rawValue = await getAppSetting<string | boolean | number>(
    CALCULATOR_FEATURE_FLAG_KEY
  );
  const mode = parseCalculatorAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}

export async function isCalculatorEnabled() {
  return isCalculatorEnabledForRole(null);
}
