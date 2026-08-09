import "server-only";

import type { CurrentInfoDecision, CurrentInfoIntent } from "@/lib/web-search/detection";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_WEATHER_LOCATION = {
  name: "Shillong, Meghalaya, India",
  latitude: 25.5788,
  longitude: 91.8933,
} as const;

const OPEN_METEO_GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const FETCH_TIMEOUT_MS = 7_000;

type GeocodingResult = {
  name?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
  country?: unknown;
  admin1?: unknown;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
};

type WeatherResponse = {
  timezone?: unknown;
  current?: Record<string, unknown>;
  current_units?: Record<string, unknown>;
};

type ResolvedLocation = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string | null;
};

export type LiveCurrentInfo = {
  intent: CurrentInfoIntent;
  contextText: string;
  locationName: string;
  timezone: string;
  fetchedAt: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function createRequestSignal(parentSignal?: AbortSignal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const abortParent = () => controller.abort();
  parentSignal?.addEventListener("abort", abortParent, { once: true });

  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortParent);
    },
  };
}

async function fetchJson<T>(url: URL, parentSignal?: AbortSignal): Promise<T> {
  const requestSignal = createRequestSignal(parentSignal);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: requestSignal.signal,
    });
    if (!response.ok) {
      throw new Error(`Live information provider returned HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  } finally {
    requestSignal.cleanup();
  }
}

async function geocodeLocation(
  locationQuery: string,
  signal?: AbortSignal,
): Promise<ResolvedLocation> {
  const url = new URL(OPEN_METEO_GEOCODING_URL);
  url.searchParams.set("name", locationQuery);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  const data = await fetchJson<GeocodingResponse>(url, signal);
  const result = data.results?.[0];
  if (
    !result ||
    !isFiniteNumber(result.latitude) ||
    !isFiniteNumber(result.longitude)
  ) {
    throw new Error("The requested location could not be resolved.");
  }

  const name = typeof result.name === "string" ? result.name.trim() : "";
  const region = typeof result.admin1 === "string" ? result.admin1.trim() : "";
  const country = typeof result.country === "string" ? result.country.trim() : "";

  return {
    name: [name, region, country].filter(Boolean).join(", ") || locationQuery,
    latitude: result.latitude,
    longitude: result.longitude,
    timezone: typeof result.timezone === "string" ? result.timezone : null,
  };
}

function formatLocalDate(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "full",
    timeStyle: "long",
    timeZone: timezone,
  }).format(date);
}

function formatTemperature(value: unknown, unit: unknown) {
  if (!isFiniteNumber(value)) {
    return "unavailable";
  }
  return `${value.toFixed(1)}${typeof unit === "string" ? unit : "°C"}`;
}

function formatNumber(value: unknown, unit: unknown) {
  if (!isFiniteNumber(value)) {
    return "unavailable";
  }
  return `${value.toFixed(1)}${typeof unit === "string" ? ` ${unit}` : ""}`;
}

function describeWeatherCode(value: unknown) {
  if (!isFiniteNumber(value)) {
    return "Current conditions unavailable";
  }
  if (value === 0) return "Clear sky";
  if ([1, 2, 3].includes(value)) return "Partly cloudy to overcast";
  if ([45, 48].includes(value)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(value)) return "Drizzle";
  if ([61, 63, 65, 66, 67].includes(value)) return "Rain";
  if ([71, 73, 75, 77].includes(value)) return "Snow";
  if ([80, 81, 82].includes(value)) return "Rain showers";
  if ([85, 86].includes(value)) return "Snow showers";
  if ([95, 96, 99].includes(value)) return "Thunderstorm";
  return "Current conditions unavailable";
}

async function getCurrentTimeInfo(
  locationQuery: string | null,
  signal?: AbortSignal,
): Promise<LiveCurrentInfo> {
  const location = locationQuery
    ? await geocodeLocation(locationQuery, signal)
    : {
        name: "India",
        latitude: 20.5937,
        longitude: 78.9629,
        timezone: DEFAULT_TIMEZONE,
      };
  const timezone = location.timezone || DEFAULT_TIMEZONE;
  const now = new Date();
  const formatted = formatLocalDate(now, timezone);

  return {
    intent: "time",
    locationName: location.name,
    timezone,
    fetchedAt: now.toISOString(),
    contextText: [
      "Trusted live current-time context from the server clock:",
      `Location: ${location.name}`,
      `Time zone: ${timezone}`,
      `Current local date and time: ${formatted}`,
      `UTC timestamp: ${now.toISOString()}`,
      "Answer the user's time question using these exact values only. Do not estimate or use model memory.",
    ].join("\n"),
  };
}

async function getCurrentWeatherInfo({
  decision,
  latitude,
  longitude,
  city,
  country,
  signal,
}: {
  decision: CurrentInfoDecision;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  signal?: AbortSignal;
}): Promise<LiveCurrentInfo> {
  const resolvedLocation = decision.locationQuery
    ? await geocodeLocation(decision.locationQuery, signal)
    : isFiniteNumber(latitude) && isFiniteNumber(longitude)
      ? {
          name: [city, country].filter(Boolean).join(", ") || "Your detected location",
          latitude,
          longitude,
          timezone: null,
        }
      : {
          ...DEFAULT_WEATHER_LOCATION,
          timezone: DEFAULT_TIMEZONE,
        };

  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(resolvedLocation.latitude));
  url.searchParams.set("longitude", String(resolvedLocation.longitude));
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "apparent_temperature",
      "relative_humidity_2m",
      "precipitation",
      "rain",
      "weather_code",
      "wind_speed_10m",
    ].join(","),
  );
  url.searchParams.set("timezone", "auto");
  const data = await fetchJson<WeatherResponse>(url, signal);
  const current = data.current;
  if (!current || typeof current !== "object") {
    throw new Error("The weather provider returned no current conditions.");
  }

  const timezone =
    (typeof data.timezone === "string" && data.timezone) ||
    resolvedLocation.timezone ||
    DEFAULT_TIMEZONE;
  const fetchedAt = new Date().toISOString();
  const units = data.current_units ?? {};
  const observedAt =
    typeof current.time === "string" ? current.time : formatLocalDate(new Date(), timezone);

  return {
    intent: "weather",
    locationName: resolvedLocation.name,
    timezone,
    fetchedAt,
    contextText: [
      "Trusted live current-weather context from Open-Meteo:",
      `Location: ${resolvedLocation.name}`,
      `Time zone: ${timezone}`,
      `Observed local time: ${observedAt}`,
      `Temperature: ${formatTemperature(current.temperature_2m, units.temperature_2m)}`,
      `Feels like: ${formatTemperature(current.apparent_temperature, units.apparent_temperature)}`,
      `Relative humidity: ${formatNumber(current.relative_humidity_2m, units.relative_humidity_2m)}`,
      `Precipitation: ${formatNumber(current.precipitation, units.precipitation)}`,
      `Rain: ${formatNumber(current.rain, units.rain)}`,
      `Wind: ${formatNumber(current.wind_speed_10m, units.wind_speed_10m)}`,
      `Conditions: ${describeWeatherCode(current.weather_code)}`,
      `Retrieved at: ${fetchedAt}`,
      "Answer the user's weather question using these exact values only. Do not estimate, invent a forecast, or use model memory.",
    ].join("\n"),
  };
}

export async function getLiveCurrentInfo({
  decision,
  latitude,
  longitude,
  city,
  country,
  signal,
}: {
  decision: CurrentInfoDecision;
  latitude?: number;
  longitude?: number;
  city?: string;
  country?: string;
  signal?: AbortSignal;
}): Promise<LiveCurrentInfo | null> {
  if (!decision.intent) {
    return null;
  }
  if (decision.intent === "time") {
    return getCurrentTimeInfo(decision.locationQuery, signal);
  }
  return getCurrentWeatherInfo({
    decision,
    latitude,
    longitude,
    city,
    country,
    signal,
  });
}
