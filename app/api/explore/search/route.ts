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
  getWebSearchUsageCountSince,
  recordTokenUsage,
  recordWebSearchUsage,
  saveChat,
  saveMessages,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { isExploreMeghalayaEnabledForRole } from "@/lib/explore/config";
import { searchExplorePlaces } from "@/lib/explore/places-service";
import { getEnabledExploreSelection } from "@/lib/explore/service";
import type {
  ExploreLocationInput,
  ExploreResult,
  ExploreSearchResponse,
} from "@/lib/explore/types";
import { shouldEnrichExploreSearch } from "@/lib/explore/types";
import { exploreSearchInputSchema } from "@/lib/explore/validation";
import { loadFreeMessageSettings } from "@/lib/free-messages";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import type { ChatMessage } from "@/lib/types";
import { generateUUID } from "@/lib/utils";
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

const providerSummarySchema = z.object({
  summary: z.string().trim().max(8_000),
});

function startOfTodayInIst() {
  const offsetMinutes = 5.5 * 60;
  const now = new Date();
  const shifted = new Date(now.getTime() + offsetMinutes * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - offsetMinutes * 60_000);
}

function parseProviderSummary(answer: string) {
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
      const parsed = providerSummarySchema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data.summary;
    } catch {
      // A deterministic summary remains available when enrichment returns prose.
    }
  }
  return null;
}

function createLocationContextKey(location: ExploreLocationInput) {
  return createHash("sha256")
    .update(
      [
        location.id,
        location.latitude.toFixed(5),
        location.longitude.toFixed(5),
        location.source,
      ].join(":"),
    )
    .digest("hex")
    .slice(0, 32);
}

function buildSearchQuery({
  categoryQuery,
  location,
  query,
  radiusKm,
  resultType,
  results,
  searchType,
}: {
  categoryQuery: string | null;
  location: ExploreLocationInput;
  query: string;
  radiusKm: number;
  resultType: string;
  results: ExploreResult[];
  searchType: "local" | "web" | "hybrid";
}) {
  const verifiedPlaces = results.map((result) => ({
    address: result.address,
    category: result.category,
    distanceKm: Number(result.distanceKm.toFixed(2)),
    name: result.name,
    sourceUrl: result.sourceUrl,
  }));
  return [
    `Explore request: ${[categoryQuery, query].filter(Boolean).join(" — ")}.`,
    `Selected location: ${location.label}. Exact center: latitude ${location.latitude}, longitude ${location.longitude}. Enforced radius: ${radiusKm} km.`,
    `Search mode: ${searchType}. Result layout: ${resultType}.`,
    `The following candidates came from a coordinate-aware place search and were independently filtered to ${radiusKm} km with a Haversine distance calculation:\n${JSON.stringify(verifiedPlaces)}`,
    "Use current public web information only to write a concise summary of these verified candidates. Do not add, replace, or recommend any place outside this candidate list. Do not reinterpret the center as Shillong or any other city.",
    'Return JSON only with this shape: {"summary":string}.',
  ].join("\n\n");
}

function defaultSummary({
  location,
  radiusKm,
  results,
}: {
  location: ExploreLocationInput;
  radiusKm: number;
  results: ExploreResult[];
}) {
  return results.length
    ? `Found ${results.length} places within ${radiusKm} km of ${location.label}.`
    : `No results found within ${radiusKm} km of ${location.label}.`;
}

function errorResponse(error: unknown) {
  if (error instanceof ChatSDKError) return error.toResponse();
  console.error("[api/explore/search] Search failed.", error);
  return NextResponse.json(
    {
      error: "search_failed",
      message: "Unable to load Explore results right now. Please try again.",
    },
    { status: 503, headers: noStoreHeaders() },
  );
}

