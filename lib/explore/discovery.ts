import type { ExploreResult } from "./types";

export const DISCOVERY_QUERY = "Nearby places, businesses, food, services, attractions and activities";
// Separate intents prevent a general Maps query from ranking only attractions.
export const DISCOVERY_TERMS = ["restaurant", "shops and services", "places to visit"] as const;

export function isGeneralDiscovery(input: { query: string; categoryQuery: string | null }) {
  return !input.categoryQuery && input.query.trim() === DISCOVERY_QUERY;
}

// Commas separate alternatives; spaces inside a keyword remain a phrase.
// Keep user refinements attached to every alternative in the selected category.
export function expandExploreKeywords(input: { query: string; categoryQuery: string | null }) {
  const split = (value: string) => [...new Map(value.split(",")
    .map((term) => term.trim().replace(/\s+/g, " ")).filter(Boolean)
    .map((term) => [term.toLowerCase(), term])).values()];
  const queries = split(input.query);
  const categories = input.categoryQuery ? split(input.categoryQuery) : [];
  const intents = new Map<string, { query: string; categoryQuery: string | null }>();
  for (const query of queries) {
    for (const category of categories.length ? categories : [null]) {
      const categoryQuery = category?.toLowerCase() === query.toLowerCase() ? null : category;
      const key = JSON.stringify([categoryQuery?.toLowerCase() ?? null, query.toLowerCase()]);
      intents.set(key, { query, categoryQuery });
    }
  }
  // Bound authenticated request fan-out without silently dropping alternatives.
  if (!intents.size || intents.size > 8) throw new Error("invalid_explore_keywords");
  return [...intents.values()];
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
