import "server-only";

import { unstable_cache } from "next/cache";
import {
  WEB_SEARCH_CREDIT_MULTIPLIER_SETTING_KEY,
  WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY,
  WEB_SEARCH_ENABLED_SETTING_KEY,
  WEB_SEARCH_ENABLED_WEB_SETTING_KEY,
  WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
  WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_MAX_CALLS_SETTING_KEY,
  WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_PROVIDER_SETTING_KEY,
} from "@/lib/constants";
import { getLiteAppSettingsByKeysUncached } from "@/lib/db/app-settings-lite";
import type { UserRole } from "@/lib/db/schema";
import { isFeatureEnabledForRole, parseFeatureAccessMode } from "@/lib/feature-access";
import { withTimeout } from "@/lib/utils/async";
import type {
  WebSearchConfig,
  WebSearchPlatform,
  WebSearchProvider,
} from "./types";

export const WEB_SEARCH_CONFIG_CACHE_TAG = "web-search-config";
export const WEB_SEARCH_SETTING_KEYS = [
  WEB_SEARCH_ENABLED_SETTING_KEY,
  WEB_SEARCH_PROVIDER_SETTING_KEY,
  WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY,
  WEB_SEARCH_ENABLED_WEB_SETTING_KEY,
  WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY,
  WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY,
  WEB_SEARCH_MAX_CALLS_SETTING_KEY,
  WEB_SEARCH_CREDIT_MULTIPLIER_SETTING_KEY,
] as const;

const DEFAULT_PROVIDER: WebSearchProvider = "gemini_grounding";
const DEFAULT_FALLBACK_PROVIDER: WebSearchProvider = "disabled";

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
      return true;
    }
    if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
      return false;
    }
  }
  return fallback;
}

function parsePositiveNumber(value: unknown, fallback: number, max: number) {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function parseProvider(value: unknown, fallback: WebSearchProvider) {
  return value === "gemini_grounding" ||
    value === "openai_web_search" ||
    value === "disabled"
    ? value
    : fallback;
}

export function resolveWebSearchConfig(
  values: Map<string, unknown>,
  {
    accessMode,
    readState = "confirmed",
  }: {
    accessMode?: unknown;
    readState?: WebSearchConfig["readState"];
  } = {}
): WebSearchConfig {
  return {
    accessMode: parseFeatureAccessMode(accessMode, "admin_only"),
    provider: parseProvider(values.get(WEB_SEARCH_PROVIDER_SETTING_KEY), DEFAULT_PROVIDER),
    fallbackProvider: parseProvider(
      values.get(WEB_SEARCH_FALLBACK_PROVIDER_SETTING_KEY),
      DEFAULT_FALLBACK_PROVIDER
    ),
    enabledWeb: parseBoolean(
      values.get(WEB_SEARCH_ENABLED_WEB_SETTING_KEY),
      true
    ),
    enabledNative: parseBoolean(
      values.get(WEB_SEARCH_ENABLED_NATIVE_SETTING_KEY),
      true
    ),
    freeUsersEnabled: parseBoolean(
      values.get(WEB_SEARCH_FREE_USERS_ENABLED_SETTING_KEY),
      true
    ),
    paidUsersEnabled: parseBoolean(
      values.get(WEB_SEARCH_PAID_USERS_ENABLED_SETTING_KEY),
      true
    ),
    maxCalls: Math.round(
      parsePositiveNumber(values.get(WEB_SEARCH_MAX_CALLS_SETTING_KEY), 2, 10)
    ),
    creditMultiplier: parsePositiveNumber(
      values.get(WEB_SEARCH_CREDIT_MULTIPLIER_SETTING_KEY),
      3,
      10
    ),
    readState,
  };
}

const loadCachedWebSearchSettings = unstable_cache(
  async () => getLiteAppSettingsByKeysUncached([...WEB_SEARCH_SETTING_KEYS]),
  ["web-search-settings:v1"],
  {
    revalidate: 60,
    tags: [
      WEB_SEARCH_CONFIG_CACHE_TAG,
      ...WEB_SEARCH_SETTING_KEYS.map((key) => `app-setting:${key}`),
    ],
  }
);

export async function loadWebSearchConfig({ timeoutMs = 1500 } = {}) {
  try {
    const rows = await withTimeout(loadCachedWebSearchSettings(), timeoutMs, () => {
      console.error("[web-search/config] Settings read timed out.");
    });
    const values = new Map(rows.map((row) => [row.key, row.value]));
    return resolveWebSearchConfig(values, {
      accessMode: values.get(WEB_SEARCH_ENABLED_SETTING_KEY),
    });
  } catch (error) {
    console.error("[web-search/config] Settings unavailable; using safe defaults.", error);
    return resolveWebSearchConfig(new Map(), { readState: "fallback" });
  }
}

export function isWebSearchAllowedForUser({
  config,
  isPaidUser,
  platform,
  role,
}: {
  config: WebSearchConfig;
  isPaidUser: boolean;
  platform: WebSearchPlatform;
  role: UserRole;
}) {
  if (config.provider === "disabled") {
    return false;
  }
  if (!isFeatureEnabledForRole(config.accessMode, role)) {
    return false;
  }
  if (platform === "web" && !config.enabledWeb) {
    return false;
  }
  if (platform === "native" && !config.enabledNative) {
    return false;
  }
  if (role === "admin") {
    return true;
  }
  return isPaidUser ? config.paidUsersEnabled : config.freeUsersEnabled;
}

export function getWebSearchPlatform(request: Request): WebSearchPlatform {
  const client = request.headers.get("x-khasigpt-client")?.toLowerCase() ?? "";
  return client.includes("native") || client.includes("android") || client.includes("ios")
    ? "native"
    : "web";
}
