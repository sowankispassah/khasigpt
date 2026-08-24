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
import { parseExploreAccessModeSetting } from "./shared";

export async function isExploreMeghalayaEnabledForRole(
  role: UserRole | null | undefined
) {
  const snapshot = await loadFeatureAccessSettingsByKeys(
    [EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY],
    { source: "explore.feature-access", timeoutMs: 2_000 }
  );
  const value = getFeatureAccessModeSettingValue(
    snapshot,
    EXPLORE_MEGHALAYA_FEATURE_FLAG_KEY,
    { unconfirmedFallback: "admin_only" }
  );
  return isFeatureEnabledForRole(
    parseExploreAccessModeSetting(value),
    role
  );
}
