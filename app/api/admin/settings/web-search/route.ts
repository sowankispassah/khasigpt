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
import type { WebSearchProvider } from "@/lib/web-search/types";

export const runtime = "nodejs";

const PROVIDERS = new Set<WebSearchProvider>([
  "gemini_grounding",
  "openai_web_search",
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
  const creditMultiplier = parseNumber(body.creditMultiplier, { integer: false, max: 10, min: 1 });
  if (maxCalls === null || creditMultiplier === null) {
    return NextResponse.json({ error: "invalid_value", message: "Search limits and multiplier are outside the allowed range." }, { status: 400 });
  }

  const values: Record<string, unknown> = {
    web_search_provider: provider,
    web_search_fallback_provider: fallbackProvider,
    web_search_enabled_web: parsedBooleans.enabledWeb,
    web_search_enabled_native: parsedBooleans.enabledNative,
    web_search_free_users_enabled: parsedBooleans.freeUsersEnabled,
    web_search_paid_users_enabled: parsedBooleans.paidUsersEnabled,
    web_search_max_calls: maxCalls,
    web_search_credit_multiplier: creditMultiplier,
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
      source: "settings.web_search.update",
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
    ).catch((error) => console.error("[api/admin/settings/web-search] Audit write failed.", error));

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[api/admin/settings/web-search] Save failed.", error);
    return NextResponse.json(
      { error: "save_failed", message: "Failed to save Web Search settings." },
      { status: 500 }
    );
  }
}
