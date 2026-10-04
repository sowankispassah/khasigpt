import "server-only";
import { unstable_cache } from "next/cache";
import type { ExplorePlacesSearchInput } from "./places-service";
import { parseSerpentPlaces } from "./serpent-results";

const requestBudget = unstable_cache(async () => {
  const key = process.env.SERPENT_API_KEY?.trim();
  if (!key) throw new Error("place_provider_not_configured");
  try {
    // Status is a non-billable capability read; cache separately from paid searches.
    const response = await fetch("https://api.apiserpent.com/api/status", {
      headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw new Error("place_limits_unavailable");
    const payload = await response.json();
    const limits = payload.data?.limits;
    const maximum = limits?.endpoints?.["/api/maps/search/quick"]?.max_seconds;
    const minimum = limits?.timeout_param?.min;
    if (!Number.isFinite(maximum) || maximum < 15 || maximum > 160) throw new Error("invalid_place_limits");
    // Per the provider contract, budgets below roughly a quarter are clamped.
    const floor = Math.max(Math.ceil(maximum / 4), Number.isFinite(minimum) ? minimum : 5);
    if (floor > 40) throw new Error("unsupported_place_limits");
    const seconds = Math.min(maximum, Math.max(15, floor));
    console.info("[explore/serpent] Request budget", { maximum, floor, seconds, confirmed: true });
    return seconds;
  } catch {
    // Keep a bounded usable budget when the optional capability read is unavailable.
    console.info("[explore/serpent] Request budget", { seconds: 40, confirmed: false });
    return 40;
  }
}, ["explore-serpent-limits-v1"], { revalidate: 3600 });

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
  // End optional enrichment at the shortest supported upstream deadline.
  endpoint.searchParams.set("timeout", String(await requestBudget()));
  const started = Date.now();
  const response = await fetch(endpoint, { headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(45_000) });
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
}, ["explore-serpent-quick-v3"], { revalidate: 600 });

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
