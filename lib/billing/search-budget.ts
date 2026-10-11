import { ChatSDKError } from "@/lib/errors";
import type { WebSearchProvider } from "@/lib/web-search/types";
import type { GenerationPricing } from "./generation-budget";

export function searchCreditAllowance({ provider, shopping = false, costPerCallUsd, markup, pricing, groundingAdmission }: {
  provider: WebSearchProvider;
  shopping?: boolean;
  costPerCallUsd: number;
  markup: number;
  pricing: Pick<GenerationPricing, "usdToInr" | "walletUnitsPerInr">;
  groundingAdmission?: { maximumProviderCostUsd: number };
}) {
  // Reserve the aggregate cap for grounding or the optional Serpent product
  // lookup before dispatch. A prompt instruction alone is not a billing cap.
  if ((provider === "gemini_grounding" || provider === "serpent") && groundingAdmission) {
    if ([groundingAdmission.maximumProviderCostUsd, markup, pricing.usdToInr, pricing.walletUnitsPerInr].some(value => !Number.isFinite(value) || value <= 0)) throw new ChatSDKError("bad_request:configuration");
    return Math.ceil(groundingAdmission.maximumProviderCostUsd * markup * pricing.usdToInr * pricing.walletUnitsPerInr);
  }
  if (provider !== "serper" && provider !== "serpent") throw new ChatSDKError("bad_request:configuration");
  if ([costPerCallUsd, markup, pricing.usdToInr, pricing.walletUnitsPerInr].some(value => !Number.isFinite(value) || value <= 0)) throw new ChatSDKError("bad_request:configuration");
  return Math.ceil(costPerCallUsd * (shopping && provider === "serper" ? 2 : 1) * markup * pricing.usdToInr * pricing.walletUnitsPerInr);
}
