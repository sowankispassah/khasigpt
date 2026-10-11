export const DEFAULT_CHAT_MARKUP_MULTIPLIER = 4;
export const DEFAULT_IMAGE_MARKUP_MULTIPLIER = 2;
export const DEFAULT_WEB_SEARCH_MARKUP_MULTIPLIER = 3;
export const DEFAULT_LIVE_VOICE_MARKUP_MULTIPLIER = 3;
export const MIN_MARKUP_MULTIPLIER = 1;
export const MAX_MARKUP_MULTIPLIER = 20;

/**
 * Estimate a token count for text when a provider does not expose a separate
 * segment-level count. Provider usage remains the source of truth for the
 * complete request; this is only used to identify the internal system portion
 * that should be excluded from customer billing.
 */
export function estimateTokenCountFromText(text: string) {
  const trimmed = text.trim();
  if (!trimmed.length) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

/**
 * Resolve the customer-billable input for one provider request.
 *
 * The provider-reported input count includes the full prompt sent for this
 * request: prior user/assistant turns, the current user message, and any
 * retrieved or grounded context. Only our internal system/developer prompt is
 * excluded. Because providers do not expose a per-segment system-token count,
 * the system text is estimated with the same deterministic fallback used for
 * other usage recovery paths, then subtracted from the provider total exactly
 * once.
 */
export function calculateBillableInputTokens({
  internalSystemPromptText,
  providerInputTokens,
}: {
  internalSystemPromptText?: string | null;
  providerInputTokens: number;
}) {
  const providerTokens = Number.isFinite(providerInputTokens)
    ? Math.max(0, Math.round(providerInputTokens))
    : 0;
  if (providerTokens === 0) {
    return 0;
  }

  const estimatedInternalTokens = estimateTokenCountFromText(
    internalSystemPromptText ?? ""
  );
  return Math.max(
    0,
    providerTokens - Math.min(providerTokens, estimatedInternalTokens)
  );
}

export type CostPlusCategory =
  | "chat"
  | "image"
  | "web_search"
  | "live_voice";

export type UnpricedCostPlusLineItem = {
  category: CostPlusCategory;
  providerCostUsd: number;
  markupMultiplier: number;
  inputTokens?: number;
  outputTokens?: number;
  unitCount?: number;
  providerKey?: string | null;
  modelConfigId?: string | null;
  imageModelConfigId?: string | null;
  liveVoiceModelConfigId?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PricedCostPlusLineItem = UnpricedCostPlusLineItem & {
  customerChargeInr: number;
  creditUnits: number;
  rawCreditUnits: number;
};

export type CreditPlanForConversion = {
  priceInPaise: number;
  tokenAllowance: number;
};

export type CostPlusPreview = {
  billedChargeInr: number;
  creditUnits: number;
  credits: number;
  customerChargeInr: number;
  marginPercent: number;
  profitInr: number;
  providerCostInr: number;
};

function finiteNonNegative(value: unknown) {
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
}

export function hasCompleteTokenProviderPricing({
  inputCostPerMillionUsd,
  outputCostPerMillionUsd,
}: {
  inputCostPerMillionUsd: unknown;
  outputCostPerMillionUsd: unknown;
}) {
  return (
    finiteNonNegative(inputCostPerMillionUsd) > 0 &&
    finiteNonNegative(outputCostPerMillionUsd) > 0
  );
}

export function hasCompleteUnitProviderPricing(providerCostPerUnitUsd: unknown) {
  return finiteNonNegative(providerCostPerUnitUsd) > 0;
}

export function normalizeMarkupMultiplier(
  value: unknown,
  fallback = MIN_MARKUP_MULTIPLIER
) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < MIN_MARKUP_MULTIPLIER) {
    return fallback;
  }
  return Math.min(numeric, MAX_MARKUP_MULTIPLIER);
}

export function calculateTokenProviderCostUsd({
  inputCostPerMillionUsd,
  inputTokens,
  outputCostPerMillionUsd,
  outputTokens,
}: {
  inputCostPerMillionUsd: number;
  inputTokens: number;
  outputCostPerMillionUsd: number;
  outputTokens: number;
}) {
  const inputCost =
    (finiteNonNegative(inputTokens) / 1_000_000) *
    finiteNonNegative(inputCostPerMillionUsd);
  const outputCost =
    (finiteNonNegative(outputTokens) / 1_000_000) *
    finiteNonNegative(outputCostPerMillionUsd);
  return inputCost + outputCost;
}

