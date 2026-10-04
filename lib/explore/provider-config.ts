import "server-only";
import { unstable_cache } from "next/cache";
import { getAppSettingsByKeysUncached } from "@/lib/db/queries";
import { withTimeout } from "@/lib/utils/async";
import { EXPLORE_PROVIDER_SETTING_KEY, parseExploreProvider } from "./providers";
import { parseSerpentMapsQuickEnabled, SERPENT_MAPS_QUICK_SETTING_KEY } from "./serpent-policy";

export const EXPLORE_PROVIDER_CACHE_TAG = "explore-provider";
export async function readExploreProvider() {
  const settings = await withTimeout(getAppSettingsByKeysUncached([EXPLORE_PROVIDER_SETTING_KEY]), 2_000);
  return parseExploreProvider(settings.find((row) => row.key === EXPLORE_PROVIDER_SETTING_KEY)?.value);
}
export const getExploreProvider = unstable_cache(readExploreProvider, ["explore-provider-v1"], {
  revalidate: 60, tags: [EXPLORE_PROVIDER_CACHE_TAG],
});

export async function readSerpentMapsQuickEnabled() {
  const settings = await withTimeout(getAppSettingsByKeysUncached([SERPENT_MAPS_QUICK_SETTING_KEY]), 2_000);
  return parseSerpentMapsQuickEnabled(settings.find((row) => row.key === SERPENT_MAPS_QUICK_SETTING_KEY)?.value);
}
export const getSerpentMapsQuickEnabled = unstable_cache(readSerpentMapsQuickEnabled, ["explore-serpent-maps-quick-v1"], {
  revalidate: 60, tags: [EXPLORE_PROVIDER_CACHE_TAG],
});
