import "server-only";
import { createHash } from "node:crypto";
import { revalidateTag, unstable_cache } from "next/cache";
import type { PlaceImage } from "./image-matching";
import { MISSING_PHOTO_TTL_SECONDS, PHOTO_CACHE_TAG, photoCacheExpired } from "./photo-cache-policy";
import { getPhotoCachePolicy } from "./photo-cache-settings";

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
const cachedProbe = unstable_cache(probePhoto, ["explore-photo-health-v1"], { revalidate: false, tags: [PHOTO_CACHE_TAG] });
async function usablePhoto(photo: PlaceImage, generation: string) {
  // Daily checks cost no search-provider credits. A new URL is checked immediately.
  return cachedProbe(photo.imageUrl, generation, Math.floor(Date.now() / (MISSING_PHOTO_TTL_SECONDS * 1000)));
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
      const tag = `explore-photo:${namespace}:${identity}:${policy.generation}`;
      const cached = unstable_cache(async () => {
        const candidate = await fetchPhoto(input);
        const photo = candidate && await usablePhoto(candidate, policy.generation) ? candidate : null;
        return { photo, fetchedAt: Date.now() };
      }, ["explore-photo-v2", key], { revalidate: false, tags: [PHOTO_CACHE_TAG, tag] });
      let entry = await cached();
      // Explicit expiry avoids stale-while-revalidate serving an expired photo or no-photo result.
      if (photoCacheExpired(entry, policy, Date.now()) || (entry.photo && !await usablePhoto(entry.photo, policy.generation))) {
        revalidateTag(tag, { expire: 0 });
        entry = await cached();
      }
      return entry.photo;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
}
