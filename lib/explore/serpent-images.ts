import "server-only";
import { createHash } from "node:crypto";
import { buildPlaceImageQuery, type ExploreImagePlace, type PlaceImage, selectPlaceImage } from "./image-matching";
import { createSharedPhotoLookup } from "./photo-cache";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
export function normalizeSerpentImages(payload: unknown) {
  const root = record(payload);
  const results = record(root.results);
  if (root.success !== true || !Array.isArray(results.images)) throw new Error("invalid_image_response");
  return { images: results.images.map((value) => {
    const image = record(value);
    return { title: image.title, link: image.pageUrl, imageUrl: image.original, thumbnailUrl: image.thumbnail };
  }) };
}
const cachedPhoto = createSharedPhotoLookup("images", async (place: ExploreImagePlace): Promise<PlaceImage | null> => {
  const query = buildPlaceImageQuery(place);
  if (!query) return null;
  const key = process.env.SERPENT_API_KEY?.trim();
  if (!key) throw new Error("image_credentials_unavailable");
  const url = new URL("https://apiserpent.com/api/images");
  url.searchParams.set("q", query); url.searchParams.set("engine", "google");
  url.searchParams.set("country", "in"); url.searchParams.set("num", "10");
  const response = await fetch(url, { headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("image_lookup_failed");
  const payload: unknown = await response.json();
  const image = selectPlaceImage(place, normalizeSerpentImages(payload));
  // Do not cache an incomplete no-match as proof that a photo is unavailable.
  if (!image && record(record(payload).meta).partialResults === true) throw new Error("image_lookup_incomplete");
  console.info("[explore/photos] lookup completed", { queryHash: createHash("sha256").update(query).digest("hex").slice(0, 16), matched: Boolean(image) });
  return image;
});
export function lookupSerpentPlacePhoto(place: ExploreImagePlace) {
  return cachedPhoto(place);
}
