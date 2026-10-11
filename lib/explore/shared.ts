import {
  type FeatureAccessMode,
  parseFeatureAccessMode,
} from "@/lib/feature-access";

export function parseExploreAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, "admin_only");
}

export function isExploreNearMeQuery(value: string) {
  return /\b(near me|nearby|around me|closest|within\s+\d+\s*km)\b/i.test(
    value
  );
}

export function hasExploreExplicitLocation(value: string) {
  return /\b(?:in|near|around|at)\s+[a-z][a-z .'-]{2,80}$/i.test(value);
}

export function extractExploreRadiusKm(value: string) {
  const match = value.match(
    /\b(?:within|inside|up\s+to|less\s+than)\s+(\d{1,2})\s*(?:km|kilomet(?:er|re)s?)\b/i,
  );
  if (!match?.[1]) return null;
  const radius = Number(match[1]);
  return Number.isInteger(radius) && radius >= 1 && radius <= 50
    ? radius
    : null;
}

export function createExploreSearchKey({
  categoryId,
  latitude,
  locationId,
  longitude,
  query,
  radiusKm,
  subcategoryId,
}: {
  categoryId: string | null;
  latitude: number;
  locationId: string;
  longitude: number;
  query: string;
  radiusKm: number;
  subcategoryId: string | null;
}) {
  return [
    locationId,
    latitude.toFixed(5),
    longitude.toFixed(5),
    radiusKm,
    query.trim().toLocaleLowerCase(),
    categoryId ?? "all",
    subcategoryId ?? "all",
  ].join(":");
}
