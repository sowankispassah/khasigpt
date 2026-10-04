import "server-only";
import { unstable_cache } from "next/cache";
import type { PlaceImage } from "./image-matching";
import type { PhotoLookupPlace } from "./photo-token";
import { placePhoto } from "./serpent-results";

type Reference = { parameter: "place_id" | "data_id" | "url"; value: string };
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

// Only identifiers from a server-signed Maps result can start a paid lookup.
export function listingPhotoReference(place: PhotoLookupPlace): Reference | null {
  if (place.lookupMode !== "listing" || !place.id.startsWith("serpent-")) return null;
  const identifier = place.id.slice("serpent-".length);
  if (/^ChIJ[A-Za-z0-9_-]{5,250}$/.test(identifier)) return { parameter: "place_id", value: identifier };
  if (/^0x[\da-f]+:0x[\da-f]+$/i.test(identifier)) return { parameter: "data_id", value: identifier };
  try {
    const url = new URL(place.mapsUrl ?? "");
    if (url.protocol !== "https:" || url.hostname !== "www.google.com" || url.username || url.password || url.port || !url.pathname.startsWith("/maps")) return null;
    const placeId = url.searchParams.get("query_place_id") ?? url.searchParams.get("q")?.replace(/^place_id:/, "");
    if (placeId && /^ChIJ[A-Za-z0-9_-]{5,250}$/.test(placeId)) return { parameter: "place_id", value: placeId };
    const cid = url.searchParams.get("cid");
    // Coordinate-only search URLs are not exact place identities.
    if ((cid && /^\d{1,30}$/.test(cid)) || /^\/maps\/place\/.+/.test(url.pathname)) return { parameter: "url", value: url.toString() };
  } catch { /* Missing or malformed listing URL has no photo lookup. */ }
  return null;
}

export function selectSerpentListingPhoto(payload: unknown, reference: Reference): PlaceImage | null {
  const root = record(payload);
  const place = record(root.place);
  if (root.success !== true || typeof place.name !== "string" || !place.name.trim()) throw new Error("invalid_listing_response");
  if ((reference.parameter === "place_id" && place.place_id !== reference.value) ||
    (reference.parameter === "data_id" && place.data_id !== reference.value)) throw new Error("listing_identity_mismatch");
  // A listing's cover may be a tiny preview of a larger image in its gallery.
  const candidates = [place.cover_image, ...(Array.isArray(place.images) ? place.images.map((image) => record(image).url) : []), record(place.thumbnail).url]
    .map(placePhoto).filter((value): value is string => Boolean(value));
  const size = (value: string) => Number(/=w(\d+)/.exec(new URL(value).pathname)?.[1] ?? 0);
  const imageUrl = candidates.sort((a, b) => size(b) - size(a))[0] ?? null;
  // A partial detail read cannot prove that the listing has no photos.
  if (!imageUrl && (place.detail_status === "core_only" || record(root.meta).partial === true || record(root.meta).partialResults === true)) throw new Error("listing_photo_incomplete");
  if (!imageUrl) return null;
  const sourceUrl = reference.parameter === "url" ? reference.value :
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}&${reference.parameter === "place_id" ? "query_place_id" : "ftid"}=${encodeURIComponent(reference.value)}`;
  return { imageUrl, title: place.name.trim().slice(0, 240), sourceUrl };
}

const cachedPhoto = unstable_cache(async (reference: Reference): Promise<PlaceImage | null> => {
  const key = process.env.SERPENT_API_KEY?.trim();
  if (!key) throw new Error("photo_credentials_unavailable");
  const endpoint = new URL("https://api.apiserpent.com/api/maps/place");
  endpoint.searchParams.set(reference.parameter, reference.value);
  const started = Date.now();
  const response = await fetch(endpoint, { headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("listing_photo_unavailable");
  const photo = selectSerpentListingPhoto(await response.json(), reference);
  console.info("[explore/photos] Listing lookup completed", { elapsedMs: Date.now() - started, matched: Boolean(photo) });
  return photo;
}, ["explore-serpent-listing-photo-v1"], { revalidate: 86_400 });

const inFlight = new Map<string, Promise<PlaceImage | null>>();
export function lookupSerpentListingPhoto(place: PhotoLookupPlace): Promise<PlaceImage | null> {
  const reference = listingPhotoReference(place);
  if (!reference) return Promise.resolve(null);
  const identity = JSON.stringify(reference);
  let pending = inFlight.get(identity);
  if (!pending) {
    pending = cachedPhoto(reference).finally(() => inFlight.delete(identity));
    inFlight.set(identity, pending);
  }
  return pending;
}
