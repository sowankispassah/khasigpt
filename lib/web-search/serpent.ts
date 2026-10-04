import { parseSerperSearchResponse } from "./serper";

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as RecordValue)
		: {};
}
function rows(value: unknown) {
	return Array.isArray(value) ? value.map(record) : [];
}

/** Normalize the live Web SERP contract, not the unreleased Shopping API. */
export function normalizeSerpentResponse(response: unknown) {
	const root = record(response);
	if (root.success !== true)
		throw new Error("Search request did not complete.");
	const results = record(root.results);
	const normalize = (entry: RecordValue) => ({
		...entry,
		link: entry.url ?? entry.link,
		imageUrl: entry.thumbnail ?? entry.imageUrl,
		source:
			typeof entry.source === "string"
				? entry.source
				: (record(entry.source).name ?? entry.merchant ?? entry.store),
		price:
			typeof entry.price === "number" && Number.isFinite(entry.price)
				? `${typeof entry.currency === "string" ? entry.currency : ""} ${entry.price}`.trim()
				: entry.price,
		rating: entry.rating ?? entry.product_rating,
		ratingCount: entry.reviews ?? entry.product_reviews,
		date: entry.publishedTime ?? entry.date,
	});
	return {
		organic: rows(results.organic).map(normalize),
		shopping: rows(results.shopping).map(normalize),
		videos: rows(results.videos).map(normalize),
		news: rows(results.news).map(normalize),
	};
}

export function parseSerpentSearchResponse({
	response,
	includeProducts,
	includeVideos,
}: {
	response: unknown;
	includeProducts: boolean;
	includeVideos: boolean;
}) {
	const normalized = normalizeSerpentResponse(response);
	const organic = parseSerperSearchResponse({
		response: normalized,
		includeProducts: false,
		includeVideos: false,
	});
	const rich = parseSerperSearchResponse({
		response: normalized,
		includeProducts,
		includeVideos,
	});
	const sources = [
		...new Map(
			[...rich.sources, ...organic.sources].map((source) => [
				source.url,
				source,
			]),
		).values(),
	].slice(0, 12);
	return {
		...rich,
		sources,
		answer:
			includeProducts || includeVideos
				? [
						rich.sources.length ? rich.answer : "",
						organic.sources.length ? organic.answer : "",
					]
						.filter(Boolean)
						.join("\n\n") || organic.answer
				: organic.answer,
	};
}
