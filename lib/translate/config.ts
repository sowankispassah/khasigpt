import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting, getLastKnownAppSetting } from "@/lib/db/queries";
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
import { withTimeout } from "@/lib/utils/async";

export const TRANSLATE_ACCESS_MODE_FALLBACK: FeatureAccessMode = "disabled";
export type TranslateProviderMode = "ai" | "google";
export const TRANSLATE_PROVIDER_MODE_FALLBACK: TranslateProviderMode = "ai";
const TRANSLATE_FEATURE_ACCESS_TIMEOUT_MS = 2_000;
const TRANSLATE_PROVIDER_MODE_TIMEOUT_MS = 2_000;

export function parseTranslateAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, TRANSLATE_ACCESS_MODE_FALLBACK);
}

export async function isTranslateEnabledForRole(role: FeatureAccessRole) {
  const featureAccessSettings = await loadFeatureAccessSettingsByKeys(
    [TRANSLATE_FEATURE_FLAG_KEY],
    {
      source: "translate.config.feature-access",
      timeoutMs: TRANSLATE_FEATURE_ACCESS_TIMEOUT_MS,
    }
  );
  const rawValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
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
  const rawValue = await withTimeout(
    getAppSetting<string | boolean | number>(TRANSLATE_PROVIDER_MODE_SETTING_KEY),
    TRANSLATE_PROVIDER_MODE_TIMEOUT_MS
  ).catch((error) => {
    console.error(
      "[translate/config] Provider mode read failed; using last known value.",
      error
    );
    return getLastKnownAppSetting<string | boolean | number>(
      TRANSLATE_PROVIDER_MODE_SETTING_KEY
    );
  });
  return parseTranslateProviderModeSetting(rawValue);
}
