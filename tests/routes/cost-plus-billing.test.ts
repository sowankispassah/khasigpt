import { expect, test } from "@playwright/test";
import {
  calculateCostPlusPreview,
  calculateTokenProviderCostUsd,
  calculateUnitProviderCostUsd,
  calculateWalletUnitsPerInr,
  hasCompleteTokenProviderPricing,
  hasCompleteUnitProviderPricing,
  priceCostPlusLineItems,
  selectBaseCreditPlan,
} from "@/lib/billing/cost-plus";
import { TOKENS_PER_CREDIT } from "@/lib/constants";

const USD_TO_INR = 95.12;
// ₹500 for 2,500 displayed credits establishes ₹0.20 per credit. Higher
// recharge bundles add bonus credits without changing this base conversion.
const WALLET_UNITS_PER_INR = 500;

test("treats zero or missing provider costs as incomplete pricing", () => {
  expect(
    hasCompleteTokenProviderPricing({
      inputCostPerMillionUsd: 1,
      outputCostPerMillionUsd: 5,
    })
  ).toBe(true);
  expect(
    hasCompleteTokenProviderPricing({
      inputCostPerMillionUsd: 0,
      outputCostPerMillionUsd: 5,
    })
  ).toBe(false);
  expect(hasCompleteUnitProviderPricing(0.014)).toBe(true);
  expect(hasCompleteUnitProviderPricing(0)).toBe(false);
});

test("uses the base pack conversion while keeping larger packs as bonuses", () => {
  const basePlan = selectBaseCreditPlan([
    { name: "Starter", priceInPaise: 50_000, tokenAllowance: 250_000 },
    { name: "Plus", priceInPaise: 100_000, tokenAllowance: 600_000 },
    { name: "Max", priceInPaise: 200_000, tokenAllowance: 1_500_000 },
  ]);

  expect(basePlan?.name).toBe("Starter");
  expect(calculateWalletUnitsPerInr(basePlan)).toBe(WALLET_UNITS_PER_INR);
});

test("prices input and output tokens independently", () => {
  const providerCostUsd = calculateTokenProviderCostUsd({
    inputCostPerMillionUsd: 1,
    inputTokens: 10_000,
    outputCostPerMillionUsd: 5,
    outputTokens: 2_000,
  });

  expect(providerCostUsd).toBeCloseTo(0.02, 8);
  const charge = priceCostPlusLineItems({
    lineItems: [{ category: "chat", markupMultiplier: 4, providerCostUsd }],
    usdToInr: USD_TO_INR,
    walletUnitsPerInr: WALLET_UNITS_PER_INR,
  });

  expect(charge.totalCreditUnits).toBe(3805);
});

test("prices image output and web search by actual billable units", () => {
  const imageCost = calculateUnitProviderCostUsd({
    providerCostPerUnitUsd: 0.0336,
    unitCount: 1,
  });
  const searchCost = calculateUnitProviderCostUsd({
    providerCostPerUnitUsd: 0.014,
    unitCount: 1,
  });

  expect(
    priceCostPlusLineItems({
      lineItems: [
        { category: "image", markupMultiplier: 2, providerCostUsd: imageCost },
      ],
      usdToInr: USD_TO_INR,
      walletUnitsPerInr: WALLET_UNITS_PER_INR,
    }).totalCreditUnits
  ).toBe(3197);
  expect(
    priceCostPlusLineItems({
      lineItems: [
        {
          category: "web_search",
          markupMultiplier: 3,
          providerCostUsd: searchCost,
        },
      ],
      usdToInr: USD_TO_INR,
      walletUnitsPerInr: WALLET_UNITS_PER_INR,
    }).totalCreditUnits
  ).toBe(1998);
});

test("uses the exact billed credit rounding in the live profit preview", () => {
  const preview = calculateCostPlusPreview({
    markupMultiplier: 2.5,
    providerCostUsd: 0.0336,
    usdToInr: USD_TO_INR,
    walletUnitsPerCredit: TOKENS_PER_CREDIT,
    walletUnitsPerInr: WALLET_UNITS_PER_INR,
  });

  expect(preview).not.toBeNull();
  expect(preview?.providerCostInr).toBeCloseTo(3.196_032, 8);
  expect(preview?.customerChargeInr).toBeCloseTo(
    (preview?.providerCostInr ?? 0) * 2.5,
    8
  );
  expect(preview?.profitInr).toBeCloseTo(
    (preview?.providerCostInr ?? 0) * 1.5,
    8
  );
  expect(preview?.marginPercent).toBeCloseTo(60, 8);
  expect(preview?.credits).toBe(
    Math.ceil((preview?.customerChargeInr ?? 0) * WALLET_UNITS_PER_INR) /
      TOKENS_PER_CREDIT
  );
});

test("rounds once after combining independently marked-up line items", () => {
  const charge = priceCostPlusLineItems({
    lineItems: [
      { category: "chat", markupMultiplier: 4, providerCostUsd: 0.02 },
      { category: "web_search", markupMultiplier: 3, providerCostUsd: 0.014 },
    ],
    usdToInr: USD_TO_INR,
    walletUnitsPerInr: WALLET_UNITS_PER_INR,
  });

  expect(charge.totalCreditUnits).toBe(5803);
  expect(
    charge.lineItems.reduce((total, lineItem) => total + lineItem.creditUnits, 0)
  ).toBe(5803);
});
