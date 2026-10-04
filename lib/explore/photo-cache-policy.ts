import { z } from "zod";

export const PHOTO_CACHE_SETTING_KEY = "explore_serpent_photo_cache";
export const PHOTO_CACHE_TAG = "explore-serpent-photos";
export const PHOTO_CACHE_SETTINGS_TAG = "explore-photo-cache-settings";
export const MISSING_PHOTO_TTL_SECONDS = 86_400;
export const photoCacheDurationSchema = z.number().int().min(3600).max(365 * 86_400);
export const photoCachePolicySchema = z.object({
  successTtlSeconds: photoCacheDurationSchema,
  generation: z.string().min(1).max(64),
  lastResetAt: z.string().datetime().nullable(),
}).strict();
export type PhotoCachePolicy = z.infer<typeof photoCachePolicySchema>;
export function parsePhotoCachePolicy(value: unknown): PhotoCachePolicy {
  return value === undefined
    ? { successTtlSeconds: 7 * 86_400, generation: "initial", lastResetAt: null }
    : photoCachePolicySchema.parse(value);
}
export function photoCacheExpired(entry: { photo: unknown; fetchedAt: number }, policy: PhotoCachePolicy, now = Date.now()) {
  const ttl = entry.photo ? policy.successTtlSeconds : MISSING_PHOTO_TTL_SECONDS;
  return now - entry.fetchedAt >= ttl * 1000;
}
