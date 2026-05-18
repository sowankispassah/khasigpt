import type { LanguageOption } from "@/lib/i18n/languages";
import { STATIC_TRANSLATION_DEFINITIONS } from "@/lib/i18n/static-definitions";

export const STATIC_LANGUAGES: LanguageOption[] = [
  {
    id: "static-en",
    code: "en",
    name: "English",
    isDefault: true,
    isActive: true,
    syncUiLanguage: true,
  },
  {
    id: "static-kha",
    code: "kha",
    name: "Khasi",
    isDefault: false,
    isActive: true,
    syncUiLanguage: true,
  },
];

export const STATIC_ACTIVE_LANGUAGE = STATIC_LANGUAGES[0];

export const STATIC_DICTIONARY = STATIC_TRANSLATION_DEFINITIONS.reduce<
  Record<string, string>
>((accumulator, definition) => {
  accumulator[definition.key] = definition.defaultText;
  return accumulator;
}, {});

export const STATIC_TRANSLATION_BUNDLE = {
  languages: STATIC_LANGUAGES,
  activeLanguage: STATIC_ACTIVE_LANGUAGE,
  dictionary: STATIC_DICTIONARY,
};
