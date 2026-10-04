import { calculateDistanceKm, formatDistanceKm } from "./geo";
import { safePlaceImageUrl } from "./image-matching";
import type { ExploreLocationInput, ExploreResult } from "./types";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown) { return typeof value === "string" ? value.trim().slice(0, 1000) : ""; }
function url(value: unknown) { return safePlaceImageUrl(text(value)); }
function placePhoto(value: unknown) {
  const candidate = url(value);
  if (!candidate) return null;
  const parsed = new URL(candidate);
  if (!/(?:^|\.)(?:googleusercontent\.com|gstatic\.com)$/.test(parsed.hostname)) return null;
  // Maps can return a legacy profile avatar instead of a business photo.
  // These empty-avatar URLs can be broken and are not a place image.
  if (parsed.pathname.includes("/AAAAAAAAAA") && parsed.pathname.endsWith("/photo.jpg")) return null;
  return candidate;
}

export function parseSerpentPlaces(payload: unknown, input: { location: ExploreLocationInput; radiusKm: number }): ExploreResult[] {
  const data = record(payload);
  if (data.success !== true || !Array.isArray(data.places)) throw new Error("invalid_place_response");
  const results = data.places.slice(0, 100).flatMap((item): ExploreResult[] => {
    const place = record(item);
    const coordinates = record(place.coordinates);
    const latitude = coordinates.latitude;
    const longitude = coordinates.longitude;
    const name = text(place.name);
    if (!name || typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90 || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return [];
    const distanceKm = calculateDistanceKm(input.location, { latitude, longitude });
    if (distanceKm > input.radiusKm + 0.05) return [];
    const sourceUrl = url(place.maps_url) ?? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
    const photoUrl = placePhoto(place.cover_image) ?? (Array.isArray(place.images) ? place.images.map((image) => placePhoto(record(image).url)).find(Boolean) ?? null : null)
      ?? placePhoto(record(place.thumbnail).url);
    // Maps photos are served directly by Google; keep web/native image hosts aligned with CSP.
    const imageUrl = photoUrl;
    const category = Array.isArray(place.categories) ? text(place.categories[0]) || null : null;
    return [{
      id: `serpent-${text(place.place_id) || `${name}:${latitude}:${longitude}`}`,
      name, category, description: text(place.description) || null,
      address: text(record(place.address).formatted) || null,
      distanceKm, distance: formatDistanceKm(distanceKm),
      rating: typeof place.rating === "number" && place.rating >= 0 && place.rating <= 5 ? place.rating : null,
      reviewCount: typeof place.review_count === "number" && Number.isSafeInteger(place.review_count) && place.review_count >= 0 ? place.review_count : null,
      openStatus: null, eventDate: null, phone: text(place.phone) || null,
      website: url(place.website), directionsUrl: sourceUrl, imageUrl, sourceTitle: "Google Maps", sourceUrl,
      latitude, longitude, attributions: [{ displayName: "Google Maps", uri: sourceUrl }],
    }];
  });
  return [...new Map(results.map((place) => [place.id, place])).values()].sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 48);
}
