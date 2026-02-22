import { NextResponse } from "next/server";
import {
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import {
  getAppSettingsByKeysUncached,
  getAppSettingUncached,
} from "@/lib/db/queries";
import { normalizeAdminEntryPathSetting } from "@/lib/settings/admin-entry";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
const SITE_LAUNCH_SETTINGS_TIMEOUT_MS = 6000;
const SITE_LAUNCH_RETRY_TIMEOUT_MS = 2000;
const SITE_LAUNCH_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
] as const;

function getInternalSiteStatusSecret() {
  return (process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "").trim();
}

async function loadSiteLaunchSettingsMap() {
  try {
    const settings = await withTimeout(
      getAppSettingsByKeysUncached([...SITE_LAUNCH_SETTING_KEYS]),
      SITE_LAUNCH_SETTINGS_TIMEOUT_MS
    );
    return new Map(settings.map((entry) => [entry.key, entry.value]));
  } catch (error) {
    console.error(
      "[api/public/site-launch] Batched settings query timed out or failed. Retrying with per-key reads.",
      error
    );
  }

  const entries = await Promise.allSettled(
    SITE_LAUNCH_SETTING_KEYS.map(async (key) => {
      const value = await withTimeout(
        getAppSettingUncached<unknown>(key),
        SITE_LAUNCH_RETRY_TIMEOUT_MS
      );
      return [key, value] as const;
    })
  );
  const map = new Map<string, unknown>();
  for (const entry of entries) {
    if (entry.status !== "fulfilled") {
      continue;
    }
    const [key, value] = entry.value;
    if (value !== null && value !== undefined) {
      map.set(key, value);
    }
  }

  return map;
}

export async function GET(request: Request) {
  try {
    const settingsMap = await loadSiteLaunchSettingsMap();
    const publicLaunchedSetting = settingsMap.get(SITE_PUBLIC_LAUNCHED_SETTING_KEY);
    const underMaintenanceSetting = settingsMap.get(
      SITE_UNDER_MAINTENANCE_SETTING_KEY
    );
    const inviteOnlyPrelaunchSetting = settingsMap.get(
      SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY
    );
    const adminAccessEnabledSetting = settingsMap.get(
      SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY
    );
    const adminEntryPathSetting = settingsMap.get(SITE_ADMIN_ENTRY_PATH_SETTING_KEY);
    const publicLaunched = parseBooleanSetting(publicLaunchedSetting, true);
    const underMaintenance = parseBooleanSetting(underMaintenanceSetting, false);
    const inviteOnlyPrelaunch = parseBooleanSetting(
      inviteOnlyPrelaunchSetting,
      false
    );
    const adminAccessEnabled = parseBooleanSetting(
      adminAccessEnabledSetting,
      false
    );
    const adminEntryPath = normalizeAdminEntryPathSetting(adminEntryPathSetting);
    const internalSecret = getInternalSiteStatusSecret();
    const internalHeader = request.headers.get("x-site-gate-secret") ?? "";
    const includeInternalData =
      internalSecret.length > 0
        ? internalHeader === internalSecret
        : process.env.NODE_ENV !== "production";

    const payload: {
      publicLaunched: boolean;
      underMaintenance: boolean;
      inviteOnlyPrelaunch: boolean;
      adminAccessEnabled: boolean;
      adminEntryPath?: string;
    } = {
      publicLaunched,
      underMaintenance,
      inviteOnlyPrelaunch,
      adminAccessEnabled,
    };
    if (includeInternalData) {
      payload.adminEntryPath = adminEntryPath;
    }

    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error(
      "[api/public/site-launch] Failed to resolve site availability. Falling back to defaults.",
      error
    );

    return NextResponse.json(
      {
        publicLaunched: true,
        underMaintenance: false,
        inviteOnlyPrelaunch: false,
        adminAccessEnabled: false,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
