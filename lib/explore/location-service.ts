import "server-only";

import { isInsideMeghalaya } from "@/lib/explore/geo";
import type { ExploreLocationInput } from "@/lib/explore/types";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const REQUEST_TIMEOUT_MS = 8_000;
const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "Accept-Language": "en",
  Referer: "https://khasigpt.com/explore",
  "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)",
};

type NominatimAddress = Record<string, string | undefined> & {
  country_code?: string;
  state?: string;
};

type NominatimResult = {
  address?: NominatimAddress;
  display_name?: string;
  lat?: string;
  lon?: string;
  osm_id?: number;
  osm_type?: string;
  place_id?: number;
};

type GoogleGeocodeResult = {
  address_components?: Array<{
    long_name?: string;
    types?: string[];
  }>;
  formatted_address?: string;
  geometry?: { location?: { lat?: number; lng?: number } };
  place_id?: string;
};

type GoogleGeocodeResponse = {
  error_message?: string;
  results?: GoogleGeocodeResult[];
  status?: string;
};

export class ExploreLocationError extends Error {
  constructor(
    readonly code:
      | "location_not_found"
      | "location_outside_meghalaya"
      | "location_provider_unavailable",
    message: string,
  ) {
    super(message);
  }
}

async function fetchJson<T>(url: URL, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      cache: "force-cache",
      next: { revalidate: 86_400 },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Location provider returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function getGoogleMapsKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

function googleAdministrativeArea(result: GoogleGeocodeResult) {
  return result.address_components?.find((component) =>
    component.types?.includes("administrative_area_level_1"),
  )?.long_name;
}

function googleLocality(result: GoogleGeocodeResult) {
  const preferred = [
    "locality",
    "sublocality",
    "administrative_area_level_3",
    "administrative_area_level_2",
  ];
  for (const type of preferred) {
    const value = result.address_components?.find((component) =>
      component.types?.includes(type),
    )?.long_name;
    if (value?.trim()) return value.trim();
  }
  return null;
}

function compactLabel(address: NominatimAddress | undefined, fallback: string) {
  const locality =
    address?.village ||
    address?.town ||
    address?.city ||
    address?.municipality ||
    address?.suburb ||
    address?.county;
  return [locality, address?.state]
    .filter((value, index, values): value is string =>
      Boolean(value?.trim()) && values.indexOf(value) === index,
    )
    .join(", ") || fallback;
}

function assertMeghalaya(
  latitude: number,
  longitude: number,
  state: string | undefined,
) {
  if (
    state?.trim().toLocaleLowerCase() === "meghalaya" ||
    (!state && isInsideMeghalaya({ latitude, longitude }))
  ) {
    return;
  }
  throw new ExploreLocationError(
    "location_outside_meghalaya",
    "Choose a location within Meghalaya.",
  );
}

async function geocodeWithGoogle(query: string) {
  const key = getGoogleMapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", `${query}, Meghalaya, India`);
  url.searchParams.set("components", "country:IN|administrative_area:Meghalaya");
  url.searchParams.set("key", key);
  const payload = await fetchJson<GoogleGeocodeResponse>(url);
  if (payload.status !== "OK") return null;
  const result = payload.results?.[0];
  const latitude = result?.geometry?.location?.lat;
  const longitude = result?.geometry?.location?.lng;
  if (!(typeof latitude === "number" && typeof longitude === "number" && result)) {
    return null;
  }
  const state = googleAdministrativeArea(result);
  assertMeghalaya(latitude, longitude, state);
  return {
    id: `google:${result.place_id ?? `${latitude},${longitude}`}`,
    label:
      [googleLocality(result), state].filter(Boolean).join(", ") ||
      result.formatted_address ||
      query,
    latitude,
    longitude,
    accuracy: null,
    source: "manual",
  } satisfies ExploreLocationInput;
}

async function reverseWithGoogle(
  latitude: number,
  longitude: number,
  accuracy: number | null,
) {
  const key = getGoogleMapsKey();
  if (!key) return null;
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", `${latitude},${longitude}`);
  url.searchParams.set("key", key);
  const payload = await fetchJson<GoogleGeocodeResponse>(url);
  if (payload.status !== "OK") return null;
  const result = payload.results?.[0];
  if (!result) return null;
  const state = googleAdministrativeArea(result);
  assertMeghalaya(latitude, longitude, state);
  return {
    id: `gps:${result.place_id ?? `${latitude.toFixed(5)},${longitude.toFixed(5)}`}`,
    label:
      [googleLocality(result), state].filter(Boolean).join(", ") ||
      result.formatted_address ||
      "Current location",
    latitude,
    longitude,
    accuracy,
    source: "gps",
  } satisfies ExploreLocationInput;
}

async function geocodeWithNominatim(query: string) {
  const url = new URL("/search", NOMINATIM_BASE_URL);
  url.searchParams.set("q", `${query}, Meghalaya`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("limit", "5");
  const payload = await fetchJson<NominatimResult[]>(url, {
    headers: NOMINATIM_HEADERS,
  });
  for (const result of payload) {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (!(Number.isFinite(latitude) && Number.isFinite(longitude))) continue;
    try {
      assertMeghalaya(latitude, longitude, result.address?.state);
      return {
        id: `osm:${result.osm_type ?? "place"}:${result.osm_id ?? result.place_id ?? `${latitude},${longitude}`}`,
        label: compactLabel(result.address, result.display_name || query),
        latitude,
        longitude,
        accuracy: null,
        source: "manual",
      } satisfies ExploreLocationInput;
    } catch (error) {
      if (!(error instanceof ExploreLocationError)) throw error;
    }
  }
  return null;
}

async function reverseWithNominatim(
  latitude: number,
  longitude: number,
  accuracy: number | null,
) {
  const url = new URL("/reverse", NOMINATIM_BASE_URL);
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "14");
  const result = await fetchJson<NominatimResult>(url, {
    headers: NOMINATIM_HEADERS,
  });
  assertMeghalaya(latitude, longitude, result.address?.state);
  return {
    id: `gps:osm:${result.osm_type ?? "place"}:${result.osm_id ?? result.place_id ?? `${latitude.toFixed(5)},${longitude.toFixed(5)}`}`,
    label: compactLabel(result.address, result.display_name || "Current location"),
    latitude,
    longitude,
    accuracy,
    source: "gps",
  } satisfies ExploreLocationInput;
}

export async function resolveManualExploreLocation(query: string) {
  try {
    const normalized = query.trim();
    const result =
      (await geocodeWithGoogle(normalized)) ??
      (await geocodeWithNominatim(normalized));
    if (!result) {
      throw new ExploreLocationError(
        "location_not_found",
        "We couldn't find that location in Meghalaya.",
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ExploreLocationError) throw error;
    console.error("[explore/location] Manual geocoding failed.", error);
    throw new ExploreLocationError(
      "location_provider_unavailable",
      "Location search is temporarily unavailable. Please try again.",
    );
  }
}

export async function reverseGeocodeExploreLocation({
  accuracy,
  latitude,
  longitude,
}: {
  accuracy: number | null;
  latitude: number;
  longitude: number;
}) {
  try {
    const normalizedLatitude = Number(latitude.toFixed(5));
    const normalizedLongitude = Number(longitude.toFixed(5));
    return (
      (await reverseWithGoogle(
        normalizedLatitude,
        normalizedLongitude,
        accuracy,
      )) ??
      (await reverseWithNominatim(
        normalizedLatitude,
        normalizedLongitude,
        accuracy,
      ))
    );
  } catch (error) {
    if (error instanceof ExploreLocationError) throw error;
    console.error("[explore/location] Reverse geocoding failed.", error);
    throw new ExploreLocationError(
      "location_provider_unavailable",
      "We couldn't identify your current area. Please try again or enter it manually.",
    );
  }
}
