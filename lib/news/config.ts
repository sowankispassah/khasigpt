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
import { loadUserFeatureAccessOverride } from "@/lib/settings/user-feature-access";

const NEWS_ACCESS_READ_TIMEOUT_MS = 2_000;

export { NEWS_ACCESS_MODE_FALLBACK, parseNewsAccessModeSetting };

export async function isNewsEnabledForRole(
  role: FeatureAccessRole,
  userId?: string | null
) {
  const [settings, userOverride] = await Promise.all([
    loadFeatureAccessSettingsByKeys([NEWS_FEATURE_FLAG_KEY], {
      source: "news.config.feature-access",
      timeoutMs: NEWS_ACCESS_READ_TIMEOUT_MS,
    }),
    loadUserFeatureAccessOverride({
      featureKey: NEWS_FEATURE_FLAG_KEY,
      source: "news.config.user-feature-access",
      userId,
    }),
  ]);
  const rawValue = getFeatureAccessModeSettingValue(
    settings,
    NEWS_FEATURE_FLAG_KEY,
    { unconfirmedFallback: NEWS_ACCESS_MODE_FALLBACK }
  );
  return isFeatureEnabledForRole(
    parseNewsAccessModeSetting(rawValue),
    role,
    userOverride
  );
}
