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
