import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { searchCreditAllowance } from "@/lib/billing/search-budget";
import * as constants from "@/lib/constants";
import * as policy from "@/lib/web-search/google-allowance-policy";
import * as pricing from "@/lib/web-search/pricing";
import * as serpent from "@/lib/web-search/serpent";
import * as serpentProducts from "@/lib/web-search/serpent-products";

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

const amazonItem = {
  title: "Cotton Polo T-Shirt", url: "https://www.amazon.in/dp/B07MZJTJXM",
  image: "https://m.media-amazon.com/images/I/product.jpg", price: 469,
  currency: "INR", rating: 3.9, ratings_total: 40,
};

test("Serpent product lookup keeps item-owned photos, relevance, INR budget and safe item URLs", () => {
  const payload = { success: true, results: [
    { ...amazonItem, title: "Regular Cotton Shirt" },
    { ...amazonItem, price: 599 },
    { ...amazonItem, currency: "USD" },
    { ...amazonItem, price: null },
    { ...amazonItem, image: "http://localhost/photo" },
    { ...amazonItem, url: "https://amazon.in.evil.test/dp/B07MZJTJXM" },
    { ...amazonItem, url: "https://www.amazon.in/s?k=tshirts" },
    amazonItem, amazonItem,
  ] };
  const products = serpentProducts.parseSerpentAmazonProducts(payload, "tshirt under 500 rupees");
  expect(products).toHaveLength(1);
  expect(products[0]).toMatchObject({ title: "Cotton Polo T-Shirt", price: "₹469.00", imageUrl: amazonItem.image, kind: "product", merchant: "Amazon", verified: false });
  expect(serpentProducts.buildSerpentProductQuery("Find T-shirts under 500 rupees in India. Show links.")).toBe("T-shirts under 500 rupees");
  expect(serpentProducts.parseSerpentAmazonProducts({ success: false, results: [amazonItem] }, "tshirt")).toEqual([]);
});

function productAdapter({ inline = false, fails = false }: { inline?: boolean; fails?: boolean } = {}) {
  const calls: URL[] = [];
  const adapter = load("lib/web-search/serpent-search.ts", {
    "server-only": {}, "./serpent": serpent, "./serpent-products": serpentProducts,
    "./products": { buildGroundedShoppingFallbacks: ({ sources }: any) => sources.map((source: any) => ({ ...source, kind: "collection" })) },
    "./product-enrichment": { enrichShoppingProducts: async ({ products }: any) => products },
  }, { process: { env: { SERPENT_API_KEY: "private-test-key" } }, URL, AbortSignal,
    fetch: async (url: URL) => {
      calls.push(url);
      if (url.pathname === "/api/search") return Response.json(inline ? fixture : { success: true, results: { organic: fixture.results.organic } });
      return fails ? new Response(null, { status: 503 }) : Response.json({ success: true, results: [amazonItem] });
    },
  });
  return { adapter, calls };
}

test("missing shopping photos trigger one product lookup with aggregate billing and original sources", async () => {
  const h = productAdapter();
  const answer = await h.adapter.answerWithSerpent({ userMessage: "tshirt under 500 rupees", includeProducts: true, includeVideos: false, includeNews: false, pricing: { webCostUsd: 0.0006, productCostUsd: 0.00002 } });
  expect(h.calls.map(url => url.pathname)).toEqual(["/api/search", "/api/amazon/search"]);
  expect(h.calls[1].searchParams.get("domain")).toBe("amazon.in");
  expect(h.calls[1].searchParams.get("page")).toBe("1");
  expect(answer.products[0].imageUrl).toBe(amazonItem.image);
  expect(answer.sources.map((source: any) => source.url)).toContain("https://www.flipkart.com/tshirts");
  expect(answer.answer).toContain("Cotton Polo T-Shirt — ₹469.00");
  expect(answer.searchCallCount).toBe(2);
  expect(answer.providerBillingUnitCount).toBe(1);
  expect(answer.providerCostUsd).toBeCloseTo(0.00062);
  expect(searchCreditAllowance({ provider: "serpent", costPerCallUsd: 0.0006, markup: 2, pricing: { usdToInr: 100, walletUnitsPerInr: 500 }, groundingAdmission: { maximumProviderCostUsd: 0.00062 } })).toBe(62);
});

test("product lookup stays off for zero pricing, normal searches or existing photos; lookup failures preserve web results", async () => {
  const input = { userMessage: "tshirt under 500 rupees", includeProducts: true, includeVideos: false, includeNews: false, pricing: { webCostUsd: 0.0006, productCostUsd: 0.00002 } };
  for (const variation of [ { ...input, includeProducts: false }, { ...input, pricing: { webCostUsd: 0.0006, productCostUsd: 0 } } ]) {
    const h = productAdapter(); await h.adapter.answerWithSerpent(variation); expect(h.calls).toHaveLength(1);
  }
  const inline = productAdapter({ inline: true }); await inline.adapter.answerWithSerpent(input); expect(inline.calls).toHaveLength(1);
  const failed = productAdapter({ fails: true }); const answer = await failed.adapter.answerWithSerpent(input);
  expect(failed.calls).toHaveLength(2); expect(answer.grounded).toBe(true); expect(answer.products[0].kind).toBe("collection"); expect(answer.providerCostUsd).toBe(0.0006);
});

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
			"./serpent-products": serpentProducts,
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

test("optional product price validates, disables at zero and preserves omitted old-form values", async () => {
  for (const value of [null, "", -1, 101, "0.00002"]) {
    const h = adminHarness();
    expect((await h.route.POST(request({ ...settings(), serpentProductCostPerCallUsd: value }))).status).toBe(400);
    expect(h.writes).toHaveLength(0);
  }
  const h = adminHarness();
  for (const value of [0.00002, 0]) {
    expect((await h.route.POST(request({ ...settings(), serpentProductCostPerCallUsd: value }))).status).toBe(200);
    expect(h.writes.at(-1).values.web_search_serpent_product_cost_per_call_usd).toBe(value);
  }
  expect((await h.route.POST(request(settings()))).status).toBe(200);
  expect(h.writes.at(-1).values).not.toHaveProperty("web_search_serpent_product_cost_per_call_usd");
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
		includeProducts: true,
		serpentPricing: { webCostUsd: 0.0006, productCostUsd: 0.00002 },
	};
	await expect(
		service.webSearchService.answerWithSearch({
			...input,
			beforeProviderCall: (admission: any) => {
				expect(admission.maximumProviderCostUsd).toBeCloseTo(0.00062);
				throw new Error("insufficient credits");
			},
		}),
	).rejects.toThrow("insufficient credits");
	expect(requests).toBe(0);
	await service.webSearchService.answerWithSearch(input);
	expect(requests).toBe(1);
});
