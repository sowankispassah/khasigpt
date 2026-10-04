import "server-only";
import { randomUUID } from "node:crypto";
import { getCache } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { revalidateTag, unstable_cache } from "next/cache";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { getAppSettingsByKeysUncached } from "@/lib/db/queries";
import { appSetting } from "@/lib/db/schema";
import { withTimeout } from "@/lib/utils/async";
import { PHOTO_CACHE_SETTING_KEY, PHOTO_CACHE_SETTINGS_TAG, PHOTO_CACHE_TAG, parsePhotoCachePolicy, photoCacheDurationSchema } from "./photo-cache-policy";

export async function readPhotoCachePolicy() {
  const rows = await withTimeout(getAppSettingsByKeysUncached([PHOTO_CACHE_SETTING_KEY]), 2000);
  return parsePhotoCachePolicy(rows.find((row) => row.key === PHOTO_CACHE_SETTING_KEY)?.value);
}
export const getPhotoCachePolicy = unstable_cache(readPhotoCachePolicy, ["explore-photo-cache-policy-v1"], { revalidate: 60, tags: [PHOTO_CACHE_SETTINGS_TAG] });

// Lock only this indexed setting row. Reset cannot overwrite a concurrent duration save.
export async function updatePhotoCachePolicy(input: { successTtlSeconds?: number; reset?: boolean }) {
  if (input.successTtlSeconds !== undefined) photoCacheDurationSchema.parse(input.successTtlSeconds);
  const policy = await withAdminDatabase("explore.photo-cache.save", (database) => database.transaction(async (tx) => {
    await tx.insert(appSetting).values({ key: PHOTO_CACHE_SETTING_KEY, value: parsePhotoCachePolicy(undefined) }).onConflictDoNothing();
    const [row] = await tx.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, PHOTO_CACHE_SETTING_KEY)).for("update");
    const previous = parsePhotoCachePolicy(row.value);
    const value = { ...previous, successTtlSeconds: input.successTtlSeconds ?? previous.successTtlSeconds,
      ...(input.reset ? { generation: randomUUID(), lastResetAt: new Date().toISOString() } : {}) };
    await tx.update(appSetting).set({ value, updatedAt: new Date() }).where(eq(appSetting.key, PHOTO_CACHE_SETTING_KEY));
    return value;
  }), { retry: false });
  revalidateTag(PHOTO_CACHE_SETTINGS_TAG, { expire: 0 });
  if (input.reset) {
    await getCache().expireTag(PHOTO_CACHE_TAG);
    revalidateTag(PHOTO_CACHE_TAG, { expire: 0 });
  }
  return policy;
}
