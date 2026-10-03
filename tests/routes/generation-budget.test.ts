import type { LanguageModelV2 } from "@ai-sdk/provider";
import { expect, test } from "@playwright/test";
import { generateText } from "ai";
import { budgetedModel } from "@/lib/ai/budgeted-model";
import { affordableOutputTokens, type GenerationPricing, inputTokenAllowance } from "@/lib/billing/generation-budget";
import { searchCreditAllowance } from "@/lib/billing/search-budget";

function testModel(doGenerate: LanguageModelV2["doGenerate"]): LanguageModelV2 {
  return { specificationVersion: "v2", provider: "fixture", modelId: "fixture", supportedUrls: {}, doGenerate,
    doStream: async () => { throw new Error("Streaming not used in this test"); } };
}

const pricing: GenerationPricing = { providerKey: "openai", inputCostPerMillionUsd: 1, outputCostPerMillionUsd: 10, markupMultiplier: 4, usdToInr: 100, walletUnitsPerInr: 100, pricingReferencePlanId: "fixture" };

test("one remaining wallet unit cannot start a generation", () => {
  expect(() => affordableOutputTokens({ balance: 1, inputTokens: 100, pricing })).toThrow();
});
test("the output ceiling fits the full input and rounding inside the wallet", () => {
  for (const balance of [200, 1000, 10000]) {
    const limit = affordableOutputTokens({ balance, inputTokens: 1000, pricing });
    const billed = Math.ceil((1000 / 1e6 + limit * 10 / 1e6) * 4 * 100 * 100);
    expect(billed).toBeLessThanOrEqual(balance);
    expect(limit).toBeLessThanOrEqual(4096);
  }
});
test("long history can exhaust admission before output begins", () => {
  expect(() => affordableOutputTokens({ balance: 200, inputTokens: 100000, pricing })).toThrow();
});
test("rejects non-finite prices and honors a smaller requested output limit", () => {
  expect(() => affordableOutputTokens({ balance: 1000, inputTokens: 10, pricing: { ...pricing, outputCostPerMillionUsd: Number.NaN } })).toThrow();
  expect(affordableOutputTokens({ balance: 1000, inputTokens: 10, pricing, requested: 256 })).toBe(256);
});
test("counts multilingual history and refuses an unquoted media estimate", () => {
  const prompt = [{ role: "user" as const, content: [{ type: "text" as const, text: "Ka ktien Khasi — 日本語" }] }];
  expect(inputTokenAllowance(prompt)).toBeGreaterThan(Buffer.byteLength("Ka ktien Khasi — 日本語"));
  const media = [{ role: "user" as const, content: [{ type: "file" as const, mediaType: "image/png", data: new Uint8Array([1]) }] }];
  expect(inputTokenAllowance(media)).toBeNull();
  expect(inputTokenAllowance(media, 100000)).toBe(102048);
});
test("search reserves shopping units and refuses unbounded grounding", () => {
  expect(searchCreditAllowance({ provider: "serper", shopping: true, costPerCallUsd: .01, markup: 3, pricing })).toBe(600);
  expect(() => searchCreditAllowance({ provider: "gemini_grounding", costPerCallUsd: .01, markup: 3, pricing })).toThrow();
});

test("insufficient funds prevent the provider from being called", async () => {
  let calls = 0;
  const provider = testModel( async () => {
    calls += 1;
    return { content: [{ type: "text", text: "hello" }], finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] };
  });
  const model = budgetedModel({ model: provider, provider: "openai", modelId: "fixture", pricing, balance: () => 1 });
  await expect(generateText({ model, prompt: "hello", maxRetries: 0 })).rejects.toThrow();
  expect(calls).toBe(0);
});

test("the adapter receives the reduced output limit", async () => {
  let outputLimit: number | undefined;
  const provider = testModel( async params => {
    outputLimit = params.maxOutputTokens;
    return { content: [{ type: "text", text: "hello" }], finishReason: "stop", usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, warnings: [] };
  });
  const model = budgetedModel({ model: provider, provider: "openai", modelId: "fixture", pricing, balance: () => 200 });
  await generateText({ model, prompt: "hello", maxRetries: 0 });
  expect(outputLimit).toBeGreaterThanOrEqual(128);
  expect(outputLimit).toBeLessThan(4096);
});
