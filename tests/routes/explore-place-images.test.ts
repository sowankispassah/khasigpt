import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import * as geo from "@/lib/explore/geo";
import {
	buildPlaceImageQuery,
	safePlaceImageUrl,
	selectPlaceImage,
} from "@/lib/explore/image-matching";
import type { ExploreResult } from "@/lib/explore/types";
import { buildContentSecurityPolicy } from "@/lib/security/csp";

const place: ExploreResult = {
	id: "osm-nartiang",
	name: "Nartiang Monoliths",
	address: "Nartiang, Meghalaya",
	latitude: 25.571,
	longitude: 92.224,
	website: null,
	imageUrl: null,
	category: "attraction",
	description: null,
	distance: "5 km away",
	distanceKm: 5,
	rating: null,
	reviewCount: null,
	openStatus: null,
	eventDate: null,
	phone: null,
	directionsUrl: null,
	sourceTitle: "OpenStreetMap",
	sourceUrl: "https://www.openstreetmap.org/node/1",
	attributions: [
		{
			displayName: "OpenStreetMap contributors",
			uri: "https://www.openstreetmap.org/copyright",
		},
	],
};
const image = {
	title: "Nartiang Monoliths, Meghalaya",
	imageUrl: "https://photos.example.com/nartiang.jpg",
	thumbnailUrl: "https://encrypted-tbn0.gstatic.com/images?q=nartiang",
	link: "https://tourism.example.com/nartiang-monoliths-meghalaya",
};

function loadModule(
	file: string,
	mocks: Record<string, unknown>,
	globals: Record<string, unknown> = {},
) {
	const exports: Record<string, any> = {};
	const code = ts.transpileModule(readFileSync(file, "utf8"), {
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			target: ts.ScriptTarget.ES2022,
		},
	}).outputText;
	vm.runInNewContext(code, {
		exports,
		URL,
		AbortSignal,
		Map,
		Promise,
		console: { info: () => {}, warn: () => {} },
		performance,
		process: { env: { SERPER_API_KEY: "test-only" } },
		require: (name: string) => {
			if (!(name in mocks)) throw new Error(`Unexpected dependency: ${name}`);
			return mocks[name];
		},
		...globals,
	});
	return exports;
}

function harness(
	lookup: (query: string) => Promise<unknown>,
	withKey = true,
	clock: { now: () => number } = performance,
) {
	let requests = 0;
	const entries = new Map<string, unknown>();
	const module = loadModule(
		"lib/explore/place-images.ts",
		{
			"server-only": {},
			"next/cache": {
				unstable_cache:
					(fn: (...args: unknown[]) => Promise<unknown>) =>
					async (...args: unknown[]) => {
						const key = JSON.stringify(args);
						if (entries.has(key)) return entries.get(key);
						const result = await fn(...args);
						entries.set(key, result);
						return result;
					},
			},
			"@/lib/web-search/serper-images": {
				SERPER_IMAGE_TIMEOUT_MS: 6_000,
				searchSerperImages: async (q: string) => {
					requests++;
					return lookup(q);
				},
			},
			"./image-matching": { buildPlaceImageQuery, selectPlaceImage },
		},
		{
			process: { env: { SERPER_API_KEY: withKey ? "test-only" : "" } },
			performance: clock,
		},
	);
	return {
		enrich: module.addExplorePlaceImages as (
			results: ExploreResult[],
			deadlineMs?: number,
		) => Promise<ExploreResult[]>,
		requests: () => requests,
	};
}

test("matches the place and locality, links the source and prefers the search thumbnail", () => {
	expect(buildPlaceImageQuery(place)).toBe(
		'"Nartiang Monoliths" Nartiang, Meghalaya Meghalaya India',
	);
	expect(selectPlaceImage(place, { images: [image] })).toEqual({
		imageUrl: image.thumbnailUrl,
		title: image.title,
		sourceUrl: image.link,
	});
});

