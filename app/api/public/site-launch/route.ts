import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import {
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  getLiteAppSettingsByKeysUncached,
} from "@/lib/db/app-settings-lite";
import { normalizeAdminEntryPathSetting } from "@/lib/settings/admin-entry";
import { parseBooleanSetting } from "@/lib/settings/boolean-setting";
import {
  parseLegacySiteLaunchMode,
  resolveAdminAccessEnabledSetting,
  resolvePublicLaunchedSetting,
} from "@/lib/settings/site-launch";
import { withTimeout } from "@/lib/utils/async";

export const runtime = "nodejs";
function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const SITE_LAUNCH_SETTINGS_TIMEOUT_MS = parsePositiveInt(
  process.env.SITE_LAUNCH_SETTINGS_TIMEOUT_MS,
  process.env.NODE_ENV === "production" ? 1200 : 2000
);
const SITE_LAUNCH_CACHE_WINDOW_MS =
  process.env.NODE_ENV === "development" ? 1_000 : 60_000;
const SITE_LAUNCH_CACHE_STALE_GRACE_MS =
  process.env.NODE_ENV === "development" ? 60_000 : 5 * 60_000;
const SITE_LAUNCH_SHARED_CACHE_SECONDS = 5 * 60;
const SITE_LAUNCH_SETTING_KEYS = [
  SITE_PUBLIC_LAUNCHED_SETTING_KEY,
  SITE_UNDER_MAINTENANCE_SETTING_KEY,
  SITE_PRELAUNCH_INVITE_ONLY_SETTING_KEY,
  SITE_ADMIN_ENTRY_ENABLED_SETTING_KEY,
  SITE_ADMIN_ENTRY_PATH_SETTING_KEY,
  SITE_LEGACY_LAUNCH_MODE_SETTING_KEY,
] as const;
let siteLaunchSettingsCache:
  | {
      fetchedAt: number;
      map: Map<string, unknown>;
    }
  | null = null;
const loadSharedSiteLaunchSettings = unstable_cache(
  () => getLiteAppSettingsByKeysUncached([...SITE_LAUNCH_SETTING_KEYS]),
  ["public-site-launch-settings"],
  {
    revalidate: SITE_LAUNCH_SHARED_CACHE_SECONDS,
    tags: SITE_LAUNCH_SETTING_KEYS.map((key) =>
      appSettingCacheTagForKey(key)
    ),
  }
);

function getSafeSiteLaunchFallbackState() {
  if (process.env.NODE_ENV === "production") {
    return {
      publicLaunched: false,
      underMaintenance: false,
      inviteOnlyPrelaunch: false,
      adminAccessEnabled: false,
      adminEntryPath: normalizeAdminEntryPathSetting(null),
    };
  }

  return {
    publicLaunched: true,
    underMaintenance: false,
    inviteOnlyPrelaunch: false,
    adminAccessEnabled: false,
    adminEntryPath: normalizeAdminEntryPathSetting(null),
  };
}

function cloneSettingsMap(map: Map<string, unknown>) {
  return new Map<string, unknown>(map);
}

function getCachedSettingsMap() {
  if (!siteLaunchSettingsCache) {
    return null;
  }

  if (
    Date.now() - siteLaunchSettingsCache.fetchedAt >
    SITE_LAUNCH_CACHE_WINDOW_MS
  ) {
    return null;
  }

  return cloneSettingsMap(siteLaunchSettingsCache.map);
}

function getStaleSettingsMap() {
  if (!siteLaunchSettingsCache) {
    return null;
  }

  if (
    Date.now() - siteLaunchSettingsCache.fetchedAt >
    SITE_LAUNCH_CACHE_STALE_GRACE_MS
  ) {
    return null;
  }

  return cloneSettingsMap(siteLaunchSettingsCache.map);
}

function cacheSettingsMap(map: Map<string, unknown>) {
  siteLaunchSettingsCache = {
    fetchedAt: Date.now(),
    map: cloneSettingsMap(map),
  };
  return cloneSettingsMap(map);
}

type SiteLaunchSettingsResult = {
  degraded: boolean;
  map: Map<string, unknown>;
};

async function loadSiteLaunchSettingsMap() {
  const cached = getCachedSettingsMap();
  if (cached) {
    return { degraded: false, map: cached } satisfies SiteLaunchSettingsResult;
  }

  try {
    const settings = await withTimeout(
      loadSharedSiteLaunchSettings(),
      SITE_LAUNCH_SETTINGS_TIMEOUT_MS
    );
    return {
      degraded: false,
      map: cacheSettingsMap(
        new Map(settings.map((entry) => [entry.key, entry.value]))
      ),
    } satisfies SiteLaunchSettingsResult;
  } catch (error) {
    console.warn(
      "[api/public/site-launch] Settings query timed out or failed. Using stale state when available.",
      error
    );
  }

  const stale = getStaleSettingsMap();
  if (stale) {
    return { degraded: true, map: stale } satisfies SiteLaunchSettingsResult;
  }

  throw new Error("site_launch_settings_unavailable");
}

export async function GET() {
  try {
    const fallbackState = getSafeSiteLaunchFallbackState();
    const { degraded, map: settingsMap } = await loadSiteLaunchSettingsMap();
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
    const legacyLaunchMode = parseLegacySiteLaunchMode(
      settingsMap.get(SITE_LEGACY_LAUNCH_MODE_SETTING_KEY)
    );
    const adminEntryPathSetting = settingsMap.get(SITE_ADMIN_ENTRY_PATH_SETTING_KEY);
    const publicLaunched = resolvePublicLaunchedSetting({
      fallback: fallbackState.publicLaunched,
      legacyMode: legacyLaunchMode,
      value: publicLaunchedSetting,
    });
    const underMaintenance = parseBooleanSetting(
      underMaintenanceSetting,
      fallbackState.underMaintenance
    );
    const inviteOnlyPrelaunch = parseBooleanSetting(
      inviteOnlyPrelaunchSetting,
      fallbackState.inviteOnlyPrelaunch
    );
    const adminAccessEnabled = resolveAdminAccessEnabledSetting({
      fallback: fallbackState.adminAccessEnabled,
      legacyMode: legacyLaunchMode,
      value: adminAccessEnabledSetting,
    });
    const adminEntryPath =
      adminEntryPathSetting === null || typeof adminEntryPathSetting === "undefined"
        ? fallbackState.adminEntryPath
        : normalizeAdminEntryPathSetting(adminEntryPathSetting);

    const payload: {
      confirmed: boolean;
      degraded: boolean;
      publicLaunched: boolean;
      underMaintenance: boolean;
      inviteOnlyPrelaunch: boolean;
      adminAccessEnabled: boolean;
      adminEntryPath: string;
    } = {
      confirmed: !degraded,
      degraded,
      publicLaunched,
      underMaintenance,
      inviteOnlyPrelaunch,
      adminAccessEnabled,
      adminEntryPath,
    };

    return NextResponse.json(
      payload,
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    const fallbackState = getSafeSiteLaunchFallbackState();
    console.error(
      "[api/public/site-launch] Failed to resolve site availability. Falling back to safe defaults.",
      error
    );

    return NextResponse.json(
      {
        ...fallbackState,
        confirmed: false,
        degraded: true,
      },
      {
        status: 503,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
