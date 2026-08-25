import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import {
  hasUsableChatCredits,
  isFreeDailyChatLimitBypassedForTest,
  requiresPaidWebSearchCredits,
} from "@/lib/chat/free-daily-limit";
import { DEFAULT_FREE_MESSAGES_PER_DAY, TOKENS_PER_CREDIT } from "@/lib/constants";
import {
  consumeFreeDailyChatAllowance,
  getActiveSubscriptionForUser,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatIdPage,
  getWebSearchUsageCountSince,
  recordTokenUsage,
  recordWebSearchUsage,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { getEnabledExploreSelection } from "@/lib/explore/service";
import {
  hasExploreExplicitLocation,
  isExploreNearMeQuery,
} from "@/lib/explore/shared";
import type {
  ExploreLocationInput,
  ExploreResult,
  ExploreSearchResponse,
} from "@/lib/explore/types";
import { exploreSearchInputSchema } from "@/lib/explore/validation";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import type { ChatMessage } from "@/lib/types";
import { convertToUIMessages, generateUUID, getTextFromMessage } from "@/lib/utils";
import {
  getWebSearchPlatform,
  isWebSearchAllowedForUser,
  loadWebSearchConfig,
} from "@/lib/web-search/config";
import { webSearchService } from "@/lib/web-search/service";
import type { WebSearchAnswer } from "@/lib/web-search/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

const providerResultSchema = z.object({
  name: z.string().trim().min(1).max(240),
  category: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(1_000).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  distance: z.string().trim().max(80).nullable().optional(),
  rating: z.number().min(0).max(5).nullable().optional(),
  reviewCount: z.number().int().min(0).nullable().optional(),
  openStatus: z.string().trim().max(120).nullable().optional(),
  eventDate: z.string().trim().max(160).nullable().optional(),
  phone: z.string().trim().max(80).nullable().optional(),
  website: z.string().url().nullable().optional(),
  sourceUrl: z.string().url(),
  imageUrl: z.string().url().nullable().optional(),
});

const providerPayloadSchema = z.object({
  summary: z.string().trim().max(8_000).optional(),
  results: z.array(providerResultSchema).max(12),
});

function startOfTodayInIst() {
  const offsetMinutes = 5.5 * 60;
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offsetMinutes * 60_000);
}

function safeUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function parseProviderPayload(answer: string) {
  const candidates = [
    answer,
    answer.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, ""),
  ];
  const firstBrace = answer.indexOf("{");
  const lastBrace = answer.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(answer.slice(firstBrace, lastBrace + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed = providerPayloadSchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // The grounded provider may return prose. Source-card fallback remains usable.
    }
  }
  return null;
}

