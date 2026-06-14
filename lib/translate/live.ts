import { buildTranslationSystemPrompt } from "@/lib/translate/prompts";

export const GEMINI_LIVE_TRANSLATION_MODEL_ID =
  "gemini-2.5-flash-native-audio-preview-12-2025";
export const GEMINI_LIVE_TRANSLATION_MODEL_NAME =
  "Gemini 2.5 Flash Native Audio (Preview)";
export const LIVE_AUDIO_SAMPLE_RATE = 16_000;
export const LIVE_AUDIO_MIME_TYPE = `audio/pcm;rate=${LIVE_AUDIO_SAMPLE_RATE}`;
export const LIVE_INTERPRETED_SOURCE_LANGUAGE_CODE = "kha";
export const LIVE_TOKEN_NEW_SESSION_WINDOW_MS = 2 * 60 * 1_000;
export const LIVE_TOKEN_SESSION_WINDOW_MS = 15 * 60 * 1_000;

export type LiveTokenFallbackReason =
  | "speech-model-missing"
  | "speech-model-disabled"
  | "speech-model-unsupported"
  | "live-api-unavailable";

export type LiveTranslationTokenResponse =
  | {
      liveSupported: true;
      token: string;
      modelDisplayName: string;
      modelProviderModelId: string;
      expireTime: string;
      newSessionExpireTime: string;
    }
  | {
      liveSupported: false;
      reason: LiveTokenFallbackReason;
      message: string;
    };

export function isGoogleLiveTranslationModel(
  model:
    | {
        provider: string;
        providerModelId: string;
      }
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

export function buildLiveTranslationSystemPrompt({
  languageName,
  languageCode,
  languageSystemPrompt,
}: {
  languageName: string;
  languageCode: string;
  languageSystemPrompt: string | null;
}) {
  return [
    buildTranslationSystemPrompt({
      languageName,
      languageCode,
      languageSystemPrompt,
    }),
    "This session receives live microphone audio from the user.",
    "Input transcription is rendered separately in the UI, so never repeat, label, or explain the source speech.",
    "Respond only with the live translation in the target language.",
    "Stream the translation progressively while the user is speaking when enough context is available.",
    "Do not add commentary, notes, stage directions, or metadata.",
    "If speech is incomplete, wait for more audio instead of guessing or filling gaps.",
  ].join("\n");
}

export function buildLiveInterpretedSourcePrompt({
  languageName,
  languageCode,
  languageSystemPrompt,
}: {
  languageName: string;
  languageCode: string;
  languageSystemPrompt: string | null;
}) {
  return [
    `You are a live interpreter that must respond only in ${languageName} (${languageCode}).`,
    "Never return English or any other source-language transcript.",
    "Convert the spoken meaning into natural target-language wording.",
    "Do not explain, label, summarize, or mention the source language.",
    "You receive short rolling microphone audio windows.",
    "Interpret the currently spoken meaning into the target language in a clean natural way.",
    "Return only the interpreted target-language text with no labels or commentary.",
    "If the audio is silent, unclear, or does not yet contain meaningful speech, return an empty string.",
    "Keep the output concise and stable across repeated overlapping audio windows.",
    ...(languageSystemPrompt
      ? [`Additional target-language guidance: ${languageSystemPrompt}`]
      : []),
  ].join("\n");
}

export function buildLiveTranscriptAndTranslationPrompt({
  languageName,
  languageCode,
  languageSystemPrompt,
}: {
  languageName: string;
  languageCode: string;
  languageSystemPrompt: string | null;
}) {
  return [
    "You are a live speech interpreter.",
    "You receive short rolling microphone audio windows that may overlap.",
    "First produce a faithful transcript in the original spoken language.",
    `Then translate the same meaning into ${languageName} (${languageCode}).`,
    "Return only compact JSON with exactly two string keys: transcript and translation.",
    'Example: {"transcript":"hello","translation":"khublei"}',
    "If there is not enough meaningful speech yet, return empty strings for both keys.",
    "Do not add markdown, labels, code fences, or extra keys.",
    ...(languageSystemPrompt
      ? [`Additional target-language guidance: ${languageSystemPrompt}`]
      : []),
  ].join("\n");
}
