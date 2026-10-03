export const EXPLORE_PROVIDER_SETTING_KEY = "explore.placesProvider";
export const EXPLORE_PROVIDERS = ["google", "serper", "serpent", "openstreetmap"] as const;
export type ExploreProvider = (typeof EXPLORE_PROVIDERS)[number];

export function parseExploreProvider(value: unknown): ExploreProvider {
  if (value === undefined || value === null) return "openstreetmap";
  if (typeof value === "string" && EXPLORE_PROVIDERS.includes(value as ExploreProvider)) return value as ExploreProvider;
  throw new Error("invalid_explore_provider");
}

export function exploreProviderConfigured(provider: ExploreProvider, env: Record<string, string | undefined>) {
  const key = { google: "GOOGLE_MAPS_API_KEY", serper: "SERPER_API_KEY", serpent: "SERPENT_API_KEY" };
  return provider === "openstreetmap" || Boolean(env[key[provider]]?.trim());
}

// Keep dispatch independent from provider implementations so a selected provider cannot
// accidentally invoke another paid service when it fails or returns an empty result.
export async function dispatchExploreProvider<T>(provider: ExploreProvider, handlers: Record<ExploreProvider, () => Promise<T>>) {
  return handlers[provider]();
}
