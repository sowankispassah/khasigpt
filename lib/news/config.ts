import { NEWS_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  type FeatureAccessRole,
  isFeatureEnabledForRole,
} from "@/lib/feature-access";
import {
  NEWS_ACCESS_MODE_FALLBACK,
  parseNewsAccessModeSetting,
} from "@/lib/news/shared";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";

const NEWS_ACCESS_READ_TIMEOUT_MS = 2_000;

export { NEWS_ACCESS_MODE_FALLBACK, parseNewsAccessModeSetting };

export async function isNewsEnabledForRole(role: FeatureAccessRole) {
  const settings = await loadFeatureAccessSettingsByKeys(
    [NEWS_FEATURE_FLAG_KEY],
    {
      source: "news.config.feature-access",
      timeoutMs: NEWS_ACCESS_READ_TIMEOUT_MS,
    }
  );
  const rawValue = getFeatureAccessModeSettingValue(
    settings,
    NEWS_FEATURE_FLAG_KEY,
    { unconfirmedFallback: NEWS_ACCESS_MODE_FALLBACK }
  );
  return isFeatureEnabledForRole(parseNewsAccessModeSetting(rawValue), role);
}
