import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";
import {
  appSettingCacheTagForKey,
  getLiteAppSettingsByKeysUncached,
} from "@/lib/db/app-settings-lite";
import {
  getSafeSiteAvailability,
  parseSiteAvailability,
  SITE_LAUNCH_SETTING_KEYS,
} from "@/lib/settings/site-availability";
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
    const { degraded, map: settingsMap } = await loadSiteLaunchSettingsMap();
    const payload = {
      confirmed: !degraded,
      degraded,
      ...parseSiteAvailability(settingsMap),
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
    const fallbackState = getSafeSiteAvailability();
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
