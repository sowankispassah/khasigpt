import "server-only";
import { unstable_cache } from "next/cache";
import type { ExplorePlacesSearchInput } from "./places-service";
import { parseSerpentPlaces } from "./serpent-results";

const cachedSearch = unstable_cache(async (input: ExplorePlacesSearchInput) => {
  const key = process.env.SERPENT_API_KEY?.trim();
  if (!key) throw new Error("place_provider_not_configured");
  const endpoint = new URL("https://apiserpent.com/api/maps/search/quick");
  endpoint.searchParams.set("q", [input.categoryQuery, input.query].filter(Boolean).join(" ") || "places to visit");
  endpoint.searchParams.set("lat", String(input.location.latitude));
  endpoint.searchParams.set("lng", String(input.location.longitude));
  endpoint.searchParams.set("country", "in");
  const response = await fetch(endpoint, { headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Place search returned HTTP ${response.status}.`);
  return parseSerpentPlaces(await response.json(), input);
}, ["explore-serpent-quick-v1"], { revalidate: 600 });

const inFlight = new Map<string, ReturnType<typeof cachedSearch>>();
export async function searchSerpentPlaces(input: ExplorePlacesSearchInput) {
  const identity = JSON.stringify(input);
  const existing = inFlight.get(identity);
  if (existing) return existing;
  const pending = cachedSearch(input).finally(() => inFlight.delete(identity));
  inFlight.set(identity, pending);
  return pending;
}
