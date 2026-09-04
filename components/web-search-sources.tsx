"use client";

import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  Globe2,
  LoaderCircle,
  Play,
  Search,
  ShoppingBag,
  Star,
} from "lucide-react";
import { useState } from "react";
import { AnimatedStatus } from "@/components/animated-status";
import { useTranslation } from "@/components/language-provider";
import { EditableTranslation } from "@/components/translation-edit-provider";
import { cn } from "@/lib/utils";
import {
  type DisplayWebSearchProduct,
  normalizeWebSearchProductForDisplay,
} from "@/lib/web-search/product-display";
import type {
  WebSearchCitation,
  WebSearchProduct,
  WebSearchSource,
  WebSearchStatusData,
  WebSearchVideo,
} from "@/lib/web-search/types";
import {
  getYouTubeEmbedUrl,
  getYouTubeThumbnailUrl,
  getYouTubeVideoId,
} from "@/lib/web-search/youtube";

function getActiveStatusCopy(context: WebSearchStatusData["context"]) {
  if (context === "news") {
    return {
      defaultText: "Checking the latest sources",
      description: "Status shown while KhasiGPT checks current sources for News.",
      key: "news.status.checking_latest_sources",
    };
  }
  return {
    defaultText: "Checking additional sources",
    description: "Status shown while KhasiGPT checks additional current sources.",
    key: "chat.web_search.checking_sources",
  };
}

export function WebSearchStatus({
  onRetry,
  status,
}: {
  onRetry?: () => Promise<void> | void;
  status: WebSearchStatusData;
}) {
  const { translate } = useTranslation();
  const [isRetrying, setIsRetrying] = useState(false);
  const isFailed = status.status === "failed";
  const activeCopy = getActiveStatusCopy(status.context);

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

  if (!isFailed) {
    return (
      <AnimatedStatus
        ariaLabel={translate(activeCopy.key, activeCopy.defaultText)}
        className="mb-3 pl-3 md:pl-4"
        label={
          <EditableTranslation
            defaultText={activeCopy.defaultText}
            description={activeCopy.description}
            translationKey={activeCopy.key}
          />
        }
        testId="web-search-status"
      />
    );
  }

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
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          <EditableTranslation
            defaultText="I couldn’t check additional sources. Please try again."
            description="Error shown when KhasiGPT cannot check additional current sources."
            translationKey="chat.web_search.failed"
          />
        </div>
        {onRetry ? (
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

function isInternalGroundingHostname(hostname: string) {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "vertexaisearch.cloud.google.com" ||
    normalized.endsWith(".vertexaisearch.cloud.google.com")
  );
}

export function getProviderOpaqueSourceDomain(source: WebSearchSource) {
  try {
    const url = new URL(source.url);
    const configuredDomain = source.domain?.trim() ?? "";
    if (configuredDomain && !isInternalGroundingHostname(configuredDomain)) {
      return configuredDomain;
    }
    if (!isInternalGroundingHostname(url.hostname)) {
      return url.hostname;
    }

    const titleAsDomain = source.title
      ?.trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/$/, "");
    return titleAsDomain && /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(titleAsDomain)
      ? titleAsDomain
      : "";
  } catch {
    return "";
  }
}

function normalizeSource(source: WebSearchSource) {
  try {
    const url = new URL(source.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return {
      ...source,
      domain: getProviderOpaqueSourceDomain(source),
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

function ProductThumbnail({ imageUrl, title }: { imageUrl?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!imageUrl || failed) {
    return (
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-muted/60 text-muted-foreground">
        <ShoppingBag className="size-8" />
      </div>
    );
  }
  return (
    // biome-ignore lint/performance/noImgElement: Product thumbnails come from arbitrary validated HTTPS merchant URLs that cannot be enumerated for next/image.
    <img
      alt={title}
      className="aspect-[4/3] w-full bg-muted/40 object-contain"
      loading="lazy"
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
      src={imageUrl}
    />
  );
}

function WebSearchProducts({
  products,
}: {
  products: DisplayWebSearchProduct[];
}) {
  const safeProducts = products
    .filter(
      (product, index, all) =>
        all.findIndex((candidate) => candidate.url === product.url) === index
    )
    .slice(0, 6);

  if (safeProducts.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2.5" data-testid="web-search-products">
      <div className="font-medium text-foreground text-sm">
        <EditableTranslation
          defaultText="Products found"
          description="Heading above current shopping results returned by grounded Web Search."
          translationKey="chat.web_search.products_found"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {safeProducts.map((product) => (
          <a
            className="group min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background/80 transition hover:border-primary/40 hover:shadow-sm"
            href={product.url}
            key={product.url}
            rel="noreferrer noopener"
            target="_blank"
          >
            <ProductThumbnail imageUrl={product.imageUrl} title={product.title} />
            <div className="space-y-1.5 p-3">
              <div className="line-clamp-2 font-medium text-foreground text-sm">
                {product.title}
              </div>
              <div className="truncate text-muted-foreground text-xs">
                {product.merchant}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-foreground text-sm">
                  {product.price}
                </span>
                {typeof product.rating === "number" ? (
                  <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                    <Star className="size-3 fill-amber-400 text-amber-500" />
                    {product.rating.toFixed(1)}
                    {product.reviewCount ? ` (${product.reviewCount})` : ""}
                  </span>
                ) : null}
              </div>
              {product.availability ? (
                <div className="truncate text-muted-foreground text-xs">
                  {product.availability}
                </div>
              ) : null}
              <span className="inline-flex items-center gap-1 font-medium text-primary text-xs">
                <EditableTranslation
                  defaultText={product.kind === "collection" ? "Browse products" : "View product"}
                  description={
                    product.kind === "collection"
                      ? "Link label on a grounded retailer browsing card."
                      : "Link label on a grounded shopping result card."
                  }
                  translationKey={
                    product.kind === "collection"
                      ? "chat.web_search.browse_products"
                      : "chat.web_search.view_product"
                  }
                />
                <ExternalLink className="size-3" />
              </span>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
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
  products = [],
  searchQueries = [],
  sources,
  videos = [],
}: {
  citations?: WebSearchCitation[];
  products?: WebSearchProduct[];
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
  const safeProducts = products
    .map(normalizeWebSearchProductForDisplay)
    .filter((product): product is DisplayWebSearchProduct => Boolean(product));

  if (
    safeSources.length === 0 &&
    safeQueries.length === 0 &&
    safeCitations.length === 0 &&
    safeVideos.length === 0 &&
    safeProducts.length === 0
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
  const hasSourceDetails =
    safeSources.length > 0 ||
    safeQueries.length > 0 ||
    safeCitations.length > 0 ||
    safeVideos.length > 0;

  return (
    <div className="w-full space-y-3">
      <WebSearchProducts products={safeProducts} />
      {hasSourceDetails ? <details
      className="group w-full rounded-xl border border-border/60 bg-muted/20 text-left"
      data-testid="web-search-sources"
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
                      {source.domain ? (
                        <span className="truncate">{source.domain}</span>
                      ) : null}
                      {citationCount ? (
                        <span className="shrink-0">
                          {source.domain ? <>·{" "}</> : null}
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
      </details> : null}
    </div>
  );
}
