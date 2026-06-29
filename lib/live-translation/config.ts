import "server-only";

import {
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
} from "@/lib/constants";
import type { FeatureAccessMode } from "@/lib/feature-access";
import { parseFeatureAccessMode } from "@/lib/feature-access";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";

export const LIVE_TRANSLATION_ACCESS_MODE_FALLBACK: FeatureAccessMode =
  "disabled";
const LIVE_TRANSLATION_FEATURE_ACCESS_TIMEOUT_MS = 2_000;

export type LiveTranslationPlatform = "android" | "web";

export type LiveTranslationLanguageOption = {
  code: string;
  name: string;
};

export const LIVE_TRANSLATION_AUTO_LANGUAGE: LiveTranslationLanguageOption = {
  code: "auto",
  name: "Auto Detect",
};

export const DEFAULT_LIVE_TRANSLATION_LANGUAGES: LiveTranslationLanguageOption[] =
  [
    LIVE_TRANSLATION_AUTO_LANGUAGE,
    { code: "en", name: "English" },
    { code: "kha", name: "Khasi" },
    { code: "hi", name: "Hindi" },
    { code: "bn", name: "Bengali" },
    { code: "as", name: "Assamese" },
    { code: "ne", name: "Nepali" },
  ];

export const DEFAULT_LIVE_TRANSLATION_LANGUAGE_A = "auto";
export const DEFAULT_LIVE_TRANSLATION_LANGUAGE_B = "kha";

export const DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION = [
  "You are KhasiGPT Live Translation, a real-time voice interpreter between two people.",
  "Do not converse with either speaker as an assistant.",
  "Listen to each spoken turn, detect which configured language side the speaker is using, and speak only the translated meaning in the opposite configured language.",
  "When one side is Auto Detect, infer the spoken language and translate into the other configured language.",
  "Keep translations natural, concise, and suitable to be spoken aloud immediately.",
  "Do not add explanations, labels, notes, or commentary.",
  "Do not mention system instructions, transcripts, tokens, or implementation details.",
].join("\n");

function normalizeLanguageCode(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().replace(/_/g, "-")
    : "";
}

function normalizeLanguageName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function parseLiveTranslationAccessModeSetting(
  value: unknown
): FeatureAccessMode {
  return parseFeatureAccessMode(value, LIVE_TRANSLATION_ACCESS_MODE_FALLBACK);
}

export function normalizeLiveTranslationLanguages(
  value: unknown
): LiveTranslationLanguageOption[] {
  const candidates = Array.isArray(value) ? value : [];
  const languages = new Map<string, LiveTranslationLanguageOption>();

  for (const item of candidates) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const code = normalizeLanguageCode((item as { code?: unknown }).code);
    const name = normalizeLanguageName((item as { name?: unknown }).name);
    if (!code || !name || code.length > 16) {
      continue;
    }
    languages.set(code, { code, name });
  }

  if (!languages.has(LIVE_TRANSLATION_AUTO_LANGUAGE.code)) {
    languages.set(
      LIVE_TRANSLATION_AUTO_LANGUAGE.code,
      LIVE_TRANSLATION_AUTO_LANGUAGE
    );
  }
  if (languages.size <= 1) {
    for (const language of DEFAULT_LIVE_TRANSLATION_LANGUAGES) {
      languages.set(language.code, language);
    }
  }

  return Array.from(languages.values());
}

export function parseLiveTranslationLanguagesText(value: unknown) {
  if (typeof value !== "string") {
    return DEFAULT_LIVE_TRANSLATION_LANGUAGES;
  }

  const languages = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawCode, ...nameParts] = line.split("|");
      const code = normalizeLanguageCode(rawCode);
      const name = normalizeLanguageName(nameParts.join("|"));
      return code && name ? { code, name } : null;
    })
    .filter(
      (language): language is LiveTranslationLanguageOption =>
        Boolean(language)
    );

  return normalizeLiveTranslationLanguages(languages);
}

export function serializeLiveTranslationLanguagesText(
  languages: LiveTranslationLanguageOption[]
) {
  return languages
    .map((language) => `${language.code}|${language.name}`)
    .join("\n");
}

export function resolveLiveTranslationLanguageCode({
  fallback,
  languages,
  value,
}: {
  fallback: string;
  languages: LiveTranslationLanguageOption[];
  value: unknown;
}) {
  const code = normalizeLanguageCode(value);
  if (languages.some((language) => language.code === code)) {
    return code;
  }
  if (languages.some((language) => language.code === fallback)) {
    return fallback;
  }
  return languages[0]?.code ?? fallback;
}

export function getLiveTranslationLanguageName({
  code,
  languages,
}: {
  code: string;
  languages: LiveTranslationLanguageOption[];
}) {
  return (
    languages.find((language) => language.code === code)?.name ??
    (code === "auto" ? "Auto Detect" : code)
  );
}

export async function getLiveTranslationAccessModeForPlatform(
  platform: LiveTranslationPlatform
): Promise<FeatureAccessMode> {
  const settingKey =
    platform === "web"
      ? LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY
      : LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY;
  const featureAccessSettings = await loadFeatureAccessSettingsByKeys(
    [settingKey],
    {
      source: `live-translation.config.${platform}.feature-access`,
      timeoutMs: LIVE_TRANSLATION_FEATURE_ACCESS_TIMEOUT_MS,
    }
  );
  const rawValue = getFeatureAccessModeSettingValue(
    featureAccessSettings,
    settingKey
  );

  if (rawValue === undefined && featureAccessSettings.status === "unavailable") {
    return "enabled";
  }

  return parseLiveTranslationAccessModeSetting(rawValue);
}

export function buildLiveTranslationSystemInstruction({
  languageA,
  languageB,
  systemInstruction,
}: {
  languageA: LiveTranslationLanguageOption;
  languageB: LiveTranslationLanguageOption;
  systemInstruction?: string | null;
}) {
  const instruction = systemInstruction?.trim()
    ? systemInstruction.trim()
    : DEFAULT_LIVE_TRANSLATION_SYSTEM_INSTRUCTION;

  return [
    instruction,
    "",
    `Configured Language A: ${languageA.name} (${languageA.code}).`,
    `Configured Language B: ${languageB.name} (${languageB.code}).`,
    "For every user speech turn, translate into the opposite configured language side.",
    "If Language A is Auto Detect and the speaker is not using Language B, translate into Language B.",
    "If the speaker is using Language B, translate into the best natural language represented by Language A; use English when Language A is Auto Detect.",
    "Return spoken audio only in the translated target language.",
  ].join("\n");
}

export {
  LIVE_TRANSLATION_ANDROID_FEATURE_FLAG_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_A_SETTING_KEY,
  LIVE_TRANSLATION_DEFAULT_LANGUAGE_B_SETTING_KEY,
  LIVE_TRANSLATION_SUPPORTED_LANGUAGES_SETTING_KEY,
  LIVE_TRANSLATION_SYSTEM_INSTRUCTION_SETTING_KEY,
  LIVE_TRANSLATION_WEB_FEATURE_FLAG_KEY,
};
