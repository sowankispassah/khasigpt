import { type NextRequest, NextResponse } from "next/server";
import { invalidateAdminMutation } from "@/lib/admin/cache-invalidation";
import { WEB_SEARCH_ENABLED_SETTING_KEY } from "@/lib/constants";
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
import { hasValidWebSearchProviderCosts } from "@/lib/web-search/pricing";
import type { WebSearchProvider } from "@/lib/web-search/types";

export const runtime = "nodejs";

const PROVIDERS = new Set<WebSearchProvider>([
  "gemini_grounding",
  "openai_web_search",
  "serper",
  "disabled",
]);
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
  const markupMultiplier = parseNumber(body.markupMultiplier, { integer: false, max: 20, min: 1 });
  const geminiCostPerCallUsd = parseNumber(body.geminiCostPerCallUsd, { integer: false, max: 100, min: 0 });
  const openaiCostPerCallUsd = parseNumber(body.openaiCostPerCallUsd, { integer: false, max: 100, min: 0 });
  const serperCostPerCallUsd = parseNumber(body.serperCostPerCallUsd, { integer: false, max: 100, min: 0 });
  if (
    maxCalls === null ||
    markupMultiplier === null ||
    geminiCostPerCallUsd === null ||
    openaiCostPerCallUsd === null ||
    serperCostPerCallUsd === null ||
    !hasValidWebSearchProviderCosts({
      fallbackProvider: fallbackProvider as WebSearchProvider,
      provider: provider as WebSearchProvider,
      providerCostPerCallUsd: {
        gemini_grounding: geminiCostPerCallUsd ?? 0,
        openai_web_search: openaiCostPerCallUsd ?? 0,
        serper: serperCostPerCallUsd ?? 0,
      },
    })
  ) {
    return NextResponse.json(
      {
        error: "invalid_pricing",
        message:
          "Add a provider cost greater than zero for each selected provider. Disabled providers may remain at zero, and markup must be between 1 and 20.",
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
    web_search_provider: provider,
    web_search_fallback_provider: fallbackProvider,
    web_search_enabled_web: parsedBooleans.enabledWeb,
    web_search_enabled_native: parsedBooleans.enabledNative,
    web_search_free_users_enabled: parsedBooleans.freeUsersEnabled,
    web_search_paid_users_enabled: parsedBooleans.paidUsersEnabled,
    web_search_max_calls: maxCalls,
    web_search_credit_multiplier: markupMultiplier,
    web_search_gemini_cost_per_call_usd: geminiCostPerCallUsd,
    web_search_openai_cost_per_call_usd: openaiCostPerCallUsd,
    web_search_serper_cost_per_call_usd: serperCostPerCallUsd,
  };

  try {
    await withTimeout(
      Promise.all(
        WEB_SEARCH_SETTING_KEYS.filter(
          (key) => key !== WEB_SEARCH_ENABLED_SETTING_KEY
        ).map((key) =>
          setLiteAppSetting({ key, value: values[key] })
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
