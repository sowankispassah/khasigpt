import { cache } from "react";

import { getAppSetting } from "@/lib/db/queries";

export type FeatureFlags = {
  artifactsEnabled: boolean;
};

export async function fetchFeatureFlags(): Promise<FeatureFlags> {
  try {
    const artifactsEnabled =
      (await getAppSetting<boolean>("artifactsEnabled")) ?? true;

    return {
      artifactsEnabled,
    };
  } catch (error) {
    console.warn(
      "Failed to load feature flags from the database, using defaults.",
      error
    );

    return {
      artifactsEnabled: true,
    };
  }
}

export const loadFeatureFlags = cache(fetchFeatureFlags);
