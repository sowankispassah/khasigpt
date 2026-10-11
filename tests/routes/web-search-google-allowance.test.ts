import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { searchCreditAllowance } from "@/lib/billing/search-budget";
import * as policy from "@/lib/web-search/google-allowance-policy";

function load(file: string, mocks: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Buffer, Date, URL, console: { warn: () => {} }, process: { env: { GOOGLE_API_KEY: "private-test-key" } }, require: (name: string) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; }, ...extra });
  return exports;
}

test("monthly policy resets on Pacific calendar boundaries and missing settings preserve fixed routing", () => {
  expect(policy.groundingBillingMonth(new Date("2026-11-01T06:59:59Z"))).toBe("2026-10");
  expect(policy.groundingBillingMonth(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11");
  expect(policy.groundingBillingMonth(new Date("2026-02-01T07:59:59Z"))).toBe("2026-01");
  const initial = policy.parseGoogleSearchAllowance(undefined, "2026-10");
  expect(initial.enabled).toBe(false);
  expect(policy.parseGoogleSearchAllowance({ ...initial, enabled: true, used: 4800, reserved: 10, externalUsage: 90 }, "2026-11")).toMatchObject({ enabled: true, month: "2026-11", used: 0, reserved: 0, externalUsage: 0 });
  expect(() => policy.parseGoogleSearchAllowance({ ...initial, used: -1 })).toThrow();
  expect(() => policy.parseGoogleSearchAllowance({ ...initial, model: "gemini-2.5-flash" })).toThrow();
  expect(() => policy.parseGoogleSearchAllowance({ ...initial, limit: 6000 })).toThrow();
  expect(policy.googleSearchAllowanceInputSchema.safeParse(initial).success).toBe(false);
});

function runnerHarness(options: { exhausted?: boolean; disabled?: boolean; readError?: boolean; reserveError?: boolean; settleError?: boolean; paidQueries?: number } = {}) {
  const calls: string[] = [];
  const settlements: number[] = [];
  const allowance = { ...policy.parseGoogleSearchAllowance(undefined), enabled: !options.disabled };
  const runner = load("lib/web-search/google-allowance-runner.ts", {
    "server-only": {}, "./google-allowance-policy": policy,
    "./google-allowance": {
      readGoogleSearchAllowance: async () => { if (options.readError) throw new Error("db unavailable"); return allowance; },
      reserveGoogleSearchAllowance: async () => { calls.push("reserve"); if (options.reserveError) throw new Error("db unavailable"); return options.exhausted ? null : { month: policy.groundingBillingMonth(), queries: 10 }; },
      settleGoogleSearchAllowance: async (_month: string, queries: number) => { settlements.push(queries); if (options.settleError) throw new Error("db unavailable"); return options.paidQueries ?? 0; },
    },
  });
  return { runner, calls, settlements, allowance };
}
test("exhaustion and failed quota reservations prevent both Google calls and wallet reservations", async () => {
  for (const options of [{ exhausted: true }, { reserveError: true }]) {
    const h = runnerHarness(options);
    const failure = await h.runner.prepareGoogleGrounding("private query", () => h.calls.push("wallet")).catch((error: any) => error);
    expect(failure).toBeInstanceOf(policy.GoogleSearchAllowanceError);
    expect(failure.fallbackProvider).toBe("serper"); expect(h.calls).toEqual(["reserve"]);
  }
  const h = runnerHarness({ readError: true });
  await expect(h.runner.prepareGoogleGrounding("private query")).rejects.toThrow("tracking_unavailable"); expect(h.calls).toEqual([]);
});
test("credit rejection releases a confirmed unused reservation and ordinary provider failures keep uncertain slots", async () => {
  const h = runnerHarness();
  await expect(h.runner.prepareGoogleGrounding("private query", () => { throw new Error("insufficient credits"); })).rejects.toThrow("insufficient credits");
  expect(h.settlements).toEqual([0]);
  const attempt = await h.runner.prepareGoogleGrounding("private query");
  expect(attempt.policy.model).toBe("gemini-3.8-flash");
  expect(h.settlements).toEqual([0]); // No automatic refund after dispatch.
});
test("Google generation, including thinking, is billed separately while free searches have no search fee", async () => {
  const h = runnerHarness(); const attempt = await h.runner.prepareGoogleGrounding("query");
  expect(await h.runner.finishGoogleGrounding(attempt, 12, 1000, 2000)).toBeCloseTo(0.00825);
  expect(h.settlements).toEqual([12]);
  expect(await h.runner.finishGoogleGrounding(attempt, null, 1000, 2000)).toBeCloseTo(0.00825);
  expect(h.settlements).toEqual([12]);
  const over = runnerHarness({ paidQueries: 2 });
  expect(await over.runner.finishGoogleGrounding(await over.runner.prepareGoogleGrounding("query"), 12, 1000, 2000)).toBeCloseTo(0.03625);
  const uncertain = runnerHarness({ settleError: true });
  expect(await uncertain.runner.finishGoogleGrounding(await uncertain.runner.prepareGoogleGrounding("query"), 12, 1000, 2000)).toBeCloseTo(0.00825);
});
test("paid Google calls require the service's allowance admission; fixed Serper billing remains unchanged", () => {
  const pricing = { usdToInr: 100, walletUnitsPerInr: 1000 };
  expect(() => searchCreditAllowance({ provider: "gemini_grounding", costPerCallUsd: 0.014, markup: 3, pricing })).toThrow();
  expect(searchCreditAllowance({ provider: "gemini_grounding", costPerCallUsd: 0, markup: 3, pricing, groundingAdmission: { maximumProviderCostUsd: 0.15 } })).toBe(45000);
  expect(searchCreditAllowance({ provider: "serper", shopping: true, costPerCallUsd: 0.001, markup: 3, pricing })).toBe(600);
});
test("Google service counts every unique executed query rather than truncating to the prompt limit", async () => {
  const queries = Array.from({ length: 12 }, (_, index) => `query ${index}`);
  const requests: any[] = []; const counts: number[] = [];
  const runner = { prepareGoogleGrounding: async (_prompt: string, before: any) => { before?.({ maximumProviderCostUsd: 0.15 }); return { policy: { model: "gemini-3.8-flash" }, maximumBillableCostUsd: 0.15 }; }, finishGoogleGrounding: async (_attempt: any, queries: number) => { counts.push(queries); return 0.008; } };
  const service = load("lib/web-search/service.ts", {
    "server-only": {}, "@google/genai": { ThinkingLevel: { LOW: "LOW" }, GoogleGenAI: class { models = { generateContent: async (request: any) => { requests.push(request); return { text: "Grounded answer", candidates: [{ groundingMetadata: { webSearchQueries: [...queries, queries[0]], groundingChunks: [{ web: { uri: "https://example.com/source", title: "Source" } }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 1000, thoughtsTokenCount: 1000 } }; } }; } },
    "./google-allowance-runner": runner, "./google-allowance-policy": policy,
    "./news-enrichment": {}, "./news-results": {}, "./pricing": { getWebSearchProviderBillingUnitCount: () => 1 }, "./product-enrichment": {}, "./products": {}, "./serpent-search": {}, "./serper": {}, "./youtube": {},
  });
  let admissions = 0;
  const answer = await service.webSearchService.answerWithSearch({ provider: "gemini_grounding", model: "gemini-2.5-flash", maxSearches: 2, userMessage: "query", beforeProviderCall: () => admissions++ });
  expect(answer.searchCallCount).toBe(12); expect(counts).toEqual([12]); expect(answer.usage.outputTokens).toBe(2000); expect(answer.providerCostUsd).toBe(0.008); expect(answer.billableProviderCostUsd).toBe(0.008); expect(answer.sources).toHaveLength(1); expect(admissions).toBe(1);
  expect(requests[0]).toMatchObject({ model: "gemini-3.8-flash", config: { maxOutputTokens: 2048, httpOptions: { retryOptions: { attempts: 1 } } } });
  runner.finishGoogleGrounding = async () => 1;
  const overflow = await service.webSearchService.answerWithSearch({ provider: "gemini_grounding", model: "gemini-3.8-flash", maxSearches: 2, userMessage: "query" });
  expect(overflow.providerCostUsd).toBe(1); expect(overflow.billableProviderCostUsd).toBe(0.15);
});
