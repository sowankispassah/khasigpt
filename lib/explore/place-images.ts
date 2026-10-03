import "server-only";
import { unstable_cache } from "next/cache";
import { searchSerperImages } from "@/lib/web-search/serper-images";
import {
	buildPlaceImageQuery,
	type ExploreImagePlace,
	type PlaceImage,
	selectPlaceImage,
} from "./image-matching";
import type { ExploreResult } from "./types";

const CONCURRENCY = 6;
const IMAGE_LOOKUP_BUDGET_MS = 12_000;
const inFlight = new Map<string, Promise<PlaceImage | null>>();

const cachedPlaceImage = unstable_cache(
	async (place: ExploreImagePlace) => {
		const query = buildPlaceImageQuery(place);
		if (!query) return null;
		return selectPlaceImage(place, await searchSerperImages(query));
	},
	["explore-place-images-v1"],
	{ revalidate: 86_400 },
);

function lookupPlaceImage(place: ExploreImagePlace) {
	const key = JSON.stringify(place);
	const existing = inFlight.get(key);
	if (existing) return existing;
	const pending = cachedPlaceImage(place).finally(() => {
		inFlight.delete(key);
	});
	inFlight.set(key, pending);
	return pending;
}

export async function addExplorePlaceImages(results: ExploreResult[]) {
	if (!results.some((result) => !result.imageUrl)) return results;
	if (!process.env.SERPER_API_KEY?.trim()) {
		console.warn(
			"[explore/images] credentials unavailable; preserving place results",
		);
		return results;
	}
	const enriched = [...results];
	const startedAt = performance.now();
	const deadline = startedAt + IMAGE_LOOKUP_BUDGET_MS;
	let nextIndex = 0;
	let matched = 0;
	let failed = 0;
	let skipped = 0;
	async function worker() {
		while (nextIndex < results.length) {
			const index = nextIndex++;
			const result = results[index];
			if (result.imageUrl) continue;
			if (performance.now() >= deadline) {
				skipped++;
				continue;
			}
			const place: ExploreImagePlace = {
				id: result.id,
				name: result.name,
				address: result.address,
				latitude: result.latitude,
				longitude: result.longitude,
				website: result.website,
			};
			try {
				const image = await lookupPlaceImage(place);
				if (!image) continue;
				enriched[index] = {
					...result,
					imageUrl: image.imageUrl,
					attributions: [
						...result.attributions,
						{ displayName: image.title, uri: image.sourceUrl },
					],
				};
				matched++;
			} catch {
				// A failed optional image read must not erase valid place results, or be cached as no match.
				failed++;
			}
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(CONCURRENCY, results.length) }, worker),
	);
	console.info("[explore/images] enrichment completed", {
		matched,
		failed,
		skipped,
		total: results.length,
		durationMs: Math.round(performance.now() - startedAt),
	});
	return enriched;
}
