import type { WebSearchProvider } from "./types";

export type BillableWebSearchProvider = Exclude<WebSearchProvider, "disabled">;

const SERPER_SHOPPING_BILLING_UNITS_PER_CALL = 2;

export function getWebSearchProviderBillingUnitCount({
  isShoppingSearch,
  provider,
  searchCallCount,
}: {
  isShoppingSearch: boolean;
  provider: WebSearchProvider;
  searchCallCount: number;
}) {
  const normalizedCallCount = Math.max(
    0,
    Math.round(Number.isFinite(searchCallCount) ? searchCallCount : 0)
  );

  if (provider === "serper" && isShoppingSearch) {
    return normalizedCallCount * SERPER_SHOPPING_BILLING_UNITS_PER_CALL;
  }

  return normalizedCallCount;
}

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
