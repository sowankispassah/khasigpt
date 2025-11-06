import { cache } from "react";
import { DEFAULT_SUGGESTED_PROMPTS } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import type { LanguageOption } from "@/lib/i18n/languages";

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

type SuggestedPromptsOptions = {
  preferredLanguageCode?: string | null;
  activeLanguage?: LanguageOption | null;
  languages?: LanguageOption[] | null;
};

async function fetchSuggestedPrompts({
  preferredLanguageCode = null,
  activeLanguage: providedActiveLanguage,
  languages: providedLanguages,
}: SuggestedPromptsOptions = {}): Promise<string[]> {
  let activeLanguage = providedActiveLanguage ?? null;
  let languages = providedLanguages ?? null;

  if (!activeLanguage || !languages) {
    const bundle = await getTranslationBundle(preferredLanguageCode);
    activeLanguage = bundle.activeLanguage;
    languages = bundle.languages;
  }

  const languageList = languages ?? [];
  const currentLanguage =
    activeLanguage ??
    languageList.find((language) => language.isActive) ??
    null;

  try {
    const storedMap = await getAppSetting<unknown>(
      "suggestedPromptsByLanguage"
    );

    if (isPromptsMap(storedMap)) {
      const activeLanguageCode = currentLanguage?.code;
      if (activeLanguageCode) {
        const fromLanguage = storedMap[activeLanguageCode];
        if (isPromptsArray(fromLanguage) && fromLanguage.length > 0) {
          return fromLanguage.map((prompt) => prompt.trim());
        }
      }

      const defaultLanguage =
        languageList.find((language) => language.isDefault) ??
        languageList[0] ??
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