function normalizeSourceKey(value: string) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function toExploreResults(answer: WebSearchAnswer): ExploreResult[] {
  const parsed = parseProviderPayload(answer.answer);
  const sourcesByUrl = new Map(
    answer.sources.map((source) => [normalizeSourceKey(source.url), source])
  );
  const structured = (parsed?.results ?? []).flatMap((item, index) => {
    const source = sourcesByUrl.get(normalizeSourceKey(item.sourceUrl));
    if (!source) return [];
    const website = safeUrl(item.website ?? null);
    const imageUrl = safeUrl(item.imageUrl ?? null);
    const trustedImage = imageUrl && sourcesByUrl.has(normalizeSourceKey(imageUrl)) ? imageUrl : null;
    const directionsUrl = item.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.address)}`
      : null;
    return [{
      id: `${index + 1}-${createHash("sha256").update(source.url).digest("hex").slice(0, 12)}`,
      name: item.name,
      category: item.category ?? null,
      description: item.description ?? null,
      address: item.address ?? null,
      distance: item.distance ?? null,
      rating: item.rating ?? null,
      reviewCount: item.reviewCount ?? null,
      openStatus: item.openStatus ?? null,
      eventDate: item.eventDate ?? null,
      phone: item.phone ?? null,
      website,
      directionsUrl,
      imageUrl: trustedImage,
      sourceTitle: source.title,
      sourceUrl: source.url,
    } satisfies ExploreResult];
  });
  if (structured.length > 0) return structured;
  return answer.sources.slice(0, 12).map((source, index) => ({
    id: `${index + 1}-${createHash("sha256").update(source.url).digest("hex").slice(0, 12)}`,
    name: source.title,
    category: null,
    description: null,
    address: null,
    distance: null,
    rating: null,
    reviewCount: null,
    openStatus: null,
    eventDate: null,
    phone: null,
    website: source.url,
    directionsUrl: null,
    imageUrl: null,
    sourceTitle: source.title,
    sourceUrl: source.url,
  }));
}

function hasCoordinates(location: ExploreLocationInput | null | undefined) {
  return typeof location?.latitude === "number" && typeof location?.longitude === "number";
}

function buildSearchQuery({
  query,
  categoryQuery,
  location,
  radiusKm,
  locationMode,
  resultType,
  searchType,
}: {
  query: string;
  categoryQuery: string | null;
  location: ExploreLocationInput | null | undefined;
  radiusKm: number | null | undefined;
  locationMode: string | null;
  resultType: string;
  searchType: "local" | "web" | "hybrid";
}) {
  const locationText = hasCoordinates(location)
    ? `latitude ${location?.latitude}, longitude ${location?.longitude}${radiusKm ? `, within ${radiusKm} km` : ""}`
    : location?.label?.trim()
      ? `in or near ${location.label.trim()}${radiusKm ? `, within ${radiusKm} km` : ""}`
      : locationMode === "meghalaya_wide"
        ? "across Meghalaya, India"
        : "";
  return [
    categoryQuery,
    query,
    locationText,
    searchType === "local"
      ? "Prioritize reliable local/place listings and official business or venue pages."
      : searchType === "web"
        ? "Prioritize current web pages, official announcements, and recent reporting."
        : "Combine reliable local/place listings with current web sources.",
    `Result layout: ${resultType}. Search current public information first.`,
    "Return JSON only with this shape: {\"summary\":string,\"results\":[{\"name\":string,\"category\":string|null,\"description\":string|null,\"address\":string|null,\"distance\":string|null,\"rating\":number|null,\"reviewCount\":number|null,\"openStatus\":string|null,\"eventDate\":string|null,\"phone\":string|null,\"website\":string|null,\"sourceUrl\":string,\"imageUrl\":string|null}]}. Use null for unknown fields. Include only real results supported by a returned grounding source and copy sourceUrl exactly. Never invent ratings, reviews, hours, prices, dates, distance, contact details, or images.",
  ].filter(Boolean).join("\n\n");
}

function errorResponse(error: unknown) {
  if (error instanceof ChatSDKError) return error.toResponse();
  console.error("[api/explore/search] Search failed.", error);
  return NextResponse.json(
    { error: "search_failed", message: "Unable to load Explore results right now. Please try again." },
    { status: 503, headers: noStoreHeaders() }
  );
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (!(await isExploreMeghalayaEnabledForRole(auth.user.role))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const parsed = exploreSearchInputSchema.safeParse(
      await request.json().catch(() => null)
    );
    if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 400 });

    const clientKey = getClientKeyFromHeaders(request.headers);
    const rateLimit = await incrementRateLimit(
      `explore:${auth.user.id}:${clientKey}`,
      { limit: 30, windowMs: 60_000 }
    );
    if (!rateLimit.allowed) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

    const { category, subcategory } = await getEnabledExploreSelection({
      categoryId: parsed.data.categoryId,
      subcategoryId: parsed.data.subcategoryId,
    });
    if (parsed.data.categoryId && !category) {
      return NextResponse.json({ error: "category_unavailable" }, { status: 404 });
    }
    const effectiveLocationMode = subcategory?.locationModeOverride ?? category?.locationMode ?? null;
    const needsLocation = isExploreNearMeQuery(parsed.data.query) ||
      effectiveLocationMode === "current_preferred" ||
      effectiveLocationMode === "selected" ||
      effectiveLocationMode === "current_or_selected";
    const hasExplicitLocation = hasExploreExplicitLocation(parsed.data.query);
    if (needsLocation && !hasExplicitLocation && !hasCoordinates(parsed.data.location) && !parsed.data.location?.label?.trim()) {
      return NextResponse.json(
        { error: "location_required", message: "Location access is needed for accurate nearby results." },
        { status: 422, headers: noStoreHeaders() }
      );
    }

    const [config, registry, subscription, freeSettings, messageCount] = await Promise.all([
      loadWebSearchConfig(),
      getModelRegistry(),
      getActiveSubscriptionForUser(auth.user.id),
      loadFreeMessageSettings(),
      getMessageCountByUserId({ id: auth.user.id, since: startOfTodayInIst() }),
    ]);
    const model = registry.defaultConfig ?? registry.configs[0];
    if (!model) throw new ChatSDKError("bad_request:api", "No chat models are enabled.");
    const tokenBalance = subscription?.tokenBalance ?? 0;
    const hasCredits = hasUsableChatCredits(tokenBalance);
    const platform = getWebSearchPlatform(request);
    if (!isWebSearchAllowedForUser({ config, isPaidUser: hasCredits, platform, role: auth.user.role })) {
      return NextResponse.json({ error: "search_unavailable" }, { status: 403 });
    }
    const freeLimit = Math.min(
      DEFAULT_FREE_MESSAGES_PER_DAY,
      freeSettings.mode === "global"
        ? Math.max(0, freeSettings.globalLimit)
        : Math.max(0, model.freeMessagesPerDay ?? DEFAULT_FREE_MESSAGES_PER_DAY)
    );
    const testBypass = isFreeDailyChatLimitBypassedForTest({ nodeEnv: process.env.NODE_ENV, playwright: process.env.PLAYWRIGHT });
    let usedFreeAllowance = false;
    if (!testBypass && !hasCredits) {
      const allowance = await consumeFreeDailyChatAllowance({
        userId: auth.user.id,
        day: startOfTodayInIst(),
        limit: freeLimit,
        existingMessageCount: messageCount,
      });
      if (!allowance.allowed) throw new ChatSDKError("payment_required:free_messages", "Free daily chat limit reached.");
      usedFreeAllowance = true;
    }
    const minimumTokens = Math.ceil(TOKENS_PER_CREDIT * config.creditMultiplier);
    if (requiresPaidWebSearchCredits({
      activeTokenBalance: tokenBalance,
      hasActiveCredits: hasCredits,
      minimumCreditTokens: minimumTokens,
      testLimitBypass: testBypass,
      usedFreeDailyAllowance: usedFreeAllowance,
    })) {
      throw new ChatSDKError("payment_required:credits", "Web search requires paid credits. Please recharge to continue.");
    }
    const dailyCount = await getWebSearchUsageCountSince({ since: startOfTodayInIst(), userId: auth.user.id });
    if (dailyCount === null) return NextResponse.json({ error: "usage_tracking_unavailable" }, { status: 503 });
    if (dailyCount >= config.dailyLimit) throw new ChatSDKError("rate_limit:chat", "Web search daily limit reached.");

    const requestedChat = parsed.data.chatId ? await getChatById({ id: parsed.data.chatId }) : null;
    if (requestedChat && requestedChat.userId !== auth.user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const chatId = requestedChat?.id ?? generateUUID();
    if (!requestedChat) {
      await saveChat({
        id: chatId,
        userId: auth.user.id,
        title: `Explore: ${parsed.data.query}`,
        visibility: "private",
      });
    }
    const recentConversation = requestedChat
      ? await getMessagesByChatIdPage({ id: requestedChat.id, limit: 12 })
          .then(({ messages }) =>
            convertToUIMessages(messages)
              .map((message) => {
                const text = getTextFromMessage(message).trim();
                return text ? `${message.role}: ${text}` : "";
              })
              .filter(Boolean)
              .join("\n\n")
          )
          .catch((error) => {
            console.warn("[api/explore/search] Recent Explore context unavailable.", error);
            return "";
          })
      : "";
    const effectiveCategoryQuery = subcategory?.searchQuery ?? category?.searchQuery ?? null;
    const effectiveSearchType =
      subcategory?.searchTypeOverride ?? category?.searchType ?? "hybrid";
    const resultType = category?.resultType ?? "standard";
    const providerQuery = buildSearchQuery({
      query: parsed.data.query,
      categoryQuery: effectiveCategoryQuery,
      location: parsed.data.location,
      radiusKm: parsed.data.radiusKm,
      locationMode: effectiveLocationMode,
      resultType,
      searchType: effectiveSearchType,
    });
    const startedAt = performance.now();
    const queryHash = createHash("sha256").update(providerQuery).digest("hex");
    const conversationContext = [
      category
        ? `Explore Meghalaya category: ${category.name}${subcategory ? `; subcategory: ${subcategory.name}` : ""}.`
        : "Explore Meghalaya natural-language discovery.",
      recentConversation,
    ]
      .filter(Boolean)
      .join("\n\n");
    let answer: WebSearchAnswer | null = null;
    let attemptedProvider = config.provider;
    let providerError: unknown = null;
    try {
      answer = await webSearchService.answerWithSearch({
        conversationContext,
        maxSearches: config.maxCalls,
        model: model.providerModelId,
        provider: config.provider,
        userMessage: providerQuery,
      });
    } catch (primaryError) {
      providerError = primaryError;
      if (
        config.fallbackProvider !== "disabled" &&
        config.fallbackProvider !== config.provider
      ) {
        attemptedProvider = config.fallbackProvider;
        try {
          answer = await webSearchService.answerWithSearch({
            conversationContext,
            maxSearches: config.maxCalls,
            model: model.providerModelId,
            provider: config.fallbackProvider,
            userMessage: providerQuery,
          });
          providerError = null;
        } catch (fallbackError) {
          providerError = fallbackError;
        }
      }
    }
    if (!answer) {
      await recordWebSearchUsage({
        chatId,
        creditCostTokens: 0,
        creditMultiplier: config.creditMultiplier,
        errorReason:
          providerError instanceof Error
            ? providerError.message.slice(0, 500)
            : "provider_failed",
        platform,
        provider: attemptedProvider,
        queryHash,
        responseTimeMs: Math.round(performance.now() - startedAt),
        searchCallCount: 0,
        sourceCount: 0,
        sources: [],
        status: "failed",
        triggerReason: "explore_meghalaya",
        userId: auth.user.id,
      });
      throw providerError ?? new Error("Explore search provider failed.");
    }
    const chargedInput = Math.ceil(answer.usage.inputTokens * config.creditMultiplier);
    const chargedOutput = Math.ceil(answer.usage.outputTokens * config.creditMultiplier);
    if (chargedInput + chargedOutput > 0) {
      await recordTokenUsage({
        userId: auth.user.id,
        chatId,
        modelConfigId: model.id,
        inputTokens: chargedInput,
        outputTokens: chargedOutput,
        deductCredits: hasCredits,
      });
    }
    await recordWebSearchUsage({
      chatId,
      creditCostTokens: chargedInput + chargedOutput,
      creditMultiplier: config.creditMultiplier,
      platform,
      provider: answer.provider,
      queryHash,
      responseTimeMs: Math.round(performance.now() - startedAt),
      searchCallCount: answer.searchCallCount,
      sourceCount: answer.sources.length,
      sources: answer.sources,
      status: "completed",
      triggerReason: "explore_meghalaya",
      userId: auth.user.id,
    });
    const results = toExploreResults(answer);
    const parsedPayload = parseProviderPayload(answer.answer);
    const summary = parsedPayload?.summary?.trim() || (results.length ? `Found ${results.length} grounded results.` : "No grounded results were found.");
    const now = new Date();
    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();
    const assistantParts: ChatMessage["parts"] = [
      { type: "text", text: [summary, ...results.map((item) => `- ${item.name}${item.address ? ` — ${item.address}` : ""}: ${item.sourceUrl}`)].join("\n") },
      { type: "data-webSources", data: { sources: answer.sources, searchQueries: answer.searchQueries, citations: answer.citations, videos: answer.videos } },
    ];
    await saveMessages({ messages: [
      { chatId, id: userMessageId, role: "user", parts: [{ type: "text", text: parsed.data.query }], attachments: [], createdAt: now },
      { chatId, id: assistantMessageId, role: "assistant", parts: assistantParts, attachments: [], createdAt: new Date(now.getTime() + 1) },
    ] });

    const response: ExploreSearchResponse = {
      answer: summary,
      category: category ? { id: category.id, name: category.name, resultType: category.resultType } : null,
      chatId,
      locationLabel: parsed.data.location?.label?.trim() || null,
      results,
      searchQueries: answer.searchQueries,
    };
    return NextResponse.json(response, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
