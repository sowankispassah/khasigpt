import "server-only";
import { createHash } from "node:crypto";

export async function searchSerperImages(
	query: string,
	signal?: AbortSignal,
): Promise<unknown> {
	const key = process.env.SERPER_API_KEY?.trim();
	if (!key) throw new Error("Image search credentials unavailable.");
	const startedAt = performance.now();
	const response = await fetch("https://google.serper.dev/images", {
		method: "POST",
		headers: { "Content-Type": "application/json", "X-API-KEY": key },
		body: JSON.stringify({ q: query, gl: "in", hl: "en", num: 10 }),
		cache: "no-store",
		signal: signal ?? AbortSignal.timeout(6_000),
	});
	if (!response.ok)
		throw new Error(`Image search returned HTTP ${response.status}.`);
	const payload: unknown = await response.json();
	console.info("[explore/images] lookup completed", {
		queryHash: createHash("sha256").update(query).digest("hex").slice(0, 16),
		durationMs: Math.round(performance.now() - startedAt),
		credits:
			payload &&
			typeof payload === "object" &&
			"credits" in payload &&
			typeof payload.credits === "number"
				? payload.credits
				: 1,
	});
	return payload;
}
