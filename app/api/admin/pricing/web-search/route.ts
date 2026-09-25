import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import {
  WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY,
  WEB_SEARCH_ENABLED_WEB_SETTING_KEY,
  WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
  WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_GEMINI_COST_PER_CALL_USD_SETTING_KEY,
  WEB_SEARCH_GEMINI_MARKUP_MULTIPLIER_SETTING_KEY,
  WEB_SEARCH_MAX_CALLS_SETTING_KEY,
  WEB_SEARCH_OPENAI_COST_PER_CALL_USD_SETTING_KEY,
  WEB_SEARCH_OPENAI_MARKUP_MULTIPLIER_SETTING_KEY,
  WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_PROVIDER_SETTING_KEY,
  WEB_SEARCH_SERPER_COST_PER_CALL_USD_SETTING_KEY,
  WEB_SEARCH_SERPER_MARKUP_MULTIPLIER_SETTING_KEY,
} from "@/lib/constants";
import {
  appSettingCacheTagForKey,
  createLiteAuditLogEntry,
  setLiteAppSetting,
} from "@/lib/db/app-settings-lite";
import { requireAdminApiUser } from "@/lib/security/admin-api-auth";
import { withTimeout } from "@/lib/utils/async";
import {
  WEB_SEARCH_CONFIG_CACHE_TAG,
  WEB_SEARCH_SETTING_KEYS,
} from "@/lib/web-search/config";
import {
  type BillableWebSearchProvider,
  hasValidWebSearchProviderCosts,
} from "@/lib/web-search/pricing";
import type { WebSearchProvider } from "@/lib/web-search/types";

export const runtime = "nodejs";

const PROVIDERS = new Set<WebSearchProvider>([
  "gemini_grounding",
  "openai_web_search",
  "serper",
  "disabled",
]);
const BILLABLE_PROVIDERS: BillableWebSearchProvider[] = [
  "gemini_grounding",
  "serper",
  "openai_web_search",
];
const WRITE_TIMEOUT_MS = 15_000;
const AUDIT_TIMEOUT_MS = 3_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function parseBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function parseNumber(value: unknown, { integer, max, min }: { integer: boolean; max: number; min: number }) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max || (integer && !Number.isInteger(parsed))) {
    return null;
  }
  return parsed;
}

