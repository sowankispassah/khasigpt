import "server-only";
import { unstable_cache } from "next/cache";
import type { ExplorePlacesSearchInput } from "./places-service";
import { parseSerpentPlaces } from "./serpent-results";

const cachedSearch = unstable_cache(async (query: string, latitude: number, longitude: number) => {
  const key = process.env.SERPENT_API_KEY?.trim();
  if (!key) throw new Error("place_provider_not_configured");
  const endpoint = new URL("https://api.apiserpent.com/api/maps/search/quick");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("lat", String(latitude));
  endpoint.searchParams.set("lng", String(longitude));
  endpoint.searchParams.set("country", "in");
  // Search the broad 50 km map view once, then filter distance locally.
  endpoint.searchParams.set("zoom", "9");
  // End optional enrichment upstream, allowing delivery of gathered core places.
  endpoint.searchParams.set("timeout", "15");
  const started = Date.now();
  const response = await fetch(endpoint, { headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Place search returned HTTP ${response.status}.`);
  const payload = await response.json();
  const results = parseSerpentPlaces(payload, {
    location: { id: "center", label: "", latitude, longitude, accuracy: null, source: "manual" },
    radiusKm: 50,
  });
  const partial = payload.meta?.partial === true || payload.meta?.partialResults === true;
  console.info("[explore/serpent] Maps completed", {
    elapsedMs: Date.now() - started, returned: results.length, partial,
    discovered: Number.isSafeInteger(payload.counts?.discovered) ? payload.counts.discovered : undefined,
    delivered: Number.isSafeInteger(payload.counts?.returned) ? payload.counts.returned : undefined,
  });
  // An incomplete empty search is not evidence that there are no nearby places.
  if (partial && results.length === 0) throw new Error("place_search_incomplete");
  return results;
}, ["explore-serpent-quick-v2"], { revalidate: 600 });

const inFlight = new Map<string, ReturnType<typeof cachedSearch>>();
export async function searchSerpentPlaces(input: ExplorePlacesSearchInput) {
  const searchTerm = input.query === "Nearby places, businesses, food, services, attractions and activities"
    ? "places to visit" : input.query;
  // Maps viewport bias is not a location restriction: anchor ambiguous words to the town.
  const query = [input.categoryQuery, searchTerm, `near ${input.location.label}`]
    .filter(Boolean).join(" ").trim().toLocaleLowerCase();
  const { latitude, longitude } = input.location;
  const identity = JSON.stringify([query, latitude, longitude]);
  let pending = inFlight.get(identity);
  if (!pending) {
    pending = cachedSearch(query, latitude, longitude).finally(() => inFlight.delete(identity));
    inFlight.set(identity, pending);
  }
  const results = await pending;
  return results.filter((place) => place.distanceKm <= input.radiusKm + 0.05);
}
