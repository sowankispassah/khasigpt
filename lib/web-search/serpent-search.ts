import "server-only";
import { enrichShoppingProducts } from "./product-enrichment";
import { buildGroundedShoppingFallbacks } from "./products";
import { parseSerpentSearchResponse } from "./serpent";
import type { WebSearchAnswer } from "./types";

export async function answerWithSerpent({
	userMessage,
	includeProducts,
	includeVideos,
	includeNews,
}: {
	userMessage: string;
	includeProducts: boolean;
	includeVideos: boolean;
	includeNews: boolean;
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
	const enriched = includeProducts
		? await enrichShoppingProducts({
				products: parsed.products,
				userMessage,
				preserveCandidateImage: true,
			})
		: [];
	return {
		provider: "serpent",
		answer: parsed.answer,
		grounded: parsed.sources.length > 0,
		sources: parsed.sources,
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
		searchCallCount: 1,
		providerBillingUnitCount: 1,
		usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
	};
}
