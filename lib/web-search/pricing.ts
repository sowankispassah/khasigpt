import type { WebSearchProvider } from "./types";

export type BillableWebSearchProvider = Exclude<WebSearchProvider, "disabled">;

export function getRequiredWebSearchCostProviders({
  fallbackProvider,
  provider,
}: {
  fallbackProvider: WebSearchProvider;
  provider: WebSearchProvider;
}): BillableWebSearchProvider[] {
  if (provider === "disabled") {
    return [];
  }

  const required = new Set<BillableWebSearchProvider>([provider]);
  if (fallbackProvider !== "disabled") {
    required.add(fallbackProvider);
  }
  return Array.from(required);
}

export function hasValidWebSearchProviderCosts({
  fallbackProvider,
  provider,
  providerCostPerCallUsd,
}: {
  fallbackProvider: WebSearchProvider;
  provider: WebSearchProvider;
  providerCostPerCallUsd: Record<BillableWebSearchProvider, number>;
}) {
  return getRequiredWebSearchCostProviders({
    fallbackProvider,
    provider,
  }).every((requiredProvider) => {
    const cost = providerCostPerCallUsd[requiredProvider];
    return Number.isFinite(cost) && cost > 0;
  });
}
