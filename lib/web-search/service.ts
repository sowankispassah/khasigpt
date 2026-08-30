import "server-only";

import { GoogleGenAI } from "@google/genai";
import type {
  WebSearchAnswer,
  WebSearchCitation,
  WebSearchProvider,
  WebSearchSource,
  WebSearchVideo,
} from "./types";
import { getYouTubeThumbnailUrl, getYouTubeVideoId } from "./youtube";

const DEFAULT_GEMINI_WEB_SEARCH_MODEL = "gemini-2.5-flash";
const MAX_SOURCES = 12;

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
  maxSearches,
  model,
  userMessage,
}: {
  conversationContext?: string;
  includeVideos: boolean;
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
    "Google Search is enabled for this request because the user explicitly requested web results or asked for time-sensitive public information. Use it before answering instead of relying only on model memory.",
    "Answer the user's actual information request directly; do not describe your search capabilities or say that you cannot browse when Google Search is enabled.",
    "Keep the answer strictly scoped to what the user asked. For questions about a person, do not broaden the search or answer into unrelated usernames, online profiles, platform activity, gaming history, education, employment, or other personal details unless the user explicitly requested those exact details.",
    "Do not include speculative identity matches or combine information from different people who have similar names. Omit uncertain or unrelated results.",
    includeVideos
      ? "The user is asking for videos. Prioritize relevant YouTube video results, preserve direct YouTube URLs, and include each result as a Markdown link with its title and direct watch URL. Do not replace the results with generic search instructions. If no suitable videos are found, say so clearly instead of inventing links."
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
  const answer = response.text?.trim() ?? "";
  if (!answer) {
    throw new Error("Gemini web search returned an empty answer.");
  }

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

export type WebSearchAnswerInput = {
  provider: WebSearchProvider;
  userMessage: string;
  conversationContext?: string;
  includeVideos?: boolean;
  model: string;
  maxSearches: number;
};

export const webSearchService = {
  async answerWithSearch({
    conversationContext,
    includeVideos = false,
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
          maxSearches,
          model,
          userMessage,
        });
      case "openai_web_search":
        throw new Error("OpenAI web search is not implemented yet.");
      case "disabled":
        throw new Error("Web search is disabled.");
      default:
        throw new Error(`Unsupported web search provider: ${provider}`);
    }
  },
};
