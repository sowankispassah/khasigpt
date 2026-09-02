export const DEFAULT_CHAT_MARKUP_MULTIPLIER = 4;
export const DEFAULT_IMAGE_MARKUP_MULTIPLIER = 2;
export const DEFAULT_WEB_SEARCH_MARKUP_MULTIPLIER = 3;
export const DEFAULT_LIVE_VOICE_MARKUP_MULTIPLIER = 3;
export const MIN_MARKUP_MULTIPLIER = 1;
export const MAX_MARKUP_MULTIPLIER = 20;

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
  const totalCreditUnits = Math.max(1, Math.ceil(rawTotal - Number.EPSILON));
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
  const profitInr = lineItem.customerChargeInr - providerCostInr;

  return {
    creditUnits: priced.totalCreditUnits,
    credits: priced.totalCreditUnits / walletUnitsPerCredit,
    customerChargeInr: lineItem.customerChargeInr,
    marginPercent:
      lineItem.customerChargeInr > 0
        ? (profitInr / lineItem.customerChargeInr) * 100
        : 0,
    profitInr,
    providerCostInr,
  };
}
