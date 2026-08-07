import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";

type AuthFallbackLanguageOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  syncUiLanguage: boolean;
};

const AUTH_FALLBACK_LANGUAGES: AuthFallbackLanguageOption[] = [
  {
    id: "auth-fallback-en",
    code: "en",
    name: "English",
    isDefault: true,
    isActive: true,
    syncUiLanguage: true,
  },
  {
    id: "auth-fallback-kha",
    code: "kha",
    name: "Khasi",
    isDefault: false,
    isActive: true,
    syncUiLanguage: true,
  },
];

const AUTH_FALLBACK_DICTIONARY = Object.freeze(
  STATIC_TRANSLATION_DEFINITIONS.reduce<Record<string, string>>(
    (accumulator, definition) => {
      accumulator[definition.key] = definition.defaultText;
      return accumulator;
    },
    {}
  )
);

function normalizeLanguageCode(value?: string | null) {
  return value?.trim().toLowerCase() ?? "";
}

export function getAuthFallbackTranslationBundle(preferredCode?: string | null) {
  const normalizedCode = normalizeLanguageCode(preferredCode);
  const activeLanguage =
    AUTH_FALLBACK_LANGUAGES.find((entry) => entry.code === normalizedCode) ??
    AUTH_FALLBACK_LANGUAGES[0];

  return {
    activeLanguage,
    dictionary: { ...AUTH_FALLBACK_DICTIONARY },
    languages: [...AUTH_FALLBACK_LANGUAGES],
  };
}