test("rejects unrelated places, ambiguous generic names and unsafe URLs", () => {
	expect(
		selectPlaceImage(place, {
			images: [
				{
					...image,
					title: "Shillong cafes",
					link: "https://tourism.example.com/shillong",
					imageUrl: "https://photos.example.com/shillong.jpg",
				},
			],
		}),
	).toBeNull();
	expect(
		selectPlaceImage(place, {
			images: [
				{
					...image,
					title: "Nartiang Monoliths",
					link: "https://example.com/nartiang-monoliths",
				},
			],
		}),
	).toBeNull();
	expect(buildPlaceImageQuery({ ...place, name: "The Restaurant" })).toBeNull();
	for (const url of [
		"javascript:alert(1)",
		"https://127.0.0.1/photo",
		"https://[::1]/photo",
		"https://localhost/photo",
		"https://a.internal/photo",
		"https://user:pass@example.com/photo",
		"http://example.com/photo",
	]) {
		expect(safePlaceImageUrl(url)).toBeNull();
	}
});

test("skips malformed records independently, including broken URL escapes", () => {
	expect(
		selectPlaceImage(place, {
			images: [
				null,
				{ ...image, link: "https://example.com/%broken", title: "Other place" },
				image,
			],
		})?.sourceUrl,
	).toBe(image.link);
	expect(
		selectPlaceImage(place, {
			images: [
				{ ...image, link: "https://example.com/%broken", title: image.title },
			],
		})?.sourceUrl,
	).toBe("https://example.com/%broken");
});

test("prefers a matching photo on the place's own website", () => {
	const own = {
		...image,
		title: "Nartiang Monoliths gallery",
		link: "https://nartiang.example.com/gallery",
	};
	expect(
		selectPlaceImage(
			{ ...place, website: "https://nartiang.example.com" },
			{ images: [image, own] },
		)?.sourceUrl,
	).toBe(own.link);
});

test("displays only supported photo hosts and the actual web CSP allows their thumbnails", async () => {
	expect(
		selectPlaceImage(place, {
			images: [
				{ ...image, thumbnailUrl: "https://untrusted.example.com/photo.jpg" },
			],
		}),
	).toBeNull();
	// Pages receive this policy (with a per-request nonce) from proxy.ts.
	const csp = buildContentSecurityPolicy("test-nonce");
	expect(csp).toContain("https://*.gstatic.com");
	expect(csp).toContain("https://*.bing.net");
	expect(csp).not.toContain("img-src *");
});

test("only fills missing images and preserves result identity, coordinates and original attribution", async () => {
	const h = harness(async () => ({ images: [image] }));
	const existing = {
		...place,
		id: "existing",
		imageUrl: "https://upload.wikimedia.org/known.jpg",
	};
	const results = await h.enrich([existing, place]);
	expect(results[0]).toBe(existing);
	expect(results[1]).toMatchObject({
		id: place.id,
		latitude: place.latitude,
		longitude: place.longitude,
		imageUrl: image.thumbnailUrl,
	});
	expect(results[1].attributions).toEqual([
		...place.attributions,
		{ displayName: image.title, uri: image.link },
	]);
	expect(place.imageUrl).toBeNull();
	expect(h.requests()).toBe(1);
});

test("reuses place images across radius changes and concurrent requests", async () => {
	const h = harness(async () => ({ images: [image] }));
	await Promise.all([h.enrich([place]), h.enrich([place])]);
	await h.enrich([{ ...place, distanceKm: 4, distance: "4 km away" }]);
	expect(h.requests()).toBe(1);
});

test("keeps different place identities and coordinates separate", async () => {
	const h = harness(async () => ({ images: [image] }));
	await h.enrich([place, { ...place, id: "different-place", latitude: 25.9 }]);
	expect(h.requests()).toBe(2);
});

