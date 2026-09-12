import { ChatSDKError } from "@/lib/errors";
import type { WebSearchProvider } from "@/lib/web-search/types";
import type { GenerationPricing } from "./generation-budget";

export function searchCreditAllowance({ provider, shopping = false, costPerCallUsd, markup, pricing }: {
  provider: WebSearchProvider;
  shopping?: boolean;
  costPerCallUsd: number;
  markup: number;
  pricing: Pick<GenerationPricing, "usdToInr" | "walletUnitsPerInr">;
}) {
  // This adapter executes exactly one HTTP search. Grounding can perform an
  // unbounded number of internal searches; a prompt instruction is not a cap.
  // Let the caller's existing fallback run without starting that paid request.
  if (provider !== "serper") throw new ChatSDKError("bad_request:configuration");
  if ([costPerCallUsd, markup, pricing.usdToInr, pricing.walletUnitsPerInr].some(value => !Number.isFinite(value) || value <= 0)) throw new ChatSDKError("bad_request:configuration");
  return Math.ceil(costPerCallUsd * (shopping ? 2 : 1) * markup * pricing.usdToInr * pricing.walletUnitsPerInr);
}
