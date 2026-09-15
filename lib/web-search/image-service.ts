import "server-only";

import type { VisualSearchCandidate } from "./image-search-core";

const GOOGLE_IMAGE_SEARCH_URL =
  "https://customsearch.googleapis.com/customsearch/v1";
const WIKIMEDIA_IMAGE_SEARCH_URL =
  "https://commons.wikimedia.org/w/api.php";
const SEARCH_TIMEOUT_MS = 7_000;
const SEARCH_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 100;

type CachedVisualSearch = {
  expiresAt: number;
  candidates: VisualSearchCandidate[];
};

const visualSearchCache = new Map<string, CachedVisualSearch>();

function safeHttpUrl(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sourceDomain(value: string) {
  try {
    return new URL(value).hostname.toLocaleLowerCase();
  } catch {
    return undefined;
  }
}

function boundedNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

async function searchGoogleCustomImages(query: string) {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  const searchEngineId =
    process.env.GOOGLE_CUSTOM_SEARCH_ENGINE_ID?.trim() ??
    process.env.GOOGLE_CSE_ID?.trim();
  if (!(apiKey && searchEngineId)) {
    return [];
  }

  const url = new URL(GOOGLE_IMAGE_SEARCH_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", searchEngineId);
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("safe", "active");
  url.searchParams.set("imgType", "photo");
  url.searchParams.set("imgSize", "xlarge");
  url.searchParams.set("filter", "1");
  url.searchParams.set("gl", "in");
  url.searchParams.set("num", "10");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)" },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`visual_search_http_${response.status}`);
  }
  const payload = (await response.json()) as {
    items?: Array<{
      link?: unknown;
      mime?: unknown;
      snippet?: unknown;
      title?: unknown;
      image?: {
        byteSize?: unknown;
        contextLink?: unknown;
        height?: unknown;
        width?: unknown;
      };
    }>;
  };

  return (payload.items ?? []).flatMap((item) => {
    const imageUrl = safeHttpUrl(item.link);
    const sourceUrl = safeHttpUrl(item.image?.contextLink);
    if (!(imageUrl && sourceUrl)) {
      return [];
    }
    return [
      {
        imageUrl,
        sourceUrl,
        title:
          typeof item.title === "string" ? item.title.slice(0, 240) : query,
        snippet:
          typeof item.snippet === "string"
            ? item.snippet.slice(0, 500)
            : undefined,
        sourceDomain: sourceDomain(sourceUrl),
        mediaType:
          typeof item.mime === "string"
            ? item.mime.toLocaleLowerCase()
            : undefined,
        width: boundedNumber(item.image?.width),
        height: boundedNumber(item.image?.height),
        byteSize: boundedNumber(item.image?.byteSize),
        provider: "google_custom_search" as const,
      },
    ];
  });
}

async function searchWikimediaCommons(query: string) {
  const url = new URL(WIKIMEDIA_IMAGE_SEARCH_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatversion", "2");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrsearch", `${query} filetype:bitmap`);
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", "10");
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|size|mime");
  url.searchParams.set("iiurlwidth", "1600");

  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "KhasiGPT/3.1 (https://khasigpt.com)" },
    signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`visual_search_http_${response.status}`);
  }
  const payload = (await response.json()) as {
    query?: {
      pages?: Array<{
        title?: unknown;
        imageinfo?: Array<{
          canonicalurl?: unknown;
          descriptionurl?: unknown;
          height?: unknown;
          mime?: unknown;
          thumbheight?: unknown;
          thumburl?: unknown;
          thumbwidth?: unknown;
          url?: unknown;
          width?: unknown;
        }>;
      }>;
    };
  };

  return (payload.query?.pages ?? []).flatMap((page) => {
    const info = page.imageinfo?.[0];
    const imageUrl = safeHttpUrl(info?.thumburl) ?? safeHttpUrl(info?.url);
    const sourceUrl =
      safeHttpUrl(info?.descriptionurl) ?? safeHttpUrl(info?.canonicalurl);
    if (!(imageUrl && sourceUrl)) {
      return [];
    }
    return [
      {
        imageUrl,
        sourceUrl,
        title:
          typeof page.title === "string"
            ? page.title.replace(/^File:/i, "").slice(0, 240)
            : query,
        sourceDomain: sourceDomain(sourceUrl),
        mediaType:
          typeof info?.mime === "string"
            ? info.mime.toLocaleLowerCase()
            : undefined,
        width: boundedNumber(info?.thumbwidth) ?? boundedNumber(info?.width),
        height:
          boundedNumber(info?.thumbheight) ?? boundedNumber(info?.height),
        provider: "wikimedia_commons" as const,
      },
    ];
  });
}

function rememberSearch(key: string, candidates: VisualSearchCandidate[]) {
  if (visualSearchCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = visualSearchCache.keys().next().value;
    if (oldestKey) {
      visualSearchCache.delete(oldestKey);
    }
  }
  visualSearchCache.set(key, {
    candidates,
    expiresAt: Date.now() + SEARCH_CACHE_TTL_MS,
  });
}

export const visualImageSearchService = {
  async search(query: string): Promise<VisualSearchCandidate[]> {
    const normalizedQuery = query.trim().replace(/\s+/g, " ").slice(0, 240);
    if (!normalizedQuery) {
      return [];
    }
    const cacheKey = normalizedQuery.toLocaleLowerCase();
    const cached = visualSearchCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.candidates;
    }

    let googleCandidates: VisualSearchCandidate[] = [];
    try {
      googleCandidates = await searchGoogleCustomImages(normalizedQuery);
    } catch (error) {
      console.warn("[visual-reference/search] Google image search unavailable.", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    let commonsCandidates: VisualSearchCandidate[] = [];
    if (googleCandidates.length < 4) {
      try {
        commonsCandidates = await searchWikimediaCommons(normalizedQuery);
      } catch (error) {
        console.warn("[visual-reference/search] Wikimedia image search unavailable.", {
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const candidates = [...googleCandidates, ...commonsCandidates];
    rememberSearch(cacheKey, candidates);
    return candidates;
  },
};
