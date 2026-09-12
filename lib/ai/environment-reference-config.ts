import "server-only";

import { IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY } from "@/lib/constants";
import type { UserRole } from "@/lib/db/schema";
import {
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import { loadUserFeatureAccessOverride } from "@/lib/settings/user-feature-access";

const ENVIRONMENT_REFERENCE_SETTING_TIMEOUT_MS = 1_500;

export async function isEnvironmentReferenceEnabledForRole(
  role: UserRole | null | undefined,
  userId?: string | null
) {
  try {
    const [snapshot, userOverride] = await Promise.all([
      loadFeatureAccessSettingsByKeys([IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY], {
        source: "image-environment-references.feature-access",
        timeoutMs: ENVIRONMENT_REFERENCE_SETTING_TIMEOUT_MS,
      }),
      loadUserFeatureAccessOverride({
        featureKey: IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY,
        source: "image-environment-references.user-feature-access",
        userId,
      }),
    ]);
    const value = getFeatureAccessModeSettingValue(
      snapshot,
      IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY
    );
    return isFeatureEnabledForRole(
      parseFeatureAccessMode(value, "admin_only"),
      role,
      userOverride
    );
  } catch (error) {
    console.warn(
      "[visual-reference/config] Feature access read unavailable; using admin-only fallback.",
      { reason: error instanceof Error ? error.message : String(error) }
    );
    return role === "admin";
  }
}
