import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import * as policy from "@/lib/explore/google-budget-policy";

test("Google billing month resets at Pacific midnight including daylight saving time", () => {
  expect(policy.googleBillingMonth(new Date("2026-11-01T06:59:59Z"))).toBe("2026-10");
  expect(policy.googleBillingMonth(new Date("2026-11-01T07:00:00Z"))).toBe("2026-11");
  expect(policy.googleBillingMonth(new Date("2026-02-01T07:59:59Z"))).toBe("2026-01");
  expect(policy.googleBillingMonth(new Date("2026-02-01T08:00:00Z"))).toBe("2026-02");
});
test("missing policy opts out, malformed counters fail closed and monthly usage resets independently", () => {
  const budget = policy.parseGoogleBudget(undefined, "2026-10");
  expect(budget.enabled).toBe(false);
  expect(budget.searchLimit).toBe(1000);
  expect(() => policy.parseGoogleBudget({ ...budget, photoUsed: -1 })).toThrow();
  expect(() => policy.parseGoogleBudget({ ...budget, fallbackProvider: "google" })).toThrow();
  const rolled = policy.parseGoogleBudget({ ...budget, enabled: true, fallbackProvider: "serpent", searchUsed: 998, photoUsed: 1000, searchOffset: 2, photoOffset: 5 }, "2026-11");
  expect(rolled).toMatchObject({ enabled: true, fallbackProvider: "serpent", searchUsed: 0, photoUsed: 0, searchOffset: 0, photoOffset: 0 });
});
test("each allowance independently stops Google before requests exceed the budget", () => {
  const budget = { ...policy.parseGoogleBudget(undefined), enabled: true };
  expect(policy.googleBudgetHasRoom({ ...budget, searchUsed: 999, photoUsed: 980 })).toBe(true);
  expect(policy.googleBudgetHasRoom({ ...budget, searchUsed: 1000 })).toBe(false);
  expect(policy.googleBudgetHasRoom({ ...budget, photoUsed: 981 })).toBe(false);
  expect(policy.googleBudgetHasRoom({ ...budget, photoOffset: 1000 })).toBe(false);
});

function harness(options: { enabled?: boolean; fallback?: policy.ExploreFallbackProvider; reservation?: boolean; trackingError?: boolean; googleError?: Error } = {}) {
  const calls: string[] = [];
  const released: number[] = [];
  const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "server-only": {}, "next/cache": { unstable_cache: (fn: unknown) => fn },
    "./provider-config": { EXPLORE_PROVIDER_CACHE_TAG: "explore-provider" },
    "./google-budget-policy": policy,
    "./google-budget": {
      readGoogleBudget: async () => ({ ...policy.parseGoogleBudget(undefined), enabled: options.enabled ?? true, fallbackProvider: options.fallback ?? "serper" }),
      reserveGoogleBudget: async () => { calls.push("reserve"); if (options.trackingError) throw new Error("db unavailable"); return options.reservation === false ? null : { month: policy.googleBillingMonth(), photos: 20 }; },
      releaseUnusedGooglePhotos: async (_month: string, unused: number) => released.push(unused),
    },
  };
  const source = ts.transpileModule(readFileSync("lib/explore/google-fallback.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(source, { exports, console: { info: () => {}, warn: () => {} }, require: (name: string) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  const google = async (beforePhoto?: () => void) => { calls.push("google"); beforePhoto?.(); beforePhoto?.(); if (options.googleError) throw options.googleError; return "google results"; };
  const alternatives = Object.fromEntries(policy.EXPLORE_FALLBACK_PROVIDERS.map((provider) => [provider, async () => { calls.push(provider); return `${provider} results`; }]));
  return { run: () => exports.runGoogleWithFallback(google, alternatives), calls, released };
}
test("Google stays primary with allowance and returns unused photo slots", async () => {
  const h = harness(); expect(await h.run()).toBe("google results");
  expect(h.calls).toEqual(["reserve", "google"]); expect(h.released).toEqual([18]);
});
for (const provider of policy.EXPLORE_FALLBACK_PROVIDERS) test(`exhaustion uses only the selected ${provider} fallback`, async () => {
  const h = harness({ fallback: provider, reservation: false });
  expect(await h.run()).toBe(`${provider} results`);
  expect(h.calls).toEqual(["reserve", provider]); expect(h.released).toEqual([]);
});
test("tracking failure prevents Google calls and uses the selected fallback", async () => {
  const h = harness({ fallback: "serpent", trackingError: true });
  expect(await h.run()).toBe("serpent results"); expect(h.calls).toEqual(["reserve", "serpent"]);
});
test("explicit quota errors use fallback but timeouts and configuration errors do not spend elsewhere", async () => {
  const quota = harness({ googleError: new policy.GoogleQuotaError() });
  expect(await quota.run()).toBe("serper results"); expect(quota.released).toEqual([18]);
  const timeout = harness({ googleError: new Error("timeout") });
  await expect(timeout.run()).rejects.toThrow("timeout"); expect(timeout.calls).toEqual(["reserve", "google"]); expect(timeout.released).toEqual([18]);
});
test("disabled fallback preserves explicitly selected Google behavior", async () => {
  const h = harness({ enabled: false }); expect(await h.run()).toBe("google results"); expect(h.calls).toEqual(["google"]); expect(h.released).toEqual([]);
});
