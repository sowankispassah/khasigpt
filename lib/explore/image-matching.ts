import type { ExploreResult } from "./types";

export type ExploreImagePlace = Pick<
	ExploreResult,
	"id" | "name" | "address" | "latitude" | "longitude" | "website"
>;

export type PlaceImage = {
	imageUrl: string;
	title: string;
	sourceUrl: string;
};

const GENERIC_WORDS = new Set([
	"the",
	"and",
	"of",
	"in",
	"at",
	"near",
	"hotel",
	"restaurant",
	"cafe",
	"school",
	"college",
	"hospital",
	"church",
	"shop",
	"store",
	"market",
	"park",
	"viewpoint",
	"waterfall",
	"falls",
	"lake",
	"bridge",
	"temple",
]);

function words(value: string) {
	return value
		.normalize("NFKD")
		.toLowerCase()
		.replace(/\p{M}/gu, "")
		.replace(/[^\p{L}\p{N}]+/gu, " ")
		.trim()
		.split(/\s+/);
}

function decodedPath(url: URL) {
	try {
		return decodeURIComponent(url.pathname);
	} catch {
		return url.pathname;
	}
}

export function safePlaceImageUrl(value: unknown) {
	if (typeof value !== "string" || value.length > 4096) return null;
	try {
		const url = new URL(value);
		const host = url.hostname.toLowerCase();
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			(url.port && url.port !== "443") ||
			!host.includes(".") ||
			/^[\d.]+$/.test(host) ||
			host.startsWith("[") ||
			/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)
		)
			return null;
		return url.toString();
	} catch {
		return null;
	}
}

export function buildPlaceImageQuery(place: ExploreImagePlace) {
	const name = place.name
		.replace(/["\\\r\n]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	const distinctive = words(name).filter(
		(word) => word.length >= 3 && !GENERIC_WORDS.has(word),
	);
	if (!distinctive.length) return null;
	return [
		`"${name.slice(0, 160)}"`,
		place.address?.slice(0, 160),
		"Meghalaya India",
	]
		.filter(Boolean)
		.join(" ");
}

export function selectPlaceImage(
	place: ExploreImagePlace,
	payload: unknown,
): PlaceImage | null {
	if (
		!payload ||
		typeof payload !== "object" ||
		!("images" in payload) ||
		!Array.isArray(payload.images)
	)
		return null;
	const nameWords = [
		...new Set(
			words(place.name).filter(
				(word) => word.length >= 3 && !GENERIC_WORDS.has(word),
			),
		),
	];
	if (!nameWords.length) return null;
	const website = safePlaceImageUrl(place.website);
	const websiteHost = website
		? new URL(website).hostname.replace(/^www\./, "")
		: null;
	const locationWords = new Set(words(place.address ?? ""));
	const candidates: Array<PlaceImage & { score: number }> = [];
	for (const raw of payload.images.slice(0, 100)) {
		if (!raw || typeof raw !== "object") continue;
		const sourceUrl = safePlaceImageUrl(raw.link);
		const originalUrl = safePlaceImageUrl(raw.imageUrl);
		const thumbnailUrl = safePlaceImageUrl(raw.thumbnailUrl);
		const title =
			typeof raw.title === "string" ? raw.title.trim().slice(0, 240) : null;
		if (!sourceUrl || !title || !(originalUrl || thumbnailUrl)) continue;
		const source = new URL(sourceUrl);
		const evidence = new Set(
			words(
				`${title} ${decodedPath(source)} ${originalUrl ? decodedPath(new URL(originalUrl)) : ""}`,
			),
		);
		const nameMatches = nameWords.filter((word) => evidence.has(word)).length;
		// Require every distinctive name word, plus locality evidence or the place's own website.
		// A search ranking alone does not prove the image depicts this place.
		if (nameMatches !== nameWords.length) continue;
		const ownWebsite =
			websiteHost && source.hostname.replace(/^www\./, "") === websiteHost;
		const localityMatch = [...locationWords].some(
			(word) =>
				word.length >= 4 &&
				word !== "india" &&
				!nameWords.includes(word) &&
				evidence.has(word),
		);
		const regionalMatch =
			evidence.has("meghalaya") ||
			evidence.has("shillong") ||
			evidence.has("jaintia") ||
			evidence.has("khasi") ||
			evidence.has("garo");
		if (!ownWebsite && !localityMatch && !regionalMatch) continue;
		// Search thumbnails avoid source sites' hotlink restrictions. Keep the original source link.
		const trustedThumbnail =
			thumbnailUrl &&
			/(?:^|\.)(?:gstatic\.com|bing\.net)$/.test(
				new URL(thumbnailUrl).hostname,
			);
		const supportedOriginal =
			originalUrl &&
			/(?:^|\.)(?:gstatic\.com|bing\.net|upload\.wikimedia\.org|commons\.wikimedia\.org|lh3\.googleusercontent\.com)$/.test(
				new URL(originalUrl).hostname,
			);
		const imageUrl = trustedThumbnail
			? thumbnailUrl
			: supportedOriginal
				? originalUrl
				: null;
		if (!imageUrl) continue;
		candidates.push({
			imageUrl,
			sourceUrl,
			title,
			score:
				(ownWebsite ? 4 : 0) +
				(localityMatch ? 2 : 0) +
				(regionalMatch ? 1 : 0),
		});
	}
	candidates.sort((a, b) => b.score - a.score);
	const best = candidates[0];
	return best
		? { imageUrl: best.imageUrl, title: best.title, sourceUrl: best.sourceUrl }
		: null;
}
