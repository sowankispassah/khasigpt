import type { LanguageModelV2CallOptions } from "@ai-sdk/provider";
import { ChatSDKError } from "@/lib/errors";

export type GenerationPricing = {
  providerKey: string;
  inputCostPerMillionUsd: number;
  outputCostPerMillionUsd: number;
  markupMultiplier: number;
  usdToInr: number;
  walletUnitsPerInr: number;
  pricingReferencePlanId: string;
};

// Text uses a conservative UTF-8 byte allowance, including the full system
// prompt, history and retrieved context. This deliberately does not use the
// four-characters-per-token display estimate for financial admission.
export function inputTokenAllowance(prompt: LanguageModelV2CallOptions["prompt"], imageAllowance?: number) {
  let tokens = 1024;
  for (const message of prompt) {
    tokens += 1024;
    if (typeof message.content === "string") {
      tokens += Buffer.byteLength(message.content, "utf8");
      continue;
    }
    for (const part of message.content) {
      if (part.type === "file") {
        // Media needs provider-specific counting; never guess its cost here.
        if (!part.mediaType.startsWith("image/") || imageAllowance === undefined) return null;
        tokens += imageAllowance;
        continue;
      }
      tokens += Buffer.byteLength(JSON.stringify(part), "utf8");
    }
  }
  return tokens;
}

export function affordableOutputTokens({ balance, inputTokens, pricing, requested = 4096 }: {
  balance: number;
  inputTokens: number;
  pricing: GenerationPricing;
  requested?: number;
}) {
  const numbers = [balance, pricing.inputCostPerMillionUsd, pricing.outputCostPerMillionUsd, pricing.markupMultiplier, pricing.usdToInr, pricing.walletUnitsPerInr];
  if (numbers.some(value => !Number.isFinite(value) || value <= 0) || !Number.isSafeInteger(inputTokens) || inputTokens < 0) {
    throw new ChatSDKError("bad_request:configuration");
  }
  const conversion = pricing.markupMultiplier * pricing.usdToInr * pricing.walletUnitsPerInr / 1_000_000;
  // Keep one full credit unit for rounding, never round a spending limit up.
  const available = Math.floor(balance) - 1 - inputTokens * pricing.inputCostPerMillionUsd * conversion;
  const limit = Math.min(4096, Math.floor(requested), Math.floor(available / (pricing.outputCostPerMillionUsd * conversion)));
  if (!Number.isSafeInteger(limit) || limit < 128) {
    throw new ChatSDKError("payment_required:credits");
  }
  return limit;
}