export function calculateImageTokenProviderCostUsd({
  cachedImageInputCostPerMillionUsd,
  cachedImageInputTokens,
  cachedTextInputCostPerMillionUsd,
  cachedTextInputTokens,
  imageInputCostPerMillionUsd,
  imageInputTokens,
  imageOutputCostPerMillionUsd,
  imageOutputTokens,
  textInputCostPerMillionUsd,
  textInputTokens,
}: {
  cachedImageInputCostPerMillionUsd: number;
  cachedImageInputTokens: number;
  cachedTextInputCostPerMillionUsd: number;
  cachedTextInputTokens: number;
  imageInputCostPerMillionUsd: number;
  imageInputTokens: number;
  imageOutputCostPerMillionUsd: number;
  imageOutputTokens: number;
  textInputCostPerMillionUsd: number;
  textInputTokens: number;
}) {
  return (
    (finiteNonNegative(textInputTokens) *
      finiteNonNegative(textInputCostPerMillionUsd) +
      finiteNonNegative(imageInputTokens) *
        finiteNonNegative(imageInputCostPerMillionUsd) +
      finiteNonNegative(cachedTextInputTokens) *
        finiteNonNegative(cachedTextInputCostPerMillionUsd) +
      finiteNonNegative(cachedImageInputTokens) *
        finiteNonNegative(cachedImageInputCostPerMillionUsd) +
      finiteNonNegative(imageOutputTokens) *
        finiteNonNegative(imageOutputCostPerMillionUsd)) /
    1_000_000
  );
}

export function calculateUnitProviderCostUsd({
  providerCostPerUnitUsd,
  unitCount,
}: {
  providerCostPerUnitUsd: number;
  unitCount: number;
}) {
  return (
    finiteNonNegative(providerCostPerUnitUsd) *
    Math.max(0, Math.round(finiteNonNegative(unitCount)))
  );
}

export function selectBaseCreditPlan<T extends CreditPlanForConversion>(
  plans: T[]
): T | null {
  return plans.reduce<T | null>((best, candidate) => {
    if (
      !Number.isFinite(candidate.priceInPaise) ||
      candidate.priceInPaise <= 0 ||
      !Number.isFinite(candidate.tokenAllowance) ||
      candidate.tokenAllowance <= 0
    ) {
      return best;
    }
    if (!best) {
      return candidate;
    }
    return candidate.tokenAllowance / candidate.priceInPaise <
      best.tokenAllowance / best.priceInPaise
      ? candidate
      : best;
  }, null);
}

export function calculateWalletUnitsPerInr(
  plan: CreditPlanForConversion | null | undefined
) {
  if (
    !plan ||
    !Number.isFinite(plan.priceInPaise) ||
    plan.priceInPaise <= 0 ||
    !Number.isFinite(plan.tokenAllowance) ||
    plan.tokenAllowance <= 0
  ) {
    return 0;
  }
  return (plan.tokenAllowance * 100) / plan.priceInPaise;
}

export type PlanModelEconomics = {
  /** This plan's INR per credit unit divided by the base plan's (<= 1). */
  creditValueRatio: number;
  /** INR a buyer of this plan effectively pays per 1M input tokens. */
  customerInputPerMillionInr: number;
  /** INR a buyer of this plan effectively pays per 1M output tokens. */
  customerOutputPerMillionInr: number;
  marginPercent: number;
  providerInputPerMillionInr: number;
  providerOutputPerMillionInr: number;
  realizedMarkup: number;
};

/**
 * Charges are converted to wallet units at the base plan's rate, so a buyer of
 * a plan with bonus units pays less INR per unit. The configured markup is
 * therefore scaled by (plan INR per unit / base INR per unit) for that buyer.
 */
export function calculatePlanModelEconomics({
  basePlan,
  inputCostPerMillionUsd,
  markupMultiplier,
  outputCostPerMillionUsd,
  plan,
  usdToInr,
}: {
  basePlan: CreditPlanForConversion | null | undefined;
  inputCostPerMillionUsd: number;
  markupMultiplier: number;
  outputCostPerMillionUsd: number;
  plan: CreditPlanForConversion;
  usdToInr: number;
}): PlanModelEconomics | null {
  const baseUnitsPerInr = calculateWalletUnitsPerInr(basePlan);
  const planUnitsPerInr = calculateWalletUnitsPerInr(plan);
  const safeUsdToInr = finiteNonNegative(usdToInr);
  if (baseUnitsPerInr <= 0 || planUnitsPerInr <= 0 || safeUsdToInr <= 0) {
    return null;
  }
  const creditValueRatio = baseUnitsPerInr / planUnitsPerInr;
  const realizedMarkup =
    normalizeMarkupMultiplier(markupMultiplier) * creditValueRatio;
  const providerInputPerMillionInr =
    finiteNonNegative(inputCostPerMillionUsd) * safeUsdToInr;
  const providerOutputPerMillionInr =
    finiteNonNegative(outputCostPerMillionUsd) * safeUsdToInr;
  return {
    creditValueRatio,
    customerInputPerMillionInr: providerInputPerMillionInr * realizedMarkup,
    customerOutputPerMillionInr: providerOutputPerMillionInr * realizedMarkup,
    marginPercent: (1 - 1 / realizedMarkup) * 100,
    providerInputPerMillionInr,
    providerOutputPerMillionInr,
    realizedMarkup,
  };
}

