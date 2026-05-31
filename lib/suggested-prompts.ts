import { cache } from "react";
import {
  DEFAULT_SUGGESTED_PROMPTS,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
} from "@/lib/constants";
import {
  getLiteAppSettingsByKeysUncached,
} from "@/lib/db/app-settings-lite";
import {
  getLastKnownAppSettingsByKeys,
} from "@/lib/db/queries";
import type { UserRole } from "@/lib/db/schema";
import {
  type FeatureAccessMode,
  isFeatureEnabledForRole,
  parseFeatureAccessMode,
} from "@/lib/feature-access";
import { resolveLanguage } from "@/lib/i18n/languages";

type SuggestedPromptsMap = Record<string, string[]>;

function isPromptsArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isPromptsMap(value: unknown): value is SuggestedPromptsMap {
  if (!value || typeof value !== "object") {
    return false;
  }

  return Object.entries(value).every(
    ([lang, prompts]) => typeof lang === "string" && isPromptsArray(prompts)
  );
}

export const SUGGESTED_PROMPTS_ACCESS_MODE_FALLBACK: FeatureAccessMode =
  "enabled";

export function parseSuggestedPromptsAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, SUGGESTED_PROMPTS_ACCESS_MODE_FALLBACK);
}

const SUGGESTED_PROMPT_SETTING_KEYS = [
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
  "suggestedPromptsByLanguage",
  "suggestedPrompts",
];

async function loadSuggestedPromptSettings() {
  try {
    const settings = await getLiteAppSettingsByKeysUncached(
      SUGGESTED_PROMPT_SETTING_KEYS
    );
    return new Map(settings.map((setting) => [setting.key, setting.value]));
  } catch (error) {
    console.warn("Failed to load suggested prompt settings; falling back.", error);
    return getLastKnownAppSettingsByKeys(SUGGESTED_PROMPT_SETTING_KEYS);
  }
}

async function fetchSuggestedPrompts(
  preferredLanguageCode?: string | null,
  userRole?: UserRole | null
): Promise<string[]> {
  const [{ activeLanguage, languages }, settings] = await Promise.all([
    resolveLanguage(preferredLanguageCode),
    loadSuggestedPromptSettings(),
  ]);

  const enabledSetting = settings.get(SUGGESTED_PROMPTS_ENABLED_SETTING_KEY);
  const mode = parseSuggestedPromptsAccessModeSetting(enabledSetting);
  const enabled = isFeatureEnabledForRole(mode, userRole ?? null);
  if (!enabled && process.env.PLAYWRIGHT !== "true") {
    return [];
  }

  const storedMap = settings.get("suggestedPromptsByLanguage");

  if (isPromptsMap(storedMap)) {
    const fromLanguage = storedMap[activeLanguage.code];
    if (isPromptsArray(fromLanguage) && fromLanguage.length > 0) {
      return fromLanguage.map((prompt) => prompt.trim());
    }

    const defaultLanguage =
      languages.find((language) => language.isDefault) ?? languages[0] ?? null;

    if (defaultLanguage) {
      const defaultPrompts = storedMap[defaultLanguage.code];
      if (isPromptsArray(defaultPrompts) && defaultPrompts.length > 0) {
        return defaultPrompts.map((prompt) => prompt.trim());
      }
    }
  }

  const stored = settings.get("suggestedPrompts");

  if (isPromptsArray(stored)) {
    const prompts = stored.map((item) => item.trim()).filter(Boolean);

    if (prompts.length > 0) {
      return prompts;
    }
  }

  return [...DEFAULT_SUGGESTED_PROMPTS];
}

export const loadSuggestedPrompts = cache(fetchSuggestedPrompts);
