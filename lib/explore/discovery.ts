import type { ExploreResult } from "./types";

export const DISCOVERY_QUERY = "Nearby places, businesses, food, services, attractions and activities";
// Separate intents prevent a general Maps query from ranking only attractions.
export const DISCOVERY_TERMS = ["restaurant", "shops and services", "places to visit"] as const;

export function isGeneralDiscovery(input: { query: string; categoryQuery: string | null }) {
  return !input.categoryQuery && input.query.trim() === DISCOVERY_QUERY;
}

export function mergeDiscoveryResults(groups: ExploreResult[][]) {
  const ids = new Set<string>();
  const locations = new Set<string>();
  return groups.flat().sort((a, b) => a.distanceKm - b.distanceKm).filter((place) => {
    const identity = `${place.name.trim().replace(/\s+/g, " ").toLocaleLowerCase()}:${place.latitude.toFixed(5)}:${place.longitude.toFixed(5)}`;
    if (ids.has(place.id) || locations.has(identity)) return false;
    ids.add(place.id);
    locations.add(identity);
    return true;
  }).slice(0, 48);
}
