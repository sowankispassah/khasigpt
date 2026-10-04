import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { searchCreditAllowance } from "@/lib/billing/search-budget";
import * as constants from "@/lib/constants";
import * as policy from "@/lib/web-search/google-allowance-policy";
import * as pricing from "@/lib/web-search/pricing";
import * as serpent from "@/lib/web-search/serpent";

function load(
	name: string,
	mocks: Record<string, unknown>,
	globals: Record<string, unknown> = {},
) {
	const exports: Record<string, any> = {};
	vm.runInNewContext(
		ts.transpileModule(readFileSync(name, "utf8"), {
			compilerOptions: {
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2022,
			},
		}).outputText,
		{
			exports,
			...globals,
			require: (key: string) => {
				if (!(key in mocks)) throw new Error(`Missing mock ${key}`);
				return mocks[key];
			},
		},
	);
	return exports;
}

const fixture = {
	success: true,
	results: {
		shopping: [
			{
				title: "Cotton T-shirt",
				url: "https://retailer.test/item/1",
				price: 399,
				currency: "INR",
				merchant: "Retailer",
				thumbnail: "https://retailer.test/image.jpg",
				rating: 4.2,
				reviews: 10,
			},
		],
		organic: [
			{
				title: "Flipkart T-shirts",
				url: "https://www.flipkart.com/tshirts",
				snippet: "Browse T-shirts",
			},
			{ title: "Bad result", url: "javascript:alert(1)" },
		],
	},
};

test("Serpent retains shopping and organic sources and never invents missing product fields", () => {
	const parsed = serpent.parseSerpentSearchResponse({
		response: fixture,
		includeProducts: true,
		includeVideos: false,
	});
	expect(parsed.products).toHaveLength(1);
	expect(parsed.products[0]).toMatchObject({
		price: "INR 399",
		merchant: "Retailer",
		imageUrl: "https://retailer.test/image.jpg",
		reviewCount: "10",
	});
	expect(parsed.sources.map((source) => source.url)).toEqual([
		"https://retailer.test/item/1",
		"https://www.flipkart.com/tshirts",
	]);
	const empty = serpent.parseSerpentSearchResponse({
		response: {
			success: true,
			results: {
				organic: fixture.results.organic,
				shopping: [{ title: "No price", url: "https://retailer.test/2" }],
			},
		},
		includeProducts: true,
		includeVideos: false,
	});
	expect(empty.products).toHaveLength(0);
	expect(empty.sources).toHaveLength(2);
	expect(empty.answer).toContain("Flipkart T-shirts");
	expect(() =>
		serpent.normalizeSerpentResponse({
			success: false,
			error: "private upstream payload",
		}),
	).toThrow("Search request did not complete.");
});

test("one Serpent page has one billing unit for shopping and reserves credits before dispatch", () => {
	expect(
		pricing.getWebSearchProviderBillingUnitCount({
			provider: "serpent",
			isShoppingSearch: true,
			searchCallCount: 1,
		}),
	).toBe(1);
	expect(
		searchCreditAllowance({
			provider: "serpent",
			shopping: true,
			costPerCallUsd: 0.0006,
			markup: 3,
			pricing: { usdToInr: 100, walletUnitsPerInr: 500 },
		}),
	).toBe(90);
	expect(() =>
		searchCreditAllowance({
			provider: "serpent",
			costPerCallUsd: 0,
			markup: 3,
			pricing: { usdToInr: 100, walletUnitsPerInr: 500 },
		}),
	).toThrow();
	expect(
		policy.googleSearchAllowanceSchema.parse({
			...policy.parseGoogleSearchAllowance(undefined),
			fallbackProvider: "serpent",
		}).fallbackProvider,
	).toBe("serpent");
});

test("Serpent dispatches only one authenticated page and uses honest retailer fallback cards", async () => {
	const calls: any[] = [];
	const adapter = load(
		"lib/web-search/serpent-search.ts",
		{
			"server-only": {},
			"./serpent": serpent,
			"./news-results": {
				parseSerperNewsResults: () => [],
				buildSerperNewsGrounding: () => ({ answer: "News", sources: [] }),
			},
			"./news-enrichment": {
				enrichNewsStories: async (value: unknown) => value,
			},
			"./product-enrichment": {
				enrichShoppingProducts: async ({ products }: any) => products,
			},
			"./products": {
				buildGroundedShoppingFallbacks: ({ sources }: any) =>
					sources.map((source: any) => ({ ...source, kind: "collection" })),
			},
		},
		{
			process: { env: { SERPENT_API_KEY: "private-test-key" } },
			URL,
			AbortSignal,
			fetch: async (url: URL, options: unknown) => {
				calls.push({ url, options });
				return Response.json({
					success: true,
					results: { organic: fixture.results.organic },
				});
			},
		},
	);
	const answer = await adapter.answerWithSerpent({
		userMessage: "tshirt under 500 rupees",
		includeProducts: true,
		includeVideos: false,
		includeNews: false,
	});
	expect(calls).toHaveLength(1);
	expect(calls[0].url.pathname).toBe("/api/search");
	expect(calls[0].url.searchParams.get("num")).toBe("10");
	expect(calls[0].url.searchParams.get("country")).toBe("in");
	expect(calls[0].url.searchParams.has("api_key")).toBe(false);
	expect(calls[0].url.searchParams.has("include_ai_mode")).toBe(false);
	expect(calls[0].options.headers).toEqual({ "X-API-Key": "private-test-key" });
	expect(answer.providerBillingUnitCount).toBe(1);
	expect(answer.provider).toBe("serpent");
	expect(answer.products[0].kind).toBe("collection");
});

