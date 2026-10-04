import "server-only";
import { createHash } from "node:crypto";
import { getCache } from "@vercel/functions";
import { z } from "zod";
import type { PlaceImage } from "./image-matching";
import { MISSING_PHOTO_TTL_SECONDS, PHOTO_CACHE_TAG, photoCacheExpired } from "./photo-cache-policy";
import { getPhotoCachePolicy } from "./photo-cache-settings";

const healthSchema = z.object({ usable: z.boolean(), checkedAt: z.number().finite() });
const entrySchema = z.object({ photo: z.object({ imageUrl: z.string().url(), title: z.string(), sourceUrl: z.string().url() }).nullable(), fetchedAt: z.number().finite() });

function sharedCache() {
  return getCache({ namespace: "khasigpt-explore-photos", keyHashFunction: (key) => createHash("sha256").update(key).digest("hex") });
}

// Probe only the public image CDNs allowed by both photo selectors; never follow redirects.
async function probePhoto(imageUrl: string, _generation: string, _day: number): Promise<boolean> {
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !/(?:^|\.)(?:googleusercontent\.com|gstatic\.com|bing\.net|upload\.wikimedia\.org|commons\.wikimedia\.org)$/.test(url.hostname)) return false;
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(3000) });
    // Rate limits, unsupported HEAD and network failures do not prove a URL is broken.
    return response.status !== 404 && response.status !== 410;
  } catch { return true; }
}
async function usablePhoto(photo: PlaceImage, generation: string) {
  const cache = sharedCache();
  const key = `explore-photo-health-v2:${generation}:${createHash("sha256").update(photo.imageUrl).digest("hex")}`;
  const parsed = healthSchema.safeParse(await cache.get(key));
  const previous = parsed.success ? parsed.data : null;
  if (previous && Date.now() - previous.checkedAt < MISSING_PHOTO_TTL_SECONDS * 1000) return previous.usable;
  // Daily checks cost no search-provider credits. A new URL is checked immediately.
  const usable = await probePhoto(photo.imageUrl, generation, 0);
  await cache.set(key, { usable, checkedAt: Date.now() }, { ttl: MISSING_PHOTO_TTL_SECONDS, tags: [PHOTO_CACHE_TAG], name: "Explore photo link health" });
  return usable;
}

export function createSharedPhotoLookup<T>(namespace: string, fetchPhoto: (input: T) => Promise<PlaceImage | null>) {
  const inFlight = new Map<string, Promise<PlaceImage | null>>();
  return async (input: T): Promise<PlaceImage | null> => {
    const policy = await getPhotoCachePolicy();
    const identity = createHash("sha256").update(JSON.stringify(input)).digest("hex");
    const key = `${namespace}:${identity}:${policy.generation}`;
    const existing = inFlight.get(key);
    if (existing) return existing;
    const pending = (async () => {
      const cache = sharedCache();
      const cacheKey = `explore-photo-v3:${key}`;
      const parsed = entrySchema.safeParse(await cache.get(cacheKey));
      const entry = parsed.success ? parsed.data : null;
      if (entry && !photoCacheExpired(entry, policy, Date.now()) && (!entry.photo || await usablePhoto(entry.photo, policy.generation))) return entry.photo;
      // Replace expired entries directly; no deferred tag invalidation can erase the refill.
      const candidate = await fetchPhoto(input);
      const photo = candidate && await usablePhoto(candidate, policy.generation) ? candidate : null;
      // Retain public metadata up to the supported maximum so increasing the admin expiry
      // can reuse existing entries. The timestamp above enforces the currently selected TTL.
      await cache.set(cacheKey, { photo, fetchedAt: Date.now() }, { ttl: photo ? 365 * 86_400 : MISSING_PHOTO_TTL_SECONDS, tags: [PHOTO_CACHE_TAG], name: "Explore shared place photo" });
      return photo;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
}