export async function POST(request: Request) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (!auth?.user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    if (!(await isExploreMeghalayaEnabledForRole(auth.user.role))) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    const parsed = exploreSearchInputSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_request" },
        { status: 400, headers: noStoreHeaders() },
      );
    }

    const clientKey = getClientKeyFromHeaders(request.headers);
    const rateLimit = await incrementRateLimit(
      `explore:${auth.user.id}:${clientKey}`,
      { limit: 30, windowMs: 60_000 },
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        { status: 429, headers: noStoreHeaders() },
      );
    }

    const { category, subcategory } = await getEnabledExploreSelection({
      categoryId: parsed.data.categoryId,
      subcategoryId: parsed.data.subcategoryId,
    });
    if (parsed.data.categoryId && !category) {
      return NextResponse.json(
        { error: "category_unavailable" },
        { status: 404, headers: noStoreHeaders() },
      );
    }

    const locationContextKey = createLocationContextKey(parsed.data.location);
    const requestedChat = parsed.data.chatId
      ? await getChatById({ id: parsed.data.chatId })
      : null;
    if (requestedChat && requestedChat.userId !== auth.user.id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const reusableChat =
      requestedChat && parsed.data.locationContextKey === locationContextKey
        ? requestedChat
        : null;
    const chatId = reusableChat?.id ?? generateUUID();
    if (!reusableChat) {
      await saveChat({
        id: chatId,
        userId: auth.user.id,
        title: `Explore ${parsed.data.location.label}: ${parsed.data.query}`,
        visibility: "private",
      });
    }

    const effectiveCategoryQuery =
      subcategory?.searchQuery ?? category?.searchQuery ?? null;
    const effectiveSearchType =
      subcategory?.searchTypeOverride ?? category?.searchType ?? "hybrid";
    const resultType = category?.resultType ?? "standard";
    const placeSearch = await searchExplorePlaces({
      categoryQuery: effectiveCategoryQuery,
      location: parsed.data.location,
      query: parsed.data.query,
      radiusKm: parsed.data.radiusKm,
    });
    const results = placeSearch.results;
    let answer: WebSearchAnswer | null = null;
    if (shouldEnrichExploreSearch(parsed.data.searchMode)) {
      const [config, registry, subscription, freeSettings, messageCount] =
        await Promise.all([
          loadWebSearchConfig(),
          getModelRegistry(),
          getActiveSubscriptionForUser(auth.user.id),
          loadFreeMessageSettings(),
          getMessageCountByUserId({
            id: auth.user.id,
            since: startOfTodayInIst(),
          }),
        ]);
      const model = registry.defaultConfig ?? registry.configs[0];
      if (!model) {
        throw new ChatSDKError(
          "bad_request:api",
          "No chat models are enabled.",
        );
      }
      const tokenBalance = subscription?.tokenBalance ?? 0;
      const hasCredits = hasUsableChatCredits(tokenBalance);
      const platform = getWebSearchPlatform(request);
      if (
        !isWebSearchAllowedForUser({
          config,
          isPaidUser: hasCredits,
          platform,
          role: auth.user.role,
        })
      ) {
        return NextResponse.json(
          { error: "search_unavailable" },
          { status: 403, headers: noStoreHeaders() },
        );
      }
      const freeLimit = Math.min(
        DEFAULT_FREE_MESSAGES_PER_DAY,
        freeSettings.mode === "global"
          ? Math.max(0, freeSettings.globalLimit)
          : Math.max(
              0,
              model.freeMessagesPerDay ?? DEFAULT_FREE_MESSAGES_PER_DAY,
            ),
      );
      const testBypass = isFreeDailyChatLimitBypassedForTest({
        nodeEnv: process.env.NODE_ENV,
        playwright: process.env.PLAYWRIGHT,
      });
      let usedFreeAllowance = false;
      if (!testBypass && !hasCredits) {
        const allowance = await consumeFreeDailyChatAllowance({
          userId: auth.user.id,
          day: startOfTodayInIst(),
          limit: freeLimit,
          existingMessageCount: messageCount,
        });
        if (!allowance.allowed) {
          throw new ChatSDKError(
            "payment_required:free_messages",
            "Free daily chat limit reached.",
          );
        }
        usedFreeAllowance = true;
      }
      const minimumTokens = Math.ceil(
        TOKENS_PER_CREDIT * config.creditMultiplier,
      );
      if (
        requiresPaidWebSearchCredits({
          activeTokenBalance: tokenBalance,
          hasActiveCredits: hasCredits,
          minimumCreditTokens: minimumTokens,
          testLimitBypass: testBypass,
          usedFreeDailyAllowance: usedFreeAllowance,
        })
      ) {
        throw new ChatSDKError(
          "payment_required:credits",
          "Web search requires paid credits. Please recharge to continue.",
        );
      }
      const dailyCount = await getWebSearchUsageCountSince({
        since: startOfTodayInIst(),
        userId: auth.user.id,
      });
      if (dailyCount === null) {
        return NextResponse.json(
          { error: "usage_tracking_unavailable" },
          { status: 503, headers: noStoreHeaders() },
        );
      }
      if (dailyCount >= config.dailyLimit) {
        throw new ChatSDKError(
          "rate_limit:chat",
          "Web search daily limit reached.",
        );
      }

      const providerQuery = buildSearchQuery({
        categoryQuery: effectiveCategoryQuery,
        location: parsed.data.location,
        query: parsed.data.query,
        radiusKm: parsed.data.radiusKm,
        resultType,
        results,
        searchType: effectiveSearchType,
      });
      const startedAt = performance.now();
      const queryHash = createHash("sha256")
        .update(providerQuery)
        .digest("hex");
      const conversationContext = [
        category
          ? `Explore Meghalaya category: ${category.name}${subcategory ? `; subcategory: ${subcategory.name}` : ""}.`
          : "Explore Meghalaya natural-language discovery.",
        `The selected location context is ${locationContextKey}. Previous result sets from other locations are not relevant.`,
      ].join("\n\n");
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

      if (answer) {
        const chargedInput = Math.ceil(
          answer.usage.inputTokens * config.creditMultiplier,
        );
        const chargedOutput = Math.ceil(
          answer.usage.outputTokens * config.creditMultiplier,
        );
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
      } else {
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
        console.warn(
          "[api/explore/search] Web enrichment failed; returning verified geographic results.",
          providerError,
        );
      }
    }

    const summary =
      (answer ? parseProviderSummary(answer.answer) : null) ||
      defaultSummary({
        location: parsed.data.location,
        radiusKm: parsed.data.radiusKm,
        results,
      });
    if (shouldEnrichExploreSearch(parsed.data.searchMode)) {
      const now = new Date();
      const assistantParts: ChatMessage["parts"] = [
        {
          type: "text",
          text: [
            `Current Explore context: ${parsed.data.location.label} (${parsed.data.location.latitude}, ${parsed.data.location.longitude}), within ${parsed.data.radiusKm} km.`,
            summary,
            ...results.slice(0, 24).map(
              (item) =>
                `- ${item.name} — ${item.distance}${item.address ? ` — ${item.address}` : ""}: ${item.sourceUrl}`,
            ),
          ].join("\n"),
        },
      ];
      if (answer) {
        assistantParts.push({
          type: "data-webSources",
          data: {
            sources: answer.sources,
            searchQueries: answer.searchQueries,
            citations: answer.citations,
            videos: answer.videos,
          },
        });
      }
      await saveMessages({
        messages: [
          {
            chatId,
            id: generateUUID(),
            role: "user",
            parts: [{ type: "text", text: parsed.data.query }],
            attachments: [],
            createdAt: now,
          },
          {
            chatId,
            id: generateUUID(),
            role: "assistant",
            parts: assistantParts,
            attachments: [],
            createdAt: new Date(now.getTime() + 1),
          },
        ],
      });
    }

    const response: ExploreSearchResponse = {
      answer: summary,
      category: category
        ? {
            id: category.id,
            name: category.name,
            resultType: category.resultType,
          }
        : null,
      chatId,
      clientRequestId: parsed.data.clientRequestId,
      location: parsed.data.location,
      locationContextKey,
      radiusKm: parsed.data.radiusKm,
      results,
      searchQueries: answer?.searchQueries ?? [],
      searchMode: parsed.data.searchMode,
    };
    return NextResponse.json(response, { headers: noStoreHeaders() });
  } catch (error) {
    return errorResponse(error);
  }
}
