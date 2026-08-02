"use client";

import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Play,
  Search,
} from "lucide-react";
import { useState } from "react";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { cn } from "@/lib/utils";
import type {
  WebSearchCitation,
  WebSearchSource,
  WebSearchStatusData,
  WebSearchVideo,
} from "@/lib/web-search/types";
import {
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  getYouTubeVideoId,
} from "@/lib/web-search/youtube";

function getStatusCopy(status: WebSearchStatusData["status"]) {
  switch (status) {
    case "reading":
      return {
        defaultText: "Reading relevant sources...",
        description: "Status shown while Web Search reads grounded sources.",
        key: "chat.web_search.reading",
      };
    case "generating":
      return {
        defaultText: "Preparing an answer...",
        description: "Status shown while the assistant prepares a grounded answer.",
        key: "chat.web_search.generating",
      };
    case "failed":
      return {
        defaultText: "I couldn’t complete the web search. Please try again.",
        description: "Error shown when grounded Web Search cannot be completed.",
        key: "chat.web_search.failed",
      };
    default:
      return {
        defaultText: "Searching the web...",
        description: "Status shown while a current-information answer is grounded with Web Search.",
        key: "chat.web_search.searching",
      };
  }
}

function getProviderCopy(provider: string) {
  if (provider === "gemini_grounding") {
    return {
      defaultText: "Google Search",
      description: "Provider label shown for Gemini grounded web search.",
      key: "chat.web_search.provider.gemini",
    };
  }

  return {
    defaultText: "Web Search",
    description: "Provider label shown for grounded web search.",
    key: "chat.web_search.provider.web",
  };
}

