import "server-only";

import { EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY } from "@/lib/constants";
import type { UserRole } from "@/lib/db/schema";
import {
  isFeatureEnabledForRole,
} from "@/lib/feature-access";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { loadUserFeatureAccessOverride } from "@/lib/settings/user-feature-access";
import { parseExploreAccessModeSetting } from "./shared";

export async function isExploreMeghalayaEnabledForRole(
  role: UserRole | null | undefined,
  userId?: string | null
) {
  const [snapshot, userOverride] = await Promise.all([
    loadFeatureAccessSettingsByKeys([EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY], {
      source: "explore.feature-access",
      timeoutMs: 2_000,
    }),
    loadUserFeatureAccessOverride({
      featureKey: EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
      source: "explore.user-feature-access",
      userId,
    }),
  ]);
  const value = getFeatureAccessModeSettingValue(
    snapshot,
    EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
    { unconfirmedFallback: "admin_only" }
  );
  return isFeatureEnabledForRole(
    parseExploreAccessModeSetting(value),
    role,
    userOverride
  );
}