test("caches successful no-match results but retries failed lookups", async () => {
	const none = harness(async () => ({ images: [] }));
	await none.enrich([place]);
	await none.enrich([place]);
	expect(none.requests()).toBe(1);
	let fail = true;
	const flaky = harness(async () => {
		if (fail) throw new Error("HTTP 503");
		return { images: [image] };
	});
	expect((await flaky.enrich([place]))[0].imageUrl).toBeNull();
	fail = false;
	expect((await flaky.enrich([place]))[0].imageUrl).toBe(image.thumbnailUrl);
	expect(flaky.requests()).toBe(2);
});

test("missing credentials and generic place names make no provider requests", async () => {
	const absent = harness(async () => {
		throw new Error("must not query");
	}, false);
	expect(await absent.enrich([place])).toEqual([place]);
	expect(absent.requests()).toBe(0);
	const generic = harness(async () => {
		throw new Error("must not query");
	});
	await generic.enrich([{ ...place, name: "Hospital" }]);
	expect(generic.requests()).toBe(0);
});

test("isolates failed photos and bounds concurrent provider requests", async () => {
	let active = 0;
	let maxActive = 0;
	const h = harness(async (q) => {
		active++;
		maxActive = Math.max(maxActive, active);
		await new Promise((resolve) => setTimeout(resolve, 5));
		active--;
		if (q.includes("Failing")) throw new Error("HTTP 500");
		return { images: [image] };
	});
	const results = await h.enrich(
		Array.from({ length: 15 }, (_, i) => ({
			...place,
			id: `place-${i}`,
			...(i === 0 ? { name: "Failing Place" } : {}),
		})),
	);
	expect(results).toHaveLength(15);
	expect(results[0].imageUrl).toBeNull();
	expect(results[1].imageUrl).toBe(image.thumbnailUrl);
	expect(maxActive).toBeLessThanOrEqual(6);
});

test("skips optional network reads when the caller has no remaining image budget", async () => {
	const h = harness(async () => ({ images: [image] }));
	expect(await h.enrich([place], performance.now() + 5_000)).toEqual([place]);
	expect(h.requests()).toBe(0);
});

test("stops starting image reads early enough for their full timeout to fit", async () => {
	let now = 0;
	const h = harness(
		async () => {
			now += 6_000;
			return { images: [image] };
		},
		true,
		{ now: () => now },
	);
	const results = await h.enrich(
		Array.from({ length: 12 }, (_, i) => ({ ...place, id: `place-${i}` })),
		18_000,
	);
	expect(h.requests()).toBe(3);
	expect(results.filter((result) => result.imageUrl)).toHaveLength(3);
	expect(results).toHaveLength(12);
});

test("the provider adapter sends a server-only key, a ten-result request, and rejects HTTP failures", async () => {
	const requests: Array<{ url: string; init: RequestInit }> = [];
	let status = 200;
	const service = loadModule(
		"lib/web-search/serper-images.ts",
		{
			"server-only": {},
			"node:crypto": { createHash },
		},
		{
			fetch: async (url: string, init: RequestInit) => {
				requests.push({ url, init });
				return Response.json({ images: [image], credits: 1 }, { status });
			},
		},
	);
	await service.searchSerperImages('"Nartiang Monoliths" Meghalaya India');
	expect(requests[0].url).toBe("https://google.serper.dev/images");
	expect(JSON.parse(requests[0].init.body as string)).toMatchObject({
		num: 10,
		gl: "in",
		hl: "en",
	});
	expect(requests[0].init.headers).toMatchObject({ "X-API-KEY": "test-only" });
	status = 429;
	await expect(service.searchSerperImages("another place")).rejects.toThrow(
		"HTTP 429",
	);
});

