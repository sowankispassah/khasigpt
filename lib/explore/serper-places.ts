import "server-only";
import { createHash } from "node:crypto";
import { unstable_cache } from "next/cache";
import { calculateDistanceKm, formatDistanceKm } from "./geo";
import { safePlaceImageUrl } from "./image-matching";
import type { ExplorePlacesSearchInput } from "./places-service";
import type { ExploreResult } from "./types";

function text(value: unknown, limit: number) {
	return typeof value === "string"
		? value.trim().slice(0, limit) || null
		: null;
}

export function parseSerperPlaces(
	payload: unknown,
	input: ExplorePlacesSearchInput,
): ExploreResult[] {
	if (
		!payload ||
		typeof payload !== "object" ||
		!("places" in payload) ||
		!Array.isArray(payload.places)
	) {
		throw new Error("Place search returned an invalid response.");
	}
	const results: ExploreResult[] = [];
	for (const item of payload.places.slice(0, 100)) {
		if (!item || typeof item !== "object") continue;
		const name = text(item.title, 240);
		const latitude = item.latitude;
		const longitude = item.longitude;
		if (
			!name ||
			typeof latitude !== "number" ||
			typeof longitude !== "number" ||
			!Number.isFinite(latitude) ||
			!Number.isFinite(longitude) ||
			Math.abs(latitude) > 90 ||
			Math.abs(longitude) > 180
		)
			continue;
		const distanceKm = calculateDistanceKm(input.location, {
			latitude,
			longitude,
		});
		if (distanceKm > input.radiusKm + 0.05) continue;
		const placeId = text(item.placeId, 240);
		const cid = text(item.cid, 40);
		const source = new URL("https://www.google.com/maps/search/");
		source.searchParams.set("api", "1");
		source.searchParams.set("query", `${latitude},${longitude}`);
		if (placeId) source.searchParams.set("query_place_id", placeId);
		if (cid && /^\d+$/.test(cid)) {
			source.pathname = "/maps";
			source.search = "";
			source.searchParams.set("cid", cid);
		}
		const sourceUrl = source.toString();
		const directions = new URL("https://www.google.com/maps/dir/");
		directions.searchParams.set("api", "1");
		directions.searchParams.set("destination", `${latitude},${longitude}`);
		results.push({
			id: `maps-${createHash("sha256")
				.update(placeId || cid || `${name}:${latitude}:${longitude}`)
				.digest("hex")
				.slice(0, 14)}`,
			name,
			address: text(item.address, 400),
			category: text(item.type ?? item.category, 120),
			description: text(item.description, 700),
			latitude,
			longitude,
			distanceKm,
			distance: formatDistanceKm(distanceKm),
			rating:
				typeof item.rating === "number" &&
				Number.isFinite(item.rating) &&
				item.rating >= 0 &&
				item.rating <= 5
					? item.rating
					: null,
			reviewCount:
				typeof item.ratingCount === "number" &&
				Number.isSafeInteger(item.ratingCount) &&
				item.ratingCount >= 0
					? item.ratingCount
					: null,
			phone: text(item.phoneNumber, 80),
			website: safePlaceImageUrl(item.website),
			imageUrl: null,
			openStatus: null,
			eventDate: null,
			sourceTitle: "Google Maps",
			sourceUrl,
			directionsUrl: directions.toString(),
			attributions: [{ displayName: "Google Maps", uri: sourceUrl }],
		});
	}
	return [...new Map(results.map((result) => [result.id, result])).values()]
		.sort((a, b) => a.distanceKm - b.distanceKm)
		.slice(0, 48);
}

const cachedMapPlaces = unstable_cache(
	async (input: ExplorePlacesSearchInput) => {
		const key = process.env.SERPER_API_KEY?.trim();
		if (!key) throw new Error("Place search credentials unavailable.");
		const searchTerm =
			input.query ===
			"Nearby places, businesses, food, services, attractions and activities"
				? "places to visit"
				: input.query;
		const query = [
			input.categoryQuery,
			searchTerm,
			`near ${input.location.label}`,
		]
			.filter(Boolean)
			.join(" ")
			.slice(0, 500);
		const zoom =
			input.radiusKm <= 5
				? 13
				: input.radiusKm <= 15
					? 11
					: input.radiusKm <= 30
						? 10
						: 9;
		const startedAt = performance.now();
		const response = await fetch("https://google.serper.dev/maps", {
			method: "POST",
			headers: { "Content-Type": "application/json", "X-API-KEY": key },
			body: JSON.stringify({
				q: query,
				hl: "en",
				ll: `@${input.location.latitude},${input.location.longitude},${zoom}z`,
				page: 1,
			}),
			cache: "no-store",
			signal: AbortSignal.timeout(8_000),
		});
		if (!response.ok)
			throw new Error(`Place search returned HTTP ${response.status}.`);
		const payload: unknown = await response.json();
		const results = parseSerperPlaces(payload, input);
		console.info("[explore/places] map lookup completed", {
			durationMs: Math.round(performance.now() - startedAt),
			count: results.length,
			credits:
				payload &&
				typeof payload === "object" &&
				"credits" in payload &&
				typeof payload.credits === "number"
					? payload.credits
					: 3,
		});
		return results;
	},
	["explore-map-places-v1"],
	{ revalidate: 600 },
);

const inFlight = new Map<string, Promise<ExploreResult[]>>();

export async function searchSerperPlaces(input: ExplorePlacesSearchInput) {
	if (!process.env.SERPER_API_KEY?.trim()) return null;
	const key = JSON.stringify(input);
	const existing = inFlight.get(key);
	if (existing) return existing;
	const pending = cachedMapPlaces(input).finally(() => inFlight.delete(key));
	inFlight.set(key, pending);
	return pending;
}