export function WebSearchStatus({
  onRetry,
  status,
}: {
  onRetry?: () => Promise<void> | void;
  status: WebSearchStatusData;
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const copy = getStatusCopy(status.status);
  const isFailed = status.status === "failed";

  const handleRetry = async () => {
    if (!onRetry || isRetrying) {
      return;
    }
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div
      aria-live="polite"
      className={cn(
        "mb-3 flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-sm",
        isFailed
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : "border-border/60 bg-muted/30 text-muted-foreground"
      )}
      data-testid="web-search-status"
      role={isFailed ? "alert" : "status"}
    >
      {isFailed ? (
        <AlertCircle className="mt-0.5 size-4 shrink-0" />
      ) : (
        <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          <EditableTranslation
            defaultText={copy.defaultText}
            description={copy.description}
            translationKey={copy.key}
          />
        </div>
        {isFailed && onRetry ? (
          <button
            className="mt-2 cursor-pointer rounded-md border border-current/30 px-2.5 py-1 text-xs font-medium transition hover:bg-background/70 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isRetrying}
            onClick={() => void handleRetry()}
            type="button"
          >
            {isRetrying ? (
              <span className="inline-flex items-center gap-1.5">
                <LoaderCircle className="size-3 animate-spin" />
                <EditableTranslation
                  defaultText="Retrying..."
                  description="Button label shown while retrying a failed Web Search request."
                  translationKey="chat.web_search.retrying"
                />
              </span>
            ) : (
              <EditableTranslation
                defaultText="Retry"
                description="Button that retries a failed Web Search request."
                translationKey="chat.web_search.retry"
              />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function normalizeSource(source: WebSearchSource) {
  try {
    const url = new URL(source.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return {
      ...source,
      domain: source.domain?.trim() || url.hostname,
      title: source.title?.trim() || url.hostname,
      url: url.toString(),
    };
  } catch {
    return null;
  }
}

function normalizeVideo(video: WebSearchVideo) {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId || videoId !== video.videoId) {
    return null;
  }
  return {
    ...video,
    thumbnailUrl: getYouTubeThumbnailUrl(videoId),
    videoId,
  };
}

function WebSearchVideos({ videos }: { videos: WebSearchVideo[] }) {
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const safeVideos = videos
    .map(normalizeVideo)
    .filter(
      (video): video is NonNullable<ReturnType<typeof normalizeVideo>> =>
        Boolean(video)
    )
    .filter(
      (video, index, all) =>
        all.findIndex((item) => item.videoId === video.videoId) === index
    )
    .slice(0, 8);

  if (safeVideos.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="web-search-videos">
      <div className="font-medium text-foreground text-sm">
        <EditableTranslation
          defaultText="Videos"
          description="Heading above video results returned by grounded Web Search."
          translationKey="chat.web_search.videos"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {safeVideos.map((video) => {
          const isActive = activeVideoId === video.videoId;
          return (
            <div
              className="min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/70"
              key={video.videoId}
            >
              {isActive ? (
                <iframe
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  className="aspect-video w-full border-0"
                  src={getYouTubeEmbedUrl(video.videoId)}
                  title={video.title}
                />
              ) : (
                <button
                  aria-label={`Play ${video.title}`}
                  className="group relative block aspect-video w-full cursor-pointer overflow-hidden bg-muted text-left"
                  onClick={() => setActiveVideoId(video.videoId)}
                  type="button"
                >
                  {/* biome-ignore lint/performance/noImgElement: YouTube thumbnails are dynamic remote media derived from a validated video ID. */}
                  <img
                    alt=""
                    className="size-full object-cover transition duration-200 group-hover:scale-[1.02]"
                    loading="lazy"
                    src={video.thumbnailUrl}
                  />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/15 transition group-hover:bg-black/25">
                    <span className="flex size-12 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition group-hover:scale-105">
                      <Play className="ml-0.5 size-5 fill-current" />
                    </span>
                  </span>
                </button>
              )}
              <a
                className="flex items-start gap-2 px-3 py-2.5 transition hover:bg-muted/40"
                href={video.url}
                rel="noreferrer noopener"
                target="_blank"
              >
                <span className="min-w-0 flex-1">
                  <span className="block line-clamp-2 font-medium text-foreground text-xs">
                    {video.title}
                  </span>
                  <span className="mt-1 block truncate text-muted-foreground text-[11px]">
                    {video.domain}
                  </span>
                </span>
                <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              </a>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WebSearchSources({
  citations = [],
  provider,
  searchQueries = [],
  sources,
  videos = [],
}: {
  citations?: WebSearchCitation[];
  provider: string;
  searchQueries?: string[];
  sources: WebSearchSource[];
  videos?: WebSearchVideo[];
}) {
  const safeSources = sources
    .map(normalizeSource)
    .filter((source): source is NonNullable<ReturnType<typeof normalizeSource>> => Boolean(source))
    .filter((source, index, all) => all.findIndex((item) => item.url === source.url) === index);
  const safeQueries = searchQueries
    .filter((query): query is string => typeof query === "string" && query.trim().length > 0)
    .map((query) => query.trim())
    .filter((query, index, all) => all.indexOf(query) === index)
    .slice(0, 6);
  const safeCitations = citations
    .filter((citation) => citation.text?.trim() && citation.sourceIndexes?.length)
    .slice(0, 6);
  const safeVideos = videos
    .map(normalizeVideo)
    .filter(
      (video): video is NonNullable<ReturnType<typeof normalizeVideo>> =>
        Boolean(video)
    );

  if (
    safeSources.length === 0 &&
    safeQueries.length === 0 &&
    safeCitations.length === 0 &&
    safeVideos.length === 0
  ) {
    return null;
  }

  const citationCountBySource = new Map<number, number>();
  for (const citation of safeCitations) {
    for (const sourceIndex of citation.sourceIndexes) {
      citationCountBySource.set(
        sourceIndex,
        (citationCountBySource.get(sourceIndex) ?? 0) + 1
      );
    }
  }
  const providerCopy = provider ? getProviderCopy(provider) : null;

  return (
    <details
      className="group w-full rounded-xl border border-border/60 bg-muted/20 text-left"
      data-testid="web-search-sources"
      open
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
        <Globe2 className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 font-medium text-foreground">
          <EditableTranslation
            defaultText="Sources ({count})"
            description="Expandable heading above links returned by grounded Web Search."
            translationKey="chat.web_search.sources_count"
            values={{ count: safeSources.length }}
          />
        </span>
        {providerCopy ? (
          <span className="max-w-[45%] truncate text-muted-foreground text-xs">
            <EditableTranslation
              defaultText={providerCopy.defaultText}
              description={providerCopy.description}
              translationKey={providerCopy.key}
            />
          </span>
        ) : null}
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>

      <div className="space-y-3 border-border/60 border-t px-3 py-3">
        {safeVideos.length > 0 ? <WebSearchVideos videos={safeVideos} /> : null}
        {safeSources.length > 0 ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {safeSources.map((source, index) => {
              const citationCount = citationCountBySource.get(index + 1);
              return (
                <a
                  className="group flex min-w-0 items-start gap-2 rounded-lg border border-border/50 bg-background/70 px-2.5 py-2 transition hover:border-primary/40 hover:bg-background"
                  href={source.url}
                  key={source.url}
                  rel="noreferrer noopener"
                  target="_blank"
                >
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 font-medium text-primary text-xs">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-foreground text-xs">
                      {source.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1 text-muted-foreground text-[11px]">
                      <span className="truncate">{source.domain}</span>
                      {citationCount ? (
                        <span className="shrink-0">
                          ·{" "}
                          <EditableTranslation
                            defaultText={citationCount === 1 ? "{count} citation" : "{count} citations"}
                            description="Citation count shown beside a grounded Web Search source."
                            translationKey={
                              citationCount === 1
                                ? "chat.web_search.citation"
                                : "chat.web_search.citations"
                            }
                            values={{ count: citationCount }}
                          />
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                </a>
              );
            })}
          </div>
        ) : null}

        {safeCitations.length > 0 ? (
          <div className="space-y-1.5">
            <div className="font-medium text-muted-foreground text-xs">
              <EditableTranslation
                defaultText="Referenced claims"
                description="Label above claim-level citations returned by grounded Web Search."
                translationKey="chat.web_search.citation_highlights"
              />
            </div>
            <div className="space-y-1.5">
              {safeCitations.map((citation, index) => (
                <div
                  className="flex items-start gap-2 rounded-lg bg-background/60 px-2.5 py-2 text-xs"
                  key={`${citation.text}-${index}`}
                >
                  <span className="flex shrink-0 items-center gap-1 pt-0.5">
                    {citation.sourceIndexes.map((sourceIndex) => {
                      const source = safeSources[sourceIndex - 1];
                      return source ? (
                        <a
                          aria-label={`Source ${sourceIndex}`}
                          className="cursor-pointer font-medium text-primary underline-offset-2 hover:underline"
                          href={source.url}
                          key={sourceIndex}
                          rel="noreferrer noopener"
                          target="_blank"
                        >
                          [{sourceIndex}]
                        </a>
                      ) : (
                        <span className="font-medium text-primary" key={sourceIndex}>
                          [{sourceIndex}]
                        </span>
                      );
                    })}
                  </span>
                  <span className="text-muted-foreground">{citation.text}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {safeQueries.length > 0 ? (
          <div className="space-y-1.5">
            <div className="font-medium text-muted-foreground text-xs">
              <EditableTranslation
                defaultText="Searches used"
                description="Label above the web queries used to ground an answer."
                translationKey="chat.web_search.searches_used"
              />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {safeQueries.map((query) => (
                <span
                  className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 bg-background/70 px-2 py-1 text-muted-foreground text-[11px]"
                  key={query}
                >
                  <Search className="size-3 shrink-0" />
                  <span className="truncate">{query}</span>
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </details>
  );
}