test("map results require actual coordinates, stay inside the exact radius, and keep source details", async () => {
	const module = loadModule("lib/explore/serper-places.ts", {
		"server-only": {},
		"node:crypto": { createHash },
		"next/cache": { unstable_cache: (fn: unknown) => fn },
		"./geo": geo,
		"./image-matching": { safePlaceImageUrl },
	});
	const input = {
		categoryQuery: null,
		query: "attractions",
		radiusKm: 5,
		location: {
			id: "location",
			label: "Nartiang, Meghalaya",
			source: "manual",
			latitude: place.latitude,
			longitude: place.longitude,
		},
	};
	const valid = {
		title: "Nartiang Monoliths",
		latitude: place.latitude,
		longitude: place.longitude,
		placeId: "place-1",
		cid: "12345",
		address: place.address,
		website: "https://tourism.example.com/nartiang",
		rating: 4.7,
		ratingCount: 123,
	};
	const results = module.parseSerperPlaces(
		{
			places: [
				valid,
				valid,
				{ ...valid, placeId: "far", latitude: 26 },
				{ ...valid, placeId: "missing", latitude: undefined },
				{ ...valid, placeId: "invalid", latitude: Number.NaN },
				{ ...valid, placeId: "out-of-range", longitude: 200 },
			],
		},
		input,
	);
	expect(results).toHaveLength(1);
	expect(results[0]).toMatchObject({
		name: valid.title,
		latitude: valid.latitude,
		longitude: valid.longitude,
		rating: 4.7,
		reviewCount: 123,
		sourceTitle: "Google Maps",
		imageUrl: null,
		distanceKm: 0,
	});
	expect(results[0].sourceUrl).toBe("https://www.google.com/maps?cid=12345");
	expect(results[0].attributions[0].uri).toBe(results[0].sourceUrl);
	expect(() => module.parseSerperPlaces({}, input)).toThrow("invalid response");
});

test("map searches use the chosen center, cache results, coalesce concurrent reads, and retry failures", async () => {
	const requests: Array<{ url: string; init: RequestInit }> = [];
	const entries = new Map<string, unknown>();
	let status = 200;
	const module = loadModule(
		"lib/explore/serper-places.ts",
		{
			"server-only": {},
			"node:crypto": { createHash },
			"next/cache": {
				unstable_cache:
					(fn: (...args: unknown[]) => Promise<unknown>) =>
					async (...args: unknown[]) => {
						const key = JSON.stringify(args);
						if (entries.has(key)) return entries.get(key);
						const result = await fn(...args);
						entries.set(key, result);
						return result;
					},
			},
			"./geo": geo,
			"./image-matching": { safePlaceImageUrl },
		},
		{
			fetch: async (url: string, init: RequestInit) => {
				requests.push({ url, init });
				return Response.json(
					{
						places: [
							{
								title: place.name,
								latitude: place.latitude,
								longitude: place.longitude,
							},
						],
						credits: 3,
					},
					{ status },
				);
			},
		},
	);
	const input = {
		categoryQuery: null,
		query: "attractions",
		radiusKm: 5,
		location: {
			id: "location",
			label: "Nartiang, Meghalaya",
			source: "manual",
			latitude: place.latitude,
			longitude: place.longitude,
		},
	};
	await Promise.all([
		module.searchSerperPlaces(input),
		module.searchSerperPlaces(input),
	]);
	await module.searchSerperPlaces(input);
	expect(requests).toHaveLength(1);
	expect(requests[0].url).toBe("https://google.serper.dev/maps");
	expect(requests[0].init.headers).toMatchObject({ "X-API-KEY": "test-only" });
	expect(JSON.parse(requests[0].init.body as string)).toEqual({
		q: "attractions near Nartiang, Meghalaya",
		hl: "en",
		ll: `@${place.latitude},${place.longitude},13z`,
		page: 1,
	});
	status = 429;
	await expect(
		module.searchSerperPlaces({ ...input, radiusKm: 10 }),
	).rejects.toThrow("HTTP 429");
	status = 200;
	await module.searchSerperPlaces({ ...input, radiusKm: 10 });
	expect(requests).toHaveLength(3);
});
