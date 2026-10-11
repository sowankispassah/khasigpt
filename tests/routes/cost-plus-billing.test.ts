import { expect, test } from "@playwright/test";
import {
  calculateBillableInputTokens,
  calculateCostPlusPreview,
  calculateImageTokenProviderCostUsd,
  calculatePlanModelEconomics,
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

test("bills provider context after excluding only the internal system prompt", () => {
  expect(
    calculateBillableInputTokens({
      internalSystemPromptText: "1234567890",
      providerInputTokens: 120,
    })
  ).toBe(117);
  expect(
    calculateBillableInputTokens({
      internalSystemPromptText: "",
      providerInputTokens: 120,
    })
  ).toBe(120);
  // A provider total that grows with the conversation remains billable in
  // full; it is not replaced with a count of only the newest user message.
  expect(
    calculateBillableInputTokens({
      internalSystemPromptText: "1234567890",
      providerInputTokens: 3_412,
    })
  ).toBe(3_409);
  expect(
    calculateBillableInputTokens({
      internalSystemPromptText: "A very long internal prompt",
      providerInputTokens: 2,
    })
  ).toBe(0);
});

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

test("prices each image token modality exactly once", () => {
  const providerCostUsd = calculateImageTokenProviderCostUsd({
    cachedImageInputCostPerMillionUsd: 2,
    cachedImageInputTokens: 100,
    cachedTextInputCostPerMillionUsd: 1.25,
    cachedTextInputTokens: 50,
    imageInputCostPerMillionUsd: 8,
    imageInputTokens: 200,
    imageOutputCostPerMillionUsd: 30,
    imageOutputTokens: 600,
    textInputCostPerMillionUsd: 5,
    textInputTokens: 150,
  });

  expect(providerCostUsd).toBeCloseTo(0.0206125, 10);
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
  const billedUnits = Math.ceil(
    (preview?.customerChargeInr ?? 0) * WALLET_UNITS_PER_INR
  );
  expect(preview?.billedChargeInr).toBeCloseTo(
    billedUnits / WALLET_UNITS_PER_INR,
    8
  );
  expect(preview?.profitInr).toBeCloseTo(
    (preview?.billedChargeInr ?? 0) - (preview?.providerCostInr ?? 0),
    8
  );
  expect(preview?.marginPercent).toBeCloseTo(
    ((preview?.profitInr ?? 0) / (preview?.billedChargeInr ?? 1)) * 100,
    8
  );
  expect(preview?.marginPercent).toBeGreaterThanOrEqual(60);
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

test("scales the configured markup by a plan's bonus credits", () => {
  const basePlan = { priceInPaise: 50_000, tokenAllowance: 250_000 };
  const bulkPlan = { priceInPaise: 100_000, tokenAllowance: 600_000 };

  const base = calculatePlanModelEconomics({
    basePlan,
    inputCostPerMillionUsd: 1,
    markupMultiplier: 4,
    outputCostPerMillionUsd: 4,
    plan: basePlan,
    usdToInr: USD_TO_INR,
  });
  expect(base?.realizedMarkup).toBeCloseTo(4, 10);
  expect(base?.marginPercent).toBeCloseTo(75, 10);
  expect(base?.customerOutputPerMillionInr).toBeCloseTo(4 * USD_TO_INR * 4, 8);

  // 20% more units per rupee: the buyer pays 1/1.2 of the base price.
  const bulk = calculatePlanModelEconomics({
    basePlan,
    inputCostPerMillionUsd: 1,
    markupMultiplier: 4,
    outputCostPerMillionUsd: 4,
    plan: bulkPlan,
    usdToInr: USD_TO_INR,
  });
  expect(bulk?.creditValueRatio).toBeCloseTo(500 / 600, 10);
  expect(bulk?.realizedMarkup).toBeCloseTo(4 / 1.2, 10);
  expect(bulk?.marginPercent).toBeCloseTo((1 - 1.2 / 4) * 100, 10);
  expect(bulk?.customerInputPerMillionInr).toBeCloseTo(
    (USD_TO_INR * 4) / 1.2,
    8
  );

  expect(
    calculatePlanModelEconomics({
      basePlan: null,
      inputCostPerMillionUsd: 1,
      markupMultiplier: 4,
      outputCostPerMillionUsd: 4,
      plan: bulkPlan,
      usdToInr: USD_TO_INR,
    })
  ).toBeNull();
});
