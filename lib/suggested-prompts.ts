import { unstable_cache } from "next/cache";
import { cache } from "react";
import { DEFAULT_SUGGESTED_PROMPTS } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import type { LanguageOption } from "@/lib/i18n/languages";

type SuggestedPromptsMap = Record<string, string[]>;

function isPromptsArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
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

function sanitizePrompts(prompts: string[]): string[] {
  const unique = new Set<string>();

  for (const prompt of prompts) {
    const normalized = prompt.trim();
    if (normalized.length === 0) {
      continue;
    }
    unique.add(normalized);
  }

  return Array.from(unique);
}

const loadStoredPrompts = unstable_cache(
  async () => {
    try {
      const [languageMapSetting, fallbackSetting] = await Promise.all([
        getAppSetting<unknown>("suggestedPromptsByLanguage"),
        getAppSetting<unknown>("suggestedPrompts"),
      ]);

      const byLanguage = isPromptsMap(languageMapSetting)
        ? Object.fromEntries(
            Object.entries(languageMapSetting).map(([code, prompts]) => [
              code,
              sanitizePrompts(prompts),
            ])
          )
        : {};

      const fallback = isPromptsArray(fallbackSetting)
        ? sanitizePrompts(fallbackSetting)
        : [];

      return { byLanguage, fallback };
    } catch (error) {
      console.warn("Failed to load suggested prompts, using defaults.", error);
      return { byLanguage: {}, fallback: [] };
    }
  },
  ["suggested-prompts-config"],
  { revalidate: 300, tags: ["suggested-prompts"] }
);

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

  const { byLanguage, fallback } = await loadStoredPrompts();

  const activeLanguageCode = currentLanguage?.code;
  if (activeLanguageCode) {
    const fromLanguage = byLanguage[activeLanguageCode];
    if (fromLanguage && fromLanguage.length > 0) {
      return fromLanguage;
    }
  }

  const defaultLanguage =
    languageList.find((language) => language.isDefault) ??
    languageList[0] ??
    null;

  if (defaultLanguage) {
    const defaultPrompts = byLanguage[defaultLanguage.code];
    if (defaultPrompts && defaultPrompts.length > 0) {
      return defaultPrompts;
    }
  }

  if (fallback.length > 0) {
    return fallback;
  }

  return [...DEFAULT_SUGGESTED_PROMPTS];
}

export const loadSuggestedPrompts = cache(fetchSuggestedPrompts);