export function priceCostPlusLineItems({
  lineItems,
  usdToInr,
  walletUnitsPerInr,
}: {
  lineItems: UnpricedCostPlusLineItem[];
  usdToInr: number;
  walletUnitsPerInr: number;
}): { lineItems: PricedCostPlusLineItem[]; totalCreditUnits: number } {
  const safeUsdToInr = finiteNonNegative(usdToInr);
  const safeWalletUnitsPerInr = finiteNonNegative(walletUnitsPerInr);

  const priced = lineItems
    .map((lineItem, index) => {
      const providerCostUsd = finiteNonNegative(lineItem.providerCostUsd);
      const markupMultiplier = normalizeMarkupMultiplier(
        lineItem.markupMultiplier
      );
      const customerChargeInr =
        providerCostUsd * safeUsdToInr * markupMultiplier;
      const rawCreditUnits = customerChargeInr * safeWalletUnitsPerInr;
      return {
        ...lineItem,
        _index: index,
        providerCostUsd,
        markupMultiplier,
        customerChargeInr,
        rawCreditUnits,
        creditUnits: Math.floor(rawCreditUnits),
      };
    })
    .filter((lineItem) => lineItem.providerCostUsd > 0);

  if (
    priced.length === 0 ||
    safeUsdToInr <= 0 ||
    safeWalletUnitsPerInr <= 0
  ) {
    return { lineItems: [], totalCreditUnits: 0 };
  }

  const rawTotal = priced.reduce(
    (total, lineItem) => total + lineItem.rawCreditUnits,
    0
  );
  // Scale the floating-point tolerance to the value; a bare EPSILON is too
  // small at wallet-sized values and can add a unit to an exact integer.
  const totalCreditUnits = Math.max(1, Math.ceil(rawTotal - Math.max(1, rawTotal) * Number.EPSILON * 4));
  let unitsToAllocate =
    totalCreditUnits -
    priced.reduce((total, lineItem) => total + lineItem.creditUnits, 0);

  const byFraction = [...priced].sort((left, right) => {
    const leftFraction = left.rawCreditUnits - Math.floor(left.rawCreditUnits);
    const rightFraction =
      right.rawCreditUnits - Math.floor(right.rawCreditUnits);
    return rightFraction - leftFraction || left._index - right._index;
  });

  for (const lineItem of byFraction) {
    if (unitsToAllocate <= 0) {
      break;
    }
    lineItem.creditUnits += 1;
    unitsToAllocate -= 1;
  }

  return {
    lineItems: priced
      .sort((left, right) => left._index - right._index)
      .map(({ _index: _discarded, ...lineItem }) => lineItem),
    totalCreditUnits,
  };
}

export function calculateCostPlusPreview({
  markupMultiplier,
  providerCostUsd,
  usdToInr,
  walletUnitsPerInr,
  walletUnitsPerCredit,
}: {
  markupMultiplier: number;
  providerCostUsd: number;
  usdToInr: number;
  walletUnitsPerInr: number;
  walletUnitsPerCredit: number;
}): CostPlusPreview | null {
  const priced = priceCostPlusLineItems({
    lineItems: [{ category: "chat", markupMultiplier, providerCostUsd }],
    usdToInr,
    walletUnitsPerInr,
  });
  const [lineItem] = priced.lineItems;
  if (
    !lineItem ||
    priced.totalCreditUnits <= 0 ||
    !Number.isFinite(walletUnitsPerCredit) ||
    walletUnitsPerCredit <= 0
  ) {
    return null;
  }

  const providerCostInr = lineItem.providerCostUsd * usdToInr;
  // Whole credit units are deducted, so small charges are rounded up. Profit
  // and margin use the amount actually billed at the base recharge rate.
  const billedChargeInr = priced.totalCreditUnits / walletUnitsPerInr;
  const profitInr = billedChargeInr - providerCostInr;

  return {
    billedChargeInr,
    creditUnits: priced.totalCreditUnits,
    credits: priced.totalCreditUnits / walletUnitsPerCredit,
    customerChargeInr: lineItem.customerChargeInr,
    marginPercent:
      billedChargeInr > 0 ? (profitInr / billedChargeInr) * 100 : 0,
    profitInr,
    providerCostInr,
  };
}
