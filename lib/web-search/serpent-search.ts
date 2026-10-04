import "server-only";
import { enrichShoppingProducts } from "./product-enrichment";
import { buildGroundedShoppingFallbacks } from "./products";
import { parseSerpentSearchResponse } from "./serpent";
import { buildSerpentProductQuery, parseSerpentAmazonProducts } from "./serpent-products";
import type { WebSearchAnswer } from "./types";

export async function answerWithSerpent({
	userMessage,
	includeProducts,
	includeVideos,
	includeNews,
	pricing,
}: {
	userMessage: string;
	includeProducts: boolean;
	includeVideos: boolean;
	includeNews: boolean;
	pricing?: { webCostUsd: number; productCostUsd: number };
}): Promise<WebSearchAnswer> {
	const key = process.env.SERPENT_API_KEY?.trim();
	if (!key) throw new Error("Search provider is not configured.");
	const url = new URL("https://apiserpent.com/api/search");
	url.searchParams.set("q", userMessage.trim().slice(0, 2048));
	url.searchParams.set("engine", "google");
	url.searchParams.set("country", "in");
	url.searchParams.set("num", "10");
	if (includeNews && !includeProducts && !includeVideos)
		url.searchParams.set("freshness", "7d");
	// One page, with no chargeable AI Overview/AI Mode add-ons or automatic retry.
	const response = await fetch(url, {
		headers: { "X-API-Key": key },
		cache: "no-store",
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) throw new Error(`Search returned HTTP ${response.status}.`);
	const payload: unknown = await response.json();
	const parsed = parseSerpentSearchResponse({
		response: payload,
		includeProducts,
		includeVideos,
	});
	let enriched = includeProducts
		? await enrichShoppingProducts({
				products: parsed.products,
				userMessage,
				preserveCandidateImage: true,
			})
		: [];
	let productLookupAttempted = false;
	let productLookupCharged = false;
	if (includeProducts && !enriched.some(product => product.imageUrl) && pricing &&
		Number.isFinite(pricing.webCostUsd) && pricing.webCostUsd > 0 &&
		Number.isFinite(pricing.productCostUsd) && pricing.productCostUsd > 0) {
		productLookupAttempted = true;
		const productUrl = new URL("https://apiserpent.com/api/amazon/search");
		productUrl.searchParams.set("q", buildSerpentProductQuery(userMessage));
		productUrl.searchParams.set("domain", "amazon.in");
		productUrl.searchParams.set("page", "1");
		try {
			const productResponse = await fetch(productUrl, {
				headers: { "X-API-Key": key }, cache: "no-store", signal: AbortSignal.timeout(10_000),
			});
			if (productResponse.ok) {
				const productPayload: unknown = await productResponse.json();
				productLookupCharged = Boolean(productPayload && typeof productPayload === "object" && "success" in productPayload && productPayload.success === true);
				const candidates = parseSerpentAmazonProducts(productPayload, userMessage);
				if (candidates.length) enriched = await enrichShoppingProducts({ products: candidates, userMessage, preserveCandidateImage: true });
			}
		} catch {
			// The optional lookup must not discard completed web sources or retry.
		}
	}
	const sources = [...new Map([
		...enriched.map(product => ({ title: product.title, url: product.url, domain: new URL(product.url).hostname })),
		...parsed.sources,
	].map(source => [source.url, source])).values()].slice(0, 12);
	const costUsd = productLookupAttempted && pricing
		? pricing.webCostUsd + (productLookupCharged ? pricing.productCostUsd : 0) : undefined;
	return {
		provider: "serpent",
		answer: [parsed.answer, ...enriched.map(product => `${product.title} — ${product.price} (${product.merchant})\nURL: ${product.url}`)].join("\n\n"),
		grounded: sources.length > 0,
		sources,
		products:
			includeProducts && enriched.length === 0
				? buildGroundedShoppingFallbacks({
						sources: parsed.sources,
						userMessage,
					})
				: enriched,
		videos: parsed.videos,
		searchQueries: [userMessage.trim()],
		citations: [],
		searchCallCount: productLookupAttempted ? 2 : 1,
		providerBillingUnitCount: 1,
		...(costUsd !== undefined ? { providerCostUsd: costUsd, billableProviderCostUsd: costUsd } : {}),
		usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
	};
}
