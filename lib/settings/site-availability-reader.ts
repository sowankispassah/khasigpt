import { getLiteAppSettingsByKeysUncached } from "@/lib/db/app-settings-lite";
import {
  parseSiteAvailability,
  SITE_LAUNCH_SETTING_KEYS,
} from "@/lib/settings/site-availability";

// Keep the database read shared even if an individual caller's deadline expires.
// A slow connection must not create another queued query for every navigation.
export function createSiteAvailabilityReader(
  load = getLiteAppSettingsByKeysUncached
) {
  let pending: Promise<ReturnType<typeof parseSiteAvailability>> | null = null;
  return () => {
    if (pending) return pending;
    pending = load([...SITE_LAUNCH_SETTING_KEYS])
      .then((rows) => parseSiteAvailability(new Map(rows.map(({ key, value }) => [key, value]))))
      .finally(() => { pending = null; });
    return pending;
  };
}

export const readSiteAvailability = createSiteAvailabilityReader();
