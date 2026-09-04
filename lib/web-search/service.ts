import "server-only";

import { GoogleGenAI } from "@google/genai";
import { enrichShoppingProducts } from "./product-enrichment";
import {
  buildGroundedShoppingFallbacks,
  extractShoppingProducts,
} from "./products";
import { parseSerperSearchResponse } from "./serper";
import type {
  WebSearchAnswer,
  WebSearchCitation,
  WebSearchProduct,
  WebSearchProvider,
  WebSearchSource,
  WebSearchVideo,
} from "./types";
import { getYouTubeThumbnailUrl, getYouTubeVideoId } from "./youtube";

const DEFAULT_GEMINI_WEB_SEARCH_MODEL = "gemini-2.5-flash";
const MAX_SOURCES = 12;
const SERPER_SEARCH_TIMEOUT_MS = 12_000;

function getSerperEndpoint({
  includeNews,
  includeProducts,
  includeVideos,
}: {
  includeNews: boolean;
  includeProducts: boolean;
  includeVideos: boolean;
}) {
  if (includeProducts) {
    return "https://google.serper.dev/shopping";
  }
  if (includeVideos) {
    return "https://google.serper.dev/videos";
  }
  if (includeNews) {
    return "https://google.serper.dev/news";
  }
  return "https://google.serper.dev/search";
}

function normalizeVideoLink(
  url: string,
  title: string,
  domain = "youtube.com"
): WebSearchVideo | null {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    return null;
  }

  return {
    title: title.trim().slice(0, 240) || "YouTube video",
    url,
    videoId,
    thumbnailUrl: getYouTubeThumbnailUrl(videoId),
    domain: domain.trim() || "youtube.com",
  };
}

function normalizeVideo(source: WebSearchSource) {
  return normalizeVideoLink(
    source.url,
    source.title,
    source.domain ?? undefined
  );
}

function extractVideosFromAnswer(answer: string) {
  const candidates: Array<{ title: string; url: string }> = [];
  const markdownLinkPattern = /\[([^\]]{1,240})\]\((https?:\/\/[^)\s]+)\)/gi;
  for (const match of answer.matchAll(markdownLinkPattern)) {
    if (match[1] && match[2]) {
      candidates.push({ title: match[1], url: match[2] });
    }
  }

  const plainUrlPattern = /https?:\/\/[^\s)\]"<>]+/gi;
  for (const url of answer.match(plainUrlPattern) ?? []) {
    candidates.push({ title: "YouTube video", url: url.replace(/[.,;:!?]+$/, "") });
  }

  return candidates
    .map((candidate) =>
      normalizeVideoLink(candidate.url, candidate.title, "youtube.com")
    )
    .filter((video): video is WebSearchVideo => video !== null);
}

function normalizeSource(source: unknown): WebSearchSource | null {
  if (!source || typeof source !== "object") {
    return null;
  }
  const record = source as { uri?: unknown; title?: unknown; domain?: unknown };
  if (typeof record.uri !== "string") {
    return null;
  }
  try {
    const url = new URL(record.uri);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return {
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title.trim().slice(0, 240)
          : url.hostname,
      url: url.toString(),
      domain:
        typeof record.domain === "string" && record.domain.trim()
          ? record.domain.trim().slice(0, 120)
          : url.hostname,
    };
  } catch {
    return null;
  }
}

function getGroundingMetadata(response: unknown) {
  const candidate = (response as {
    candidates?: Array<{ groundingMetadata?: unknown }>;
  }).candidates?.[0];
  return candidate?.groundingMetadata as
    | {
        groundingChunks?: Array<{ web?: unknown }>;
        groundingSupports?: Array<{
          groundingChunkIndices?: number[];
          segment?: {
            endIndex?: number;
            startIndex?: number;
            text?: string;
          };
        }>;
        searchEntryPoint?: {
          renderedContent?: string;
        };
        webSearchQueries?: string[];
      }
    | undefined;
}

function resolveGeminiModel(model: string) {
  const configured = process.env.GEMINI_WEB_SEARCH_MODEL?.trim();
  if (configured) {
    return configured;
  }
  return model.toLowerCase().includes("gemini")
    ? model
    : DEFAULT_GEMINI_WEB_SEARCH_MODEL;
}

