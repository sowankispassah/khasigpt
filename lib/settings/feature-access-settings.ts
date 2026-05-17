import "server-only";

import { unstable_cache } from "next/cache";
import {
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  ICON_PROMPTS_ENABLED_SETTING_KEY,
  IMAGE_GENERATION_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  VOICE_CHAT_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import { getLiteAppSettingsByKeysUncached } from "@/lib/db/app-settings-lite";
import {
  type FeatureAccessMode,
  parseFeatureAccessModeStrict,
} from "@/lib/feature-access";
import { withTimeout } from "@/lib/utils/async";

export const ADMIN_FEATURE_ACCESS_SETTINGS = [
  {
    fieldName: "calculatorAccessMode",
    settingKey: CALCULATOR_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "studyModeAccessMode",
    settingKey: STUDY_MODE_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "translateAccessMode",
    settingKey: TRANSLATE_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "jobsAccessMode",
    settingKey: JOBS_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "imageGenerationAccessMode",
    settingKey: IMAGE_GENERATION_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "documentUploadsAccessMode",
    settingKey: DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "voiceChatAccessMode",
    settingKey: VOICE_CHAT_FEATURE_FLAG_KEY,
  },
  {
    fieldName: "suggestedPromptsAccessMode",
    settingKey: SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  },
  {
    fieldName: "iconPromptsAccessMode",
    settingKey: ICON_PROMPTS_ENABLED_SETTING_KEY,
  },
] as const;

export const USER_VISIBLE_FEATURE_ACCESS_SETTING_KEYS = [
  CALCULATOR_FEATURE_FLAG_KEY,
  DOCUMENT_UPLOADS_FEATURE_FLAG_KEY,
  JOBS_FEATURE_FLAG_KEY,
  STUDY_MODE_FEATURE_FLAG_KEY,
  TRANSLATE_FEATURE_FLAG_KEY,
  VOICE_CHAT_FEATURE_FLAG_KEY,
] as const;

export type FeatureAccessReadStatus =
  | "confirmed"
  | "stale"
  | "unavailable";

export type FeatureAccessSettingsSnapshot = {
  durationMs: number;
  missingKeys: string[];
  source: string;
  status: FeatureAccessReadStatus;
  values: Map<string, unknown>;
};

export type FeatureAccessControlReadState =
  | "confirmed"
  | "missing"
  | "stale"
  | "unavailable"
  | "unreadable";

export type FeatureAccessControlState = {
  mode: FeatureAccessMode | null;
  rawValue: unknown;
  readState: FeatureAccessControlReadState;
  settingKey: string;
};

const DEFAULT_FEATURE_ACCESS_READ_TIMEOUT_MS = 8_000;
export const FEATURE_ACCESS_SETTINGS_CACHE_TAG = "feature-access-settings";
const lastKnownFeatureAccessValues = new Map<string, unknown>();

function normalizeKeys(keys: readonly string[]) {
  return Array.from(
    new Set(
      keys
        .map((key) => key.trim())
        .filter((key): key is string => key.length > 0)
    )
  );
}

function rememberFeatureAccessValues(values: Map<string, unknown>) {
  for (const [key, value] of values) {
    lastKnownFeatureAccessValues.set(key, value);
  }
}

function clearLastKnownFeatureAccessValue(key: string) {
  lastKnownFeatureAccessValues.delete(key.trim());
}

export function rememberFeatureAccessSettingValue(key: string, value: unknown) {
  const normalizedKey = key.trim();
  if (!normalizedKey) {
    return;
  }
  lastKnownFeatureAccessValues.set(normalizedKey, value);
}

function getLastKnownFeatureAccessValues(keys: readonly string[]) {
  const values = new Map<string, unknown>();
  for (const key of normalizeKeys(keys)) {
    if (lastKnownFeatureAccessValues.has(key)) {
      values.set(key, lastKnownFeatureAccessValues.get(key));
    }
  }
  return values;
}

function summarizeFeatureAccessValues(values: Map<string, unknown>) {
  return Object.fromEntries(
    Array.from(values.entries()).map(([key, value]) => [
      key,
      {
        normalized: parseFeatureAccessModeStrict(value),
        rawType: value === null ? "null" : typeof value,
      },
    ])
  );
}

const loadCachedFeatureAccessRows = unstable_cache(
  async (cacheKey: string) => {
    const keys = cacheKey.split("\n").filter(Boolean);
    return getLiteAppSettingsByKeysUncached(keys);
  },
  ["feature-access-settings-by-keys"],
  {
    revalidate: 60 * 10,
    tags: [FEATURE_ACCESS_SETTINGS_CACHE_TAG],
  }
);

function buildMissingKeys(keys: readonly string[], values: Map<string, unknown>) {
  return normalizeKeys(keys).filter((key) => !values.has(key));
}

export function buildFeatureAccessSnapshotFromValues({
  source,
  status,
  values,
}: {
  source: string;
  status: FeatureAccessReadStatus;
  values: Map<string, unknown>;
}): FeatureAccessSettingsSnapshot {
  return {
    durationMs: 0,
    missingKeys: [],
    source,
    status,
    values,
  };
}

export async function loadFeatureAccessSettingsByKeys(
  keys: readonly string[],
  {
    source,
    timeoutMs = DEFAULT_FEATURE_ACCESS_READ_TIMEOUT_MS,
  }: {
    source: string;
    timeoutMs?: number;
  }
): Promise<FeatureAccessSettingsSnapshot> {
  const uniqueKeys = normalizeKeys(keys);
  const startedAt = Date.now();

  if (uniqueKeys.length === 0) {
    return {
      durationMs: 0,
      missingKeys: [],
      source,
      status: "confirmed",
      values: new Map(),
    };
  }

  console.info("[feature-settings/load:start]", {
    keyCount: uniqueKeys.length,
    keys: uniqueKeys,
    source,
    timeoutMs,
  });

  try {
    const rows = await withTimeout(
      getLiteAppSettingsByKeysUncached(uniqueKeys),
      timeoutMs,
      () => {
        console.error("[feature-settings/load:timeout]", {
          keyCount: uniqueKeys.length,
          keys: uniqueKeys,
          source,
          timeoutMs,
        });
      }
    );
    const values = new Map(rows.map((row) => [row.key, row.value]));
    const missingKeys = buildMissingKeys(uniqueKeys, values);

    rememberFeatureAccessValues(values);
    for (const key of missingKeys) {
      clearLastKnownFeatureAccessValue(key);
    }

    const durationMs = Date.now() - startedAt;
    console.info("[feature-settings/load:end]", {
      durationMs,
      missingKeys,
      normalizedValues: summarizeFeatureAccessValues(values),
      rowCount: rows.length,
      source,
      status: "confirmed",
    });

    return {
      durationMs,
      missingKeys,
      source,
      status: "confirmed",
      values,
    };
  } catch (error) {
    let values = getLastKnownFeatureAccessValues(uniqueKeys);
    let fallbackSource = "memory";
    if (values.size === 0) {
      try {
        const cachedRows = await loadCachedFeatureAccessRows(
          uniqueKeys.join("\n")
        );
        values = new Map(cachedRows.map((row) => [row.key, row.value]));
        rememberFeatureAccessValues(values);
        fallbackSource = "persistent-cache";
      } catch (cacheError) {
        console.error("[feature-settings/load:cache-error]", {
          keys: uniqueKeys,
          source,
        }, cacheError);
      }
    }
    const durationMs = Date.now() - startedAt;
    const status: FeatureAccessReadStatus =
      values.size > 0 ? "stale" : "unavailable";

    console.error("[feature-settings/load:error]", {
      durationMs,
      fallbackSource,
      fallbackKeyCount: values.size,
      keys: uniqueKeys,
      normalizedFallbackValues: summarizeFeatureAccessValues(values),
      source,
      status,
    }, error);

    return {
      durationMs,
      missingKeys: buildMissingKeys(uniqueKeys, values),
      source,
      status,
      values,
    };
  }
}

export function resolveFeatureAccessControlState({
  settingKey,
  snapshot,
}: {
  settingKey: string;
  snapshot: FeatureAccessSettingsSnapshot;
}): FeatureAccessControlState {
  const hasValue = snapshot.values.has(settingKey);
  const rawValue = hasValue ? snapshot.values.get(settingKey) : null;
  const mode = parseFeatureAccessModeStrict(rawValue);

  if (snapshot.status === "confirmed") {
    return {
      mode,
      rawValue,
      readState: hasValue ? (mode ? "confirmed" : "unreadable") : "missing",
      settingKey,
    };
  }

  if (mode) {
    return {
      mode,
      rawValue,
      readState: "stale",
      settingKey,
    };
  }

  return {
    mode: null,
    rawValue,
    readState: "unavailable",
    settingKey,
  };
}
