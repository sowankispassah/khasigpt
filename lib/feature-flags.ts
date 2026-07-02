import { cache } from "react";

export type FeatureFlags = Record<string, never>;

async function fetchFeatureFlags(): Promise<FeatureFlags> {
  return {};
}

export const loadFeatureFlags = cache(fetchFeatureFlags);
