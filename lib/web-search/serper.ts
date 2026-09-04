import type {
  WebSearchProduct,
  WebSearchSource,
  WebSearchVideo,
} from "./types";
import { getYouTubeThumbnailUrl, getYouTubeVideoId } from "./youtube";

const MAX_SOURCES = 12;
const MAX_PRODUCTS = 6;
const MAX_VIDEOS = 8;

type SerperRecord = Record<string, unknown>;

function asRecord(value: unknown): SerperRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SerperRecord)
    : null;
}

function normalizeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function normalizeScalarText(value: unknown, maxLength: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value).slice(0, maxLength)
    : normalizeText(value, maxLength);
}

function normalizeUrl(value: unknown) {
  const text = normalizeText(value, 2048);
  if (!text) {
    return null;
  }
  try {
    const url = new URL(text);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function getRecords(value: unknown) {
  return Array.isArray(value)
    ? value.map(asRecord).filter((entry): entry is SerperRecord => entry !== null)
    : [];
}

function normalizeSource(value: unknown): WebSearchSource | null {
  const record = asRecord(value);
  const url = normalizeUrl(record?.link);
  if (!record || !url) {
    return null;
  }
  const parsedUrl = new URL(url);
  return {
    title:
      normalizeText(record.title, 240) ??
      normalizeText(record.question, 240) ??
      parsedUrl.hostname,
    url,
    domain: parsedUrl.hostname.replace(/^www\./i, ""),
  };
}

function normalizeProduct(value: unknown): WebSearchProduct | null {
  const record = asRecord(value);
  const title = normalizeText(record?.title, 180);
  const url = normalizeUrl(record?.link);
  const price = normalizeText(record?.price, 48);
  if (!record || !title || !url || !price || !/\d/.test(price)) {
    return null;
  }

  const normalizedRating = normalizeScalarText(record.rating, 12);
  const parsedRating = normalizedRating === null
    ? Number.NaN
    : Number(normalizedRating);
  return {
    title,
    url,
    merchant:
      normalizeText(record.source, 100) ??
      new URL(url).hostname.replace(/^www\./i, ""),
    price,
    imageUrl: normalizeUrl(record.imageUrl),
    rating:
      Number.isFinite(parsedRating) && parsedRating >= 0 && parsedRating <= 5
        ? Math.round(parsedRating * 10) / 10
        : null,
    reviewCount:
      normalizeScalarText(record.ratingCount, 40) ??
      normalizeScalarText(record.reviews, 40),
    availability:
      normalizeText(record.delivery, 80) ??
      normalizeText(record.availability, 80),
  };
}

function normalizeVideo(value: unknown): WebSearchVideo | null {
  const record = asRecord(value);
  const url = normalizeUrl(record?.link);
  if (!record || !url) {
    return null;
  }
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }
  return {
    title: normalizeText(record.title, 240) ?? "YouTube video",
    url,
    videoId,
    thumbnailUrl:
      normalizeUrl(record.imageUrl) ?? getYouTubeThumbnailUrl(videoId),
    domain: new URL(url).hostname.replace(/^www\./i, ""),
  };
}

function sourceContextLine(value: SerperRecord, index: number) {
  const title =
    normalizeText(value.title, 240) ??
    normalizeText(value.question, 240) ??
    `Result ${index}`;
  const details = [
    normalizeText(value.snippet, 900),
    normalizeText(value.date, 80),
    normalizeText(value.source, 100),
  ].filter((entry): entry is string => Boolean(entry));
  const url = normalizeUrl(value.link);
  return [
    `[${index}] ${title}`,
    details.join(" — "),
    url ? `URL: ${url}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseSerperSearchResponse({
  includeProducts,
  includeVideos,
  response,
}: {
  includeProducts: boolean;
  includeVideos: boolean;
  response: unknown;
}) {
  const root = asRecord(response) ?? {};
  const organic = getRecords(root.organic);
  const news = getRecords(root.news);
  const shopping = getRecords(root.shopping);
  const videoResults = getRecords(root.videos);
  const answerBox = asRecord(root.answerBox);
  const knowledgeGraph = asRecord(root.knowledgeGraph);

  const orderedRecords = includeProducts
    ? shopping
    : includeVideos
      ? videoResults
      : [...organic, ...news];
  const extraSourceRecords = [
    ...(answerBox ? [answerBox] : []),
    ...(knowledgeGraph?.descriptionLink
      ? [{
          link: knowledgeGraph.descriptionLink,
          title: knowledgeGraph.title,
        }]
      : []),
  ];
  const sources = Array.from(
    new Map(
      [...extraSourceRecords, ...orderedRecords]
        .map(normalizeSource)
        .filter((source): source is WebSearchSource => source !== null)
        .map((source) => [source.url, source])
    ).values()
  ).slice(0, MAX_SOURCES);

  const products = includeProducts
    ? Array.from(
        new Map(
          shopping
            .map(normalizeProduct)
            .filter((product): product is WebSearchProduct => product !== null)
            .map((product) => [product.url, product])
        ).values()
      ).slice(0, MAX_PRODUCTS)
    : [];
  const videos = includeVideos
    ? Array.from(
        new Map(
          videoResults
            .map(normalizeVideo)
            .filter((video): video is WebSearchVideo => video !== null)
            .map((video) => [video.videoId, video])
        ).values()
      ).slice(0, MAX_VIDEOS)
    : [];

  const directAnswer =
    normalizeText(answerBox?.answer, 1200) ??
    normalizeText(answerBox?.snippet, 1200) ??
    normalizeText(knowledgeGraph?.description, 1200);
  const resultContext = orderedRecords
    .slice(0, MAX_SOURCES)
    .map((entry, index) => sourceContextLine(entry, index + 1))
    .join("\n\n");
  const answer = [
    directAnswer,
    resultContext,
  ]
    .filter(Boolean)
    .join("\n\n") || "No current public search results were returned for this query.";

  return { answer, products, sources, videos };
}
