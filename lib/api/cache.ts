export const CACHE_CONTROL = {
  noStore: "no-store",
  privateShort: "private, max-age=15, stale-while-revalidate=60",
  privateMedium: "private, max-age=60, stale-while-revalidate=300",
  publicShort: "public, max-age=30, stale-while-revalidate=300",
  publicMedium: "public, max-age=300, stale-while-revalidate=1800",
} as const;

export function cacheHeaders(value: (typeof CACHE_CONTROL)[keyof typeof CACHE_CONTROL]) {
  return {
    "Cache-Control": value,
  };
}

export function noStoreHeaders() {
  return cacheHeaders(CACHE_CONTROL.noStore);
}
