import "server-only";

import { generateText } from "ai";
import { resolveLanguageModel } from "@/lib/ai/providers";
import {
  getModelConfigById,
  getTranslationFeatureLanguageByCodeRaw,
} from "@/lib/db/queries";
import type { ModelConfig } from "@/lib/db/schema";
import {
  buildLiveSpeechTranslationPrompt,
  buildTranslationSystemPrompt,
} from "@/lib/translate/prompts";
import { withTimeout } from "@/lib/utils/async";

const TRANSLATE_LANGUAGE_TIMEOUT_MS = 5_000;
const TRANSLATE_MODEL_TIMEOUT_MS = 7_000;
const TRANSLATE_GENERATION_TIMEOUT_MS = 25_000;

export function isGoogleLiveTranslationModel(
  model:
    | Pick<ModelConfig, "provider" | "providerModelId">
    | null
    | undefined
) {
  if (!model || model.provider !== "google") {
    return false;
  }

  const providerModelId = model.providerModelId.trim().toLowerCase();
  return (
    providerModelId.includes("native-audio") ||
    providerModelId.includes("-live")
  );
}

export async function translateSourceTextWithAIModel({
  sourceText,
  targetLanguageCode,
  translationMode = "text",
}: {
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

  if (!targetLanguage.modelConfigId) {
    throw new Error("No model is configured for the selected target language.");
  }

  const textModelConfig = await withTimeout(
    getModelConfigById({ id: targetLanguage.modelConfigId }),
    TRANSLATE_MODEL_TIMEOUT_MS
  );

  if (!textModelConfig || !textModelConfig.isEnabled) {
    throw new Error("The selected target language model is unavailable.");
  }

  const speechModelConfig =
    translationMode === "speech" && targetLanguage.speechModelConfigId
      ? await withTimeout(
          getModelConfigById({ id: targetLanguage.speechModelConfigId }),
          TRANSLATE_MODEL_TIMEOUT_MS
        ).catch(() => null)
      : null;

  const preferredModelConfig =
    speechModelConfig?.isEnabled ? speechModelConfig : textModelConfig;

  const runTranslation = async (
    modelConfig: NonNullable<typeof textModelConfig>
  ) =>
    await withTimeout(
      generateText({
        model: resolveLanguageModel(modelConfig),
        system:
          translationMode === "speech"
            ? buildLiveSpeechTranslationPrompt({
                languageName: targetLanguage.name,
                languageCode: targetLanguage.code,
                languageSystemPrompt: targetLanguage.systemPrompt ?? null,
              })
            : buildTranslationSystemPrompt({
                languageName: targetLanguage.name,
                languageCode: targetLanguage.code,
                languageSystemPrompt: targetLanguage.systemPrompt ?? null,
              }),
        temperature: 0,
        maxOutputTokens: translationMode === "speech" ? 120 : 800,
        prompt: normalizedSourceText,
      }),
      TRANSLATE_GENERATION_TIMEOUT_MS
    );

  let response: Awaited<ReturnType<typeof runTranslation>>;
  try {
    response = await runTranslation(preferredModelConfig);
  } catch (error) {
    if (
      preferredModelConfig.id !== textModelConfig.id &&
      translationMode === "speech"
    ) {
      console.warn(
        "[translate] Speech model failed for AI translation path. Falling back to text model.",
        {
          preferredModelId: preferredModelConfig.id,
          fallbackModelId: textModelConfig.id,
        },
        error
      );
      response = await runTranslation(textModelConfig);
    } else {
      throw error;
    }
  }

  return {
    translatedText: response.text.trim(),
    model: {
      id:
        preferredModelConfig.id === textModelConfig.id || !speechModelConfig
          ? textModelConfig.id
          : preferredModelConfig.id,
      name:
        preferredModelConfig.id === textModelConfig.id || !speechModelConfig
          ? textModelConfig.displayName
          : preferredModelConfig.displayName,
      provider:
        preferredModelConfig.id === textModelConfig.id || !speechModelConfig
          ? textModelConfig.provider
          : preferredModelConfig.provider,
    },
  };
}
