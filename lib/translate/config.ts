import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  type FeatureAccessMode,
  type FeatureAccessRole,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";

export const TRANSLATE_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";
export type TranslateProviderMode = "ai" | "google";
export const TRANSLATE_PROVIDER_MODE_FALLBACK: TranslateProviderMode = "ai";

export function parseTranslateAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, TRANSLATE_ACCESS_MODE_FALLBACK);
}

export async function isTranslateEnabledForRole(role: FeatureAccessRole) {
  const rawValue = await getAppSetting<string | boolean | number>(
    TRANSLATE_FEATURE_FLAG_KEY
  );
  const mode = parseTranslateAccessModeSetting(rawValue);
  return isFeatureEnabledForRole(mode, role);
}

export function parseTranslateProviderModeSetting(
  value: unknown
): TranslateProviderMode {
  return value === "google" ? "google" : TRANSLATE_PROVIDER_MODE_FALLBACK;
}

export async function getTranslateProviderMode() {
  const rawValue = await getAppSetting<string | boolean | number>(
    TRANSLATE_PROVIDER_MODE_SETTING_KEY
  );
  return parseTranslateProviderModeSetting(rawValue);
}