export async function POST(request: NextRequest) {
  const user = await requireAdminApiUser(request);
  if (!user) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!isRecord(body)) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const provider = body.provider;
  const fallbackProvider = body.fallbackProvider;
  const booleans = ["enabledWeb", "enabledNative", "freeUsersEnabled", "paidUsersEnabled"];
  const parsedBooleans = Object.fromEntries(
    booleans.map((key) => [key, parseBoolean(body[key])])
  );
  if (
    typeof provider !== "string" ||
    !PROVIDERS.has(provider as WebSearchProvider) ||
    typeof fallbackProvider !== "string" ||
    !PROVIDERS.has(fallbackProvider as WebSearchProvider) ||
    Object.values(parsedBooleans).some((value) => value === null)
  ) {
    return NextResponse.json({ error: "invalid_value", message: "Invalid Web Search setting value." }, { status: 400 });
  }

  const maxCalls = parseNumber(body.maxCalls, { integer: true, max: 10, min: 1 });
  const providerPricing = body.providerPricing;
  if (!isRecord(providerPricing)) {
    return NextResponse.json(
      { error: "invalid_pricing", message: "Provider pricing is required." },
      { status: 400 }
    );
  }
  const parsedProviderPricing = Object.fromEntries(
    BILLABLE_PROVIDERS.map((providerKey) => {
      const row = providerPricing[providerKey];
      if (!isRecord(row)) {
        return [providerKey, null];
      }
      const providerCostPerCallUsd = parseNumber(row.providerCostPerCallUsd, {
        integer: false,
        max: 100,
        min: 0,
      });
      const markupMultiplier = parseNumber(row.markupMultiplier, {
        integer: false,
        max: 20,
        min: 1,
      });
      return [
        providerKey,
        providerCostPerCallUsd === null || markupMultiplier === null
          ? null
          : { markupMultiplier, providerCostPerCallUsd },
      ];
    })
  ) as Record<
    BillableWebSearchProvider,
    { markupMultiplier: number; providerCostPerCallUsd: number } | null
  >;
  const pricingRowsAreValid = BILLABLE_PROVIDERS.every(
    (providerKey) => parsedProviderPricing[providerKey] !== null
  );
  const providerCostPerCallUsd = Object.fromEntries(
    BILLABLE_PROVIDERS.map((providerKey) => [
      providerKey,
      parsedProviderPricing[providerKey]?.providerCostPerCallUsd ?? 0,
    ])
  ) as Record<BillableWebSearchProvider, number>;
  if (
    maxCalls === null ||
    !pricingRowsAreValid ||
    !hasValidWebSearchProviderCosts({
      fallbackProvider: fallbackProvider as WebSearchProvider,
      provider: provider as WebSearchProvider,
      providerCostPerCallUsd,
    })
  ) {
    return NextResponse.json(
      {
        error: "invalid_pricing",
        message:
          "Add a provider cost greater than zero for each selected provider. Inactive providers may remain at zero, and every provider markup must be between 1 and 20.",
      },
      { status: 400 }
    );
  }
  if (
    (provider === "serper" || fallbackProvider === "serper") &&
    !process.env.SERPER_API_KEY?.trim()
  ) {
    return NextResponse.json(
      {
        error: "provider_not_configured",
        message:
          "Add SERPER_API_KEY to the server environment before activating Serper.",
      },
      { status: 400 }
    );
  }

  const values: Record<string, unknown> = {
    [WEB_SEARCH_PROVIDER_SETTING_KEY]: provider,
    [WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY]: fallbackProvider,
    [WEB_SEARCH_ENABLED_WEB_SETTING_KEY]: parsedBooleans.enabledWeb,
    [WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY]: parsedBooleans.enabledNative,
    [WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY]: parsedBooleans.freeUsersEnabled,
    [WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY]: parsedBooleans.paidUsersEnabled,
    [WEB_SEARCH_MAX_CALLS_SETTING_KEY]: maxCalls,
    [WEB_SEARCH_GEMINI_COST_PER_CALL_USD_SETTING_KEY]:
      providerCostPerCallUsd.gemini_grounding,
    [WEB_SEARCH_GEMINI_MARKUP_MULTIPLIER_SETTING_KEY]:
      parsedProviderPricing.gemini_grounding?.markupMultiplier,
    [WEB_SEARCH_OPENAI_COST_PER_CALL_USD_SETTING_KEY]:
      providerCostPerCallUsd.openai_web_search,
    [WEB_SEARCH_OPENAI_MARKUP_MULTIPLIER_SETTING_KEY]:
      parsedProviderPricing.openai_web_search?.markupMultiplier,
    [WEB_SEARCH_SERPER_COST_PER_CALL_USD_SETTING_KEY]:
      providerCostPerCallUsd.serper,
    [WEB_SEARCH_SERPER_MARKUP_MULTIPLIER_SETTING_KEY]:
      parsedProviderPricing.serper?.markupMultiplier,
  };

  try {
    await withTimeout(
      Promise.all(
        Object.entries(values).map(([key, value]) =>
          setLiteAppSetting({ key, value })
        )
      ),
      WRITE_TIMEOUT_MS
    );

    invalidateAdminMutation({
      source: "pricing.web_search.update",
      tags: [WEB_SEARCH_CONFIG_CACHE_TAG, ...WEB_SEARCH_SETTING_KEYS.map(appSettingCacheTagForKey)],
    });
    void withTimeout(
      createLiteAuditLogEntry({
        actorId: user.id,
        action: "settings.web_search.update",
        target: { setting: "web_search" },
        metadata: { ...values },
      }),
      AUDIT_TIMEOUT_MS
    ).catch((error) => console.error("[api/admin/pricing/web-search] Audit write failed.", error));

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/admin/pricing/web-search] Save failed.", error);
    return NextResponse.json(
      { error: "save_failed", message: "Failed to save Web Search settings." },
      { status: 500 }
    );
  }
}