async function answerWithGeminiGrounding({
  conversationContext,
  includeVideos,
  includeProducts,
  maxSearches,
  model,
  userMessage,
}: {
  conversationContext?: string;
  includeVideos: boolean;
  includeProducts: boolean;
  maxSearches: number;
  model: string;
  userMessage: string;
}): Promise<WebSearchAnswer> {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Gemini web search requires GOOGLE_API_KEY.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const prompt = [
    "Answer the user's question using current public web information.",
    "Google Search is enabled for this request. Use it before answering, especially when the user asks to browse, search online, look something up, or find a person or place, instead of relying only on model memory.",
    "Answer the user's actual information request directly; do not describe your search capabilities or say that you cannot browse when Google Search is enabled.",
    includeVideos
      ? "The user is asking for videos. Prioritize relevant YouTube video results, preserve direct YouTube URLs, and include each result as a Markdown link with its title and direct watch URL. Do not replace the results with generic search instructions. If no suitable videos are found, say so clearly instead of inventing links."
      : "",
    includeProducts
      ? [
          "This is a shopping discovery request. Search for currently listed products that satisfy the user's requested item, budget, location, and other constraints.",
          "Give a concise natural-language answer, then append exactly one <khasigpt_products> JSON block containing a products array with up to 6 current options.",
          "Each product must have title, direct product-page url, merchant, and the exact displayed price. Optional fields are imageUrl, rating, reviewCount, and availability.",
          "Only include a product when the current search evidence shows both its direct page and price. Never infer or invent a product, price, rating, availability, URL, or image URL. Omit optional values when they are not shown. Use an empty products array when no trustworthy options are found.",
          "The JSON block is machine-readable metadata. Do not discuss it in the natural-language answer and do not wrap the <khasigpt_products> block in Markdown fences.",
        ].join(" ")
      : "",
    `Use no more than ${Math.max(1, maxSearches)} distinct web searches when possible.`,
    "Cite factual claims from the grounded web sources in your answer when supported.",
    conversationContext?.trim()
      ? `Relevant conversation and custom knowledge context:\n${conversationContext.trim()}`
      : "",
    `User question:\n${userMessage.trim()}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await ai.models.generateContent({
    model: resolveGeminiModel(model),
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
    },
  });
  const rawAnswer = response.text?.trim() ?? "";
  if (!rawAnswer) {
    throw new Error("Gemini web search returned an empty answer.");
  }
  const shoppingResult = includeProducts
    ? extractShoppingProducts(rawAnswer)
    : { answer: rawAnswer, products: [] as WebSearchProduct[] };
  const answer = shoppingResult.answer;
  const productMetadataStartIndex = includeProducts
    ? rawAnswer.search(/<khasigpt_products>/i)
    : -1;

  const metadata = getGroundingMetadata(response);
  const sourceMap = new Map<string, number>();
  const sourceIndexesByGroundingChunk = new Map<number, number>();
  const sources: WebSearchSource[] = [];
  for (const [groundingIndex, chunk] of (metadata?.groundingChunks ?? []).entries()) {
    const source = normalizeSource(chunk.web);
    if (!source) {
      continue;
    }

    const existingIndex = sourceMap.get(source.url);
    if (existingIndex) {
      sourceIndexesByGroundingChunk.set(groundingIndex, existingIndex);
      continue;
    }

    if (sources.length >= MAX_SOURCES) {
      break;
    }

    sources.push(source);
    const displayIndex = sources.length;
    sourceMap.set(source.url, displayIndex);
    sourceIndexesByGroundingChunk.set(groundingIndex, displayIndex);
  }
  const searchQueries = Array.from(
    new Set(
      (metadata?.webSearchQueries ?? []).filter(
        (query): query is string => typeof query === "string" && query.trim().length > 0
      )
    )
  ).slice(0, Math.max(1, maxSearches));
  const citations: WebSearchCitation[] = (metadata?.groundingSupports ?? [])
    .map((support) => {
      const text = support.segment?.text?.trim();
      if (
        (productMetadataStartIndex >= 0 &&
          typeof support.segment?.startIndex === "number" &&
          support.segment.startIndex >= productMetadataStartIndex) ||
        /<\/?khasigpt_products>|"(?:title|merchant|price|imageUrl)"\s*:/i.test(
          text ?? ""
        )
      ) {
        return null;
      }
      const sourceIndexes = Array.from(
        new Set(
          (support.groundingChunkIndices ?? [])
            .map((index) => sourceIndexesByGroundingChunk.get(index))
            .filter((index): index is number => typeof index === "number")
        )
      );
      if (!text || sourceIndexes.length === 0) {
        return null;
      }

      return {
        text,
        sourceIndexes,
        ...(typeof support.segment?.startIndex === "number"
          ? { startIndex: support.segment.startIndex }
          : {}),
        ...(typeof support.segment?.endIndex === "number"
          ? { endIndex: support.segment.endIndex }
          : {}),
      } satisfies WebSearchCitation;
    })
    .filter((citation): citation is WebSearchCitation => citation !== null)
    .slice(0, 24);
  const enrichedProducts = includeProducts
    ? await enrichShoppingProducts({
        products: shoppingResult.products,
        userMessage,
      })
    : [];
  const products =
    includeProducts && enrichedProducts.length === 0
      ? buildGroundedShoppingFallbacks({ sources, userMessage })
      : enrichedProducts;
  if (includeProducts) {
    for (const product of products) {
      if (
        product.verified !== true ||
        sources.length >= MAX_SOURCES ||
        sourceMap.has(product.url)
      ) {
        continue;
      }
      sources.push({
        domain: new URL(product.url).hostname.replace(/^www\./i, ""),
        title: product.title,
        url: product.url,
      });
      sourceMap.set(product.url, sources.length);
    }
  }
  const videos = includeVideos
    ? Array.from(
        new Map(
          [
            ...sources.map(normalizeVideo),
            ...extractVideosFromAnswer(answer),
          ]
            .filter((video): video is WebSearchVideo => video !== null)
            .map((video) => [video.videoId, video])
        ).values()
      ).slice(0, 8)
    : [];
  const usageMetadata = response.usageMetadata;
  const inputTokens = usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = usageMetadata?.candidatesTokenCount ?? 0;

  return {
    answer,
    provider: "gemini_grounding",
    grounded: searchQueries.length > 0 || sourceMap.size > 0,
    sources,
    videos,
    products,
    searchQueries,
    citations,
    searchCallCount: searchQueries.length,
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: usageMetadata?.totalTokenCount ?? inputTokens + outputTokens,
    },
  };
}

async function answerWithSerper({
  includeNews,
  includeProducts,
  includeVideos,
  userMessage,
}: {
  includeNews: boolean;
  includeProducts: boolean;
  includeVideos: boolean;
  userMessage: string;
}): Promise<WebSearchAnswer> {
  const apiKey = process.env.SERPER_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Serper web search requires SERPER_API_KEY.");
  }

  const response = await fetch(
    getSerperEndpoint({ includeNews, includeProducts, includeVideos }),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-KEY": apiKey,
      },
      body: JSON.stringify({
        q: userMessage.trim(),
        gl: "in",
        hl: "en",
        num: 10,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(SERPER_SEARCH_TIMEOUT_MS),
    }
  );
  if (!response.ok) {
    throw new Error(`Serper web search failed with status ${response.status}.`);
  }

  const parsed = parseSerperSearchResponse({
    includeProducts,
    includeVideos,
    response: await response.json(),
  });
  const enrichedProducts = includeProducts
    ? await enrichShoppingProducts({
        products: parsed.products,
        userMessage,
      })
    : [];
  const products =
    includeProducts && enrichedProducts.length === 0
      ? buildGroundedShoppingFallbacks({
          sources: parsed.sources,
          userMessage,
        })
      : enrichedProducts;

  return {
    answer: parsed.answer,
    provider: "serper",
    grounded: parsed.sources.length > 0,
    sources: parsed.sources,
    videos: parsed.videos,
    products,
    searchQueries: [userMessage.trim()],
    citations: [],
    searchCallCount: 1,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
  };
}

export type WebSearchAnswerInput = {
  provider: WebSearchProvider;
  userMessage: string;
  conversationContext?: string;
  includeNews?: boolean;
  includeVideos?: boolean;
  includeProducts?: boolean;
  model: string;
  maxSearches: number;
};

export const webSearchService = {
  async answerWithSearch({
    conversationContext,
    includeNews = false,
    includeVideos = false,
    includeProducts = false,
    maxSearches,
    model,
    provider,
    userMessage,
  }: WebSearchAnswerInput): Promise<WebSearchAnswer> {
    switch (provider) {
      case "gemini_grounding":
        return answerWithGeminiGrounding({
          conversationContext,
          includeVideos,
          includeProducts,
          maxSearches,
          model,
          userMessage,
        });
      case "openai_web_search":
        throw new Error("OpenAI web search is not implemented yet.");
      case "serper":
        return answerWithSerper({
          includeNews,
          includeProducts,
          includeVideos,
          userMessage,
        });
      case "disabled":
        throw new Error("Web search is disabled.");
      default:
        throw new Error(`Unsupported web search provider: ${provider}`);
    }
  },
};
