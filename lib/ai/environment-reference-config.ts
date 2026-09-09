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

const ENVIRONMENT_REFERENCE_SETTING_TIMEOUT_MS = 1_500;

export async function isEnvironmentReferenceEnabledForRole(
  role: UserRole | null | undefined
) {
  try {
    const snapshot = await loadFeatureAccessSettingsByKeys(
      [IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY],
      {
        source: "image-environment-references.feature-access",
        timeoutMs: ENVIRONMENT_REFERENCE_SETTING_TIMEOUT_MS,
      }
    );
    const value = getFeatureAccessModeSettingValue(
      snapshot,
      IMAGE_WEB_REFERENCES_FEATURE_FLAG_KEY
    );
    return isFeatureEnabledForRole(
      parseFeatureAccessMode(value, "admin_only"),
      role
    );
  } catch (error) {
    console.warn(
      "[visual-reference/config] Feature access read unavailable; using admin-only fallback.",
      { reason: error instanceof Error ? error.message : String(error) }
    );
    return role === "admin";
  }
}