function adminHarness(admin = true, configured = true) {
	const writes: any[] = [];
	const route = load(
		"app/api/admin/pricing/web-search/route.ts",
		{
			"next/server": { NextResponse: Response },
			"@/lib/constants": constants,
			"@/lib/admin/cache-invalidation": { invalidateAdminMutation: () => {} },
			"@/lib/db/app-settings-lite": {
				appSettingCacheTagForKey: (key: string) => key,
				createLiteAuditLogEntry: async () => {},
			},
			"@/lib/security/admin-api-auth": {
				requireAdminApiUser: async () => (admin ? { id: "admin" } : null),
			},
			"@/lib/utils/async": { withTimeout: (value: unknown) => value },
			"@/lib/web-search/config": {
				WEB_SEARCH_CONFIG_CACHE_TAG: "web-search-config",
				WEB_SEARCH_SETTING_KEYS: [],
			},
			"@/lib/web-search/google-allowance": {
				readGoogleSearchAllowance: async () =>
					policy.parseGoogleSearchAllowance(undefined),
				saveGoogleSearchAllowance: async (input: unknown, values: unknown) => {
					writes.push({ input, values });
				},
			},
			"@/lib/web-search/pricing": pricing,
		},
		{
			process: {
				env: configured
					? {
							SERPENT_API_KEY: "private-test-key",
							SERPER_API_KEY: "private-test-serper",
						}
					: {},
			},
			console,
		},
	);
	return { route, writes };
}
function settings(provider = "serpent", fallbackProvider = "disabled") {
	return {
		provider,
		fallbackProvider,
		enabledWeb: true,
		enabledNative: true,
		freeUsersEnabled: true,
		paidUsersEnabled: true,
		maxCalls: 2,
		providerPricing: {
			serpent: { markupMultiplier: 3, providerCostPerCallUsd: 0.0006 },
			serper: { markupMultiplier: 3, providerCostPerCallUsd: 0.001 },
			gemini_grounding: { markupMultiplier: 2, providerCostPerCallUsd: 0.014 },
			openai_web_search: { markupMultiplier: 2, providerCostPerCallUsd: 0 },
		},
	};
}
const request = (body: unknown) =>
	new Request("https://admin.test/api/admin/pricing/web-search", {
		method: "POST",
		body: JSON.stringify(body),
	});

test("admin Serpent saves enforce authorization, keys and pricing; no default routing change", async () => {
	const forbidden = adminHarness(false);
	expect((await forbidden.route.POST(request(settings()))).status).toBe(403);
	expect(forbidden.writes).toHaveLength(0);
	const missing = adminHarness(true, false);
	expect((await missing.route.POST(request(settings()))).status).toBe(400);
	expect(missing.writes).toHaveLength(0);
	const h = adminHarness();
	const invalid = settings();
	invalid.providerPricing.serpent.providerCostPerCallUsd = 0;
	expect((await h.route.POST(request(invalid))).status).toBe(400);
	expect(h.writes).toHaveLength(0);
	const response = await h.route.POST(request(settings()));
	expect(response.status).toBe(200);
	expect(await response.text()).not.toContain("private-");
	expect(h.writes[0].values).toMatchObject({
		web_search_provider: "serpent",
		web_search_serpent_cost_per_call_usd: 0.0006,
		web_search_serpent_markup_multiplier: 3,
	});
	expect(h.writes[0].input.enabled).toBe(false);
});

test("Google allowance can fall back to Serpent and old admin forms still save inactive pricing", async () => {
	const h = adminHarness();
	expect(
		(await h.route.POST(request(settings("gemini_grounding", "serpent"))))
			.status,
	).toBe(200);
	expect(h.writes[0].input.fallbackProvider).toBe("serpent");
	const old = settings("serper");
	delete (old.providerPricing as Record<string, unknown>).serpent;
	expect((await h.route.POST(request(old))).status).toBe(200);
	expect(h.writes[1].values.web_search_provider).toBe("serper");
	expect(h.writes[1].values).not.toHaveProperty(
		"web_search_serpent_cost_per_call_usd",
	);
});

test("Serpent service admission rejects before any upstream request", async () => {
	let requests = 0;
	const service = load("lib/web-search/service.ts", {
		"server-only": {},
		"@google/genai": {},
		"./google-allowance-policy": policy,
		"./google-allowance-runner": {},
		"./news-enrichment": {},
		"./news-results": {},
		"./pricing": pricing,
		"./product-enrichment": {},
		"./products": {},
		"./serper": {},
		"./youtube": {},
		"./serpent-search": {
			answerWithSerpent: async () => {
				requests++;
				return { provider: "serpent" };
			},
		},
	});
	const input = {
		provider: "serpent",
		userMessage: "shopping",
		model: "chat",
		maxSearches: 1,
	};
	await expect(
		service.webSearchService.answerWithSearch({
			...input,
			beforeProviderCall: () => {
				throw new Error("insufficient credits");
			},
		}),
	).rejects.toThrow("insufficient credits");
	expect(requests).toBe(0);
	await service.webSearchService.answerWithSearch(input);
	expect(requests).toBe(1);
});
