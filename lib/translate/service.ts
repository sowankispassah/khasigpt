import "server-only";

import { getTranslationFeatureLanguageByCodeRaw } from "@/lib/db/queries";
import { translateSourceTextWithAIModel } from "@/lib/translate/ai-service";
import type { TranslateProviderMode } from "@/lib/translate/config";
import { translateSourceTextWithGoogle } from "@/lib/translate/google-service";
import { withTimeout } from "@/lib/utils/async";

const TRANSLATE_LANGUAGE_TIMEOUT_MS = 5_000;

export async function translateSourceText({
  providerMode,
  sourceText,
  targetLanguageCode,
  translationMode = "text",
}: {
  providerMode: TranslateProviderMode;
  sourceText: string;
  targetLanguageCode: string;
  translationMode?: "speech" | "text";
}) {
  const normalizedSourceText = sourceText.trim();
  const normalizedTargetLanguageCode = targetLanguageCode.trim().toLowerCase();

  if (!normalizedSourceText) {
    throw new Error("Source text is required.");
  }

  if (!normalizedTargetLanguageCode) {
    throw new Error("Target language is required.");
  }

  const targetLanguage = await withTimeout(
    getTranslationFeatureLanguageByCodeRaw(normalizedTargetLanguageCode),
    TRANSLATE_LANGUAGE_TIMEOUT_MS
  );

  if (!targetLanguage || (!targetLanguage.isActive && !targetLanguage.isDefault)) {
    throw new Error("The selected target language is unavailable.");
  }

  const result =
    providerMode === "google"
      ? await translateSourceTextWithGoogle({
          sourceText: normalizedSourceText,
          targetLanguageCode: normalizedTargetLanguageCode,
        })
      : await translateSourceTextWithAIModel({
          sourceText: normalizedSourceText,
          targetLanguageCode: normalizedTargetLanguageCode,
          translationMode,
        });

  return {
    translatedText: result.translatedText,
    targetLanguage: {
      code: targetLanguage.code,
      name: targetLanguage.name,
    },
    model: result.model,
    providerMode,
  };
}
