import { cache } from "react";
import {
  DEFAULT_SUGGESTED_PROMPTS,
  SUGGESTED_PROMPTS_ENABLED_SETTING_KEY,
} from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";

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

function parseEnabledSetting(value: unknown, fallback: boolean) {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }
  return fallback;
}

async function fetchSuggestedPrompts(
  preferredLanguageCode?: string | null
): Promise<string[]> {
  const { activeLanguage, languages } = await getTranslationBundle(
    preferredLanguageCode
  );

  try {
    const enabledSetting = await getAppSetting<unknown>(
      SUGGESTED_PROMPTS_ENABLED_SETTING_KEY
    );
    const enabled = parseEnabledSetting(enabledSetting, true);
    if (!enabled) {
      return [];
    }
  } catch (error) {
    console.warn(
      "Failed to load suggested prompts availability; falling back.",
      error
    );
  }

  try {
    const storedMap = await getAppSetting<unknown>(
      "suggestedPromptsByLanguage"
    );

    if (isPromptsMap(storedMap)) {
      const fromLanguage = storedMap[activeLanguage.code];
      if (isPromptsArray(fromLanguage) && fromLanguage.length > 0) {
        return fromLanguage.map((prompt) => prompt.trim());
      }

      const defaultLanguage =
        languages.find((language) => language.isDefault) ??
        languages[0] ??
        null;

      if (defaultLanguage) {
        const defaultPrompts = storedMap[defaultLanguage.code];
        if (isPromptsArray(defaultPrompts) && defaultPrompts.length > 0) {
          return defaultPrompts.map((prompt) => prompt.trim());
        }
      }
    }
  } catch (error) {
    console.warn(
      "Failed to load language-specific prompts; falling back.",
      error
    );
  }

  try {
    const stored = await getAppSetting<unknown>("suggestedPrompts");

    if (isPromptsArray(stored)) {
      const prompts = stored.map((item) => item.trim()).filter(Boolean);

      if (prompts.length > 0) {
        return prompts;
      }
    }
  } catch (error) {
    console.warn("Failed to load suggested prompts, using defaults.", error);
  }

  return [...DEFAULT_SUGGESTED_PROMPTS];
}

export const loadSuggestedPrompts = cache(fetchSuggestedPrompts);
