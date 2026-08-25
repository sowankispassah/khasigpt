import "server-only";

import { createHash } from "node:crypto";
import {
  calculateDistanceKm,
  formatDistanceKm,
  getRadiusBoundingBox,
} from "@/lib/explore/geo";
import type {
  ExploreAttribution,
  ExploreLocationInput,
  ExploreResult,
} from "@/lib/explore/types";

const GOOGLE_TEXT_SEARCH_URL =
  "https://places.googleapis.com/v1/places:searchText";
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;
const SEARCH_TIMEOUT_MS = 15_000;
const MAX_RESULTS = 12;
const OSM_ATTRIBUTION: ExploreAttribution = {
  displayName: "© OpenStreetMap contributors",
  uri: "https://www.openstreetmap.org/copyright",
};

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  currentOpeningHours?: { openNow?: boolean };
  websiteUri?: string;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  photos?: Array<{
    name?: string;
    authorAttributions?: Array<{ displayName?: string; uri?: string }>;
  }>;
};

type GooglePlacesResponse = {
  places?: GooglePlace[];
};

type OverpassElement = {
  center?: { lat?: number; lon?: number };
  id?: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string | undefined>;
  type?: "node" | "way" | "relation";
};

type OverpassResponse = {
  elements?: OverpassElement[];
};

function safeHttpUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.startsWith("//") ? `https:${value}` : value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function resultId(prefix: string, value: string) {
  return `${prefix}-${createHash("sha256").update(value).digest("hex").slice(0, 14)}`;
}

function formatOpenStatus(openNow: boolean | undefined) {
  return typeof openNow === "boolean" ? (openNow ? "Open now" : "Closed") : null;
}

function normalizeAttributions(
  values: Array<{ displayName?: string; uri?: string }> | undefined,
) {
  return (values ?? []).flatMap((value) => {
    const displayName = value.displayName?.trim();
    if (!displayName) return [];
    return [{ displayName, uri: safeHttpUrl(value.uri) }] satisfies ExploreAttribution[];
  });
}

async function getGooglePhoto(
  key: string,
  photo:
    | {
        name?: string;
        authorAttributions?: Array<{ displayName?: string; uri?: string }>;
      }
    | undefined,
) {
  if (!photo?.name?.startsWith("places/")) {
    return { imageUrl: null, attributions: [] as ExploreAttribution[] };
  }
  const url = new URL(`https://places.googleapis.com/v1/${photo.name}/media`);
  url.searchParams.set("key", key);
  url.searchParams.set("maxWidthPx", "900");
  url.searchParams.set("maxHeightPx", "600");
  url.searchParams.set("skipHttpRedirect", "true");
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    return { imageUrl: null, attributions: [] as ExploreAttribution[] };
  }
  const payload = (await response.json()) as { photoUri?: string };
  return {
    imageUrl: safeHttpUrl(payload.photoUri),
    attributions: normalizeAttributions(photo.authorAttributions),
  };
}

export function filterExploreResultsWithinRadius(
  results: ExploreResult[],
  location: Pick<ExploreLocationInput, "latitude" | "longitude">,
  radiusKm: number,
) {
  return results
    .map((result) => {
      const distanceKm = calculateDistanceKm(location, result);
      return {
        ...result,
        distanceKm,
        distance: formatDistanceKm(distanceKm),
      };
    })
    .filter((result) => result.distanceKm <= radiusKm + 0.05)
    .sort((first, second) => first.distanceKm - second.distanceKm)
    .slice(0, MAX_RESULTS);
}

