import {
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import { normalizeAdminEntryPathSetting } from "@/lib/settings/admin-entry";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import {
  parseLegacySiteLaunchMode,
  resolveAdminAccessEnabledSetting,
  resolvePublicLaunchedSetting,
} from "@/lib/settings/site-launch";

export const SITE_LAUNCH_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
] as const;

export function getSafeSiteAvailability() {
  return {
    publicLaunched: process.env.NODE_ENV !== "production",
    underMaintenance: false,
    inviteOnlyPrelaunch: false,
    adminAccessEnabled: false,
    adminEntryPath: normalizeAdminEntryPathSetting(null),
  };
}

export function parseSiteAvailability(settings: Map<string, unknown>) {
  const fallback = getSafeSiteAvailability();
  const legacyMode = parseLegacySiteLaunchMode(
    settings.get(SITE_LEGACY_LAUNCH_MODE_SETTING_KEY)
  );
  return {
    publicLaunched: resolvePublicLaunchedSetting({
      fallback: fallback.publicLaunched,
      legacyMode,
      value: settings.get(SITE_PUBLIC_LAUNCHED_SETTING_KEY),
    }),
    underMaintenance: parseBooleanSetting(
      settings.get(SITE_UNDER_MAINTENANCE_SETTING_KEY),
      fallback.underMaintenance
    ),
    inviteOnlyPrelaunch: parseBooleanSetting(
      settings.get(SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY),
      fallback.inviteOnlyPrelaunch
    ),
    adminAccessEnabled: resolveAdminAccessEnabledSetting({
      fallback: fallback.adminAccessEnabled,
      legacyMode,
      value: settings.get(SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY),
    }),
    adminEntryPath: normalizeAdminEntryPathSetting(
      settings.get(SITE_ADMIN_ENTRY_PATH_SETTING_KEY)
    ),
  };
}