async function searchGooglePlaces({
  categoryQuery,
  location,
  query,
  radiusKm,
}: ExplorePlacesSearchInput) {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!key) return null;
  const boundingBox = getRadiusBoundingBox(location, radiusKm);
  const response = await fetch(GOOGLE_TEXT_SEARCH_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.primaryTypeDisplayName",
        "places.rating",
        "places.userRatingCount",
        "places.currentOpeningHours",
        "places.websiteUri",
        "places.googleMapsUri",
        "places.nationalPhoneNumber",
        "places.photos",
      ].join(","),
    },
    body: JSON.stringify({
      textQuery: [categoryQuery, query].filter(Boolean).join(" "),
      pageSize: 20,
      rankPreference: "DISTANCE",
      regionCode: "IN",
      locationRestriction: { rectangle: boundingBox },
    }),
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Google Places returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as GooglePlacesResponse;
  const places = (payload.places ?? []).flatMap((place) => {
    const latitude = place.location?.latitude;
    const longitude = place.location?.longitude;
    const name = place.displayName?.text?.trim();
    const sourceUrl = safeHttpUrl(place.googleMapsUri);
    if (
      !(name && sourceUrl && typeof latitude === "number" && typeof longitude === "number")
    ) {
      return [];
    }
    return [{ place, latitude, longitude, name, sourceUrl }];
  });
  const photos = await Promise.all(
    places.map((entry, index) =>
      index < 6
        ? getGooglePhoto(key, entry.place.photos?.[0])
        : Promise.resolve({
            imageUrl: null,
            attributions: [] as ExploreAttribution[],
          }),
    ),
  );
  const results = places.map((entry, index) => ({
    id: resultId("google", entry.place.id ?? entry.sourceUrl),
    name: entry.name,
    category: entry.place.primaryTypeDisplayName?.text?.trim() || null,
    description: null,
    address: entry.place.formattedAddress?.trim() || null,
    distance: null,
    distanceKm: 0,
    rating: entry.place.rating ?? null,
    reviewCount: entry.place.userRatingCount ?? null,
    openStatus: formatOpenStatus(entry.place.currentOpeningHours?.openNow),
    eventDate: null,
    phone: entry.place.nationalPhoneNumber?.trim() || null,
    website: safeHttpUrl(entry.place.websiteUri),
    directionsUrl: entry.sourceUrl,
    imageUrl: photos[index]?.imageUrl ?? null,
    sourceTitle: "Google Maps",
    sourceUrl: entry.sourceUrl,
    latitude: entry.latitude,
    longitude: entry.longitude,
    attributions: photos[index]?.attributions ?? [],
  } satisfies ExploreResult));
  return filterExploreResultsWithinRadius(results, location, radiusKm);
}

function osmIntentClauses(searchText: string) {
  const text = searchText.toLocaleLowerCase();
  const clauses = new Set<string>();
  const add = (...values: string[]) => {
    for (const value of values) clauses.add(value);
  };

  if (/restaurant|food|khasi|meal|cafe|coffee|bak(?:ery|eries)|fast food/.test(text)) {
    add(
      '[amenity~"^(restaurant|cafe|fast_food|food_court)$"]',
      '[shop~"^(bakery|confectionery|coffee)$"]',
    );
  }
  if (/shop|shopping|business|market|electronic|print|service|store/.test(text)) {
    add('[shop]', '[office]', '[craft]');
  }
  if (/hotel|stay|guest|hostel|resort|lodge|homestay/.test(text)) {
    add('[tourism~"^(hotel|guest_house|hostel|motel|resort|camp_site)$"]');
  }
  if (/pharmacy|chemist|medical|hospital|clinic|health/.test(text)) {
    add('[amenity~"^(pharmacy|hospital|clinic|doctors)$"]');
  }
  if (/sport|football|stadium|activity|activities|gym/.test(text)) {
    add(
      '[leisure~"^(sports_centre|stadium|pitch|fitness_centre|swimming_pool)$"]',
      '[sport]',
    );
  }
  if (/visit|attraction|experience|nature|waterfall|view|park|tour/.test(text)) {
    add(
      '[tourism~"^(attraction|viewpoint|museum|gallery|picnic_site|information)$"]',
      '[natural~"^(waterfall|peak|cave_entrance|spring)$"]',
      '[historic]',
      '[leisure~"^(park|nature_reserve|garden)$"]',
    );
  }
  if (/event|festival|entertainment|music|cinema|theatre/.test(text)) {
    add(
      '[amenity~"^(cinema|theatre|community_centre|events_venue)$"]',
      '[leisure~"^(dance|adult_gaming_centre)$"]',
    );
  }
  if (clauses.size === 0 || /around you|nearby places|local discoveries/.test(text)) {
    add(
      '[amenity~"^(restaurant|cafe|fast_food|pharmacy|hospital|bank|marketplace|community_centre)$"]',
      '[tourism~"^(hotel|guest_house|attraction|viewpoint|museum|picnic_site)$"]',
      '[shop]',
      '[leisure~"^(sports_centre|stadium|pitch|park|nature_reserve)$"]',
      '[historic]',
      '[natural~"^(waterfall|peak|cave_entrance|spring)$"]',
    );
  }
  return Array.from(clauses).slice(0, 8);
}

export function buildOverpassExploreQuery({
  categoryQuery,
  location,
  query,
  radiusKm,
}: ExplorePlacesSearchInput) {
  const boundingBox = getRadiusBoundingBox(location, radiusKm);
  const bbox = [
    boundingBox.low.latitude,
    boundingBox.low.longitude,
    boundingBox.high.latitude,
    boundingBox.high.longitude,
  ].join(",");
  const clauses = osmIntentClauses(`${categoryQuery ?? ""} ${query}`);
  return [
    "[out:json][timeout:12];",
    "(",
    ...clauses.map((clause) => `nwr(${bbox})[name]${clause};`),
    ");",
    "out center tags 100;",
  ].join("");
}

function osmCategory(tags: Record<string, string | undefined>) {
  return (
    tags.amenity ||
    tags.shop ||
    tags.tourism ||
    tags.leisure ||
    tags.office ||
    tags.craft ||
    tags.historic ||
    tags.natural ||
    null
  )?.replaceAll("_", " ") ?? null;
}

function osmAddress(tags: Record<string, string | undefined>) {
  const street = [tags["addr:housenumber"], tags["addr:street"]]
    .filter(Boolean)
    .join(" ");
  return [
    street,
    tags["addr:place"],
    tags["addr:city"],
    tags["addr:district"],
    tags["addr:state"],
  ]
    .filter(Boolean)
    .join(", ") || null;
}

function osmImage(tags: Record<string, string | undefined>) {
  const direct = safeHttpUrl(tags.image);
  if (direct) return direct;
  const commons = tags.wikimedia_commons?.replace(/^File:/i, "").trim();
  return commons
    ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(commons)}`
    : null;
}

async function searchOverpass(input: ExplorePlacesSearchInput) {
  const query = buildOverpassExploreQuery(input);
  let providerError: unknown = null;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const body = new URLSearchParams({ data: query });
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)",
        },
        body,
        signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new Error(`OpenStreetMap search returned HTTP ${response.status}.`);
      }
      const payload = (await response.json()) as OverpassResponse;
      const results = (payload.elements ?? []).flatMap((element) => {
        const latitude = element.lat ?? element.center?.lat;
        const longitude = element.lon ?? element.center?.lon;
        const name = element.tags?.name?.trim();
        const elementType = element.type;
        const elementId = element.id;
        if (
          !(name && elementType && elementId && typeof latitude === "number" && typeof longitude === "number")
        ) {
          return [];
        }
        const tags = element.tags ?? {};
        const sourceUrl = `https://www.openstreetmap.org/${elementType}/${elementId}`;
        const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
        return [{
          id: resultId("osm", `${elementType}:${elementId}`),
          name,
          category: osmCategory(tags),
          description: tags.description?.trim() || tags.cuisine?.trim() || null,
          address: osmAddress(tags),
          distance: null,
          distanceKm: 0,
          rating: null,
          reviewCount: null,
          openStatus: tags.opening_hours?.trim() || null,
          eventDate: null,
          phone: tags.phone?.trim() || tags["contact:phone"]?.trim() || null,
          website: safeHttpUrl(tags.website || tags["contact:website"]),
          directionsUrl,
          imageUrl: osmImage(tags),
          sourceTitle: "OpenStreetMap",
          sourceUrl,
          latitude,
          longitude,
          attributions: [OSM_ATTRIBUTION],
        } satisfies ExploreResult];
      });
      const unique = Array.from(
        new Map(results.map((result) => [`${result.name.toLocaleLowerCase()}:${result.latitude.toFixed(5)}:${result.longitude.toFixed(5)}`, result])).values(),
      );
      return filterExploreResultsWithinRadius(unique, input.location, input.radiusKm);
    } catch (error) {
      providerError = error;
    }
  }
  throw providerError ?? new Error("Coordinate-aware place search failed.");
}

export type ExplorePlacesSearchInput = {
  categoryQuery: string | null;
  location: ExploreLocationInput;
  query: string;
  radiusKm: number;
};

export async function searchExplorePlaces(input: ExplorePlacesSearchInput) {
  try {
    const googleResults = await searchGooglePlaces(input);
    if (googleResults) {
      return { results: googleResults, source: "google_places" as const };
    }
  } catch (error) {
    console.warn(
      "[explore/places] Google Places unavailable; using OpenStreetMap.",
      error,
    );
  }
  return {
    results: await searchOverpass(input),
    source: "openstreetmap" as const,
  };
}
