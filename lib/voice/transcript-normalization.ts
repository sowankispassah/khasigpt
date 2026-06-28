import "server-only";

import { generateText } from "ai";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { resolveLanguageModel } from "@/lib/ai/providers";
import type { ModelConfig } from "@/lib/db/schema";
import { withTimeout } from "@/lib/utils/async";

const KHASI_TRANSCRIPT_NORMALIZATION_TIMEOUT_MS = 8_000;
const MAX_NORMALIZED_TRANSCRIPT_LENGTH = 20_000;
const CHAT_MODEL_LOOKUP_TIMEOUT_MS = 2_500;
const NON_LATIN_SPEECH_RECOGNITION_SCRIPT_PATTERN =
  /[\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const HARD_CODED_DEFAULT_CHAT_MODEL: ModelConfig = {
  codeTemplate: "",
  config: null,
  createdAt: new Date("2026-03-15T10:45:50.481Z"),
  deletedAt: null,
  description: "",
  displayName: "KhasiGPT3.1",
  freeMessagesPerDay: 3,
  id: "de6e3282-28cf-4351-ba28-880f398f6070",
  inputProviderCostPerMillion: 0.25,
  isDefault: true,
  isEnabled: true,
  isMarginBaseline: true,
  key: "gemini-3.1-flash-lite-preview",
  outputProviderCostPerMillion: 1.5,
  provider: "google",
  providerModelId: "gemini-3.1-flash-lite-preview",
  reasoningTag: "",
  supportsReasoning: false,
  systemPrompt: "",
  updatedAt: new Date("2026-06-13T12:02:20.409Z"),
};

type NormalizationDecision = {
  transcript?: unknown;
  shouldNormalize?: unknown;
};

function isKhasiLanguageCode(languageCode: string | null | undefined) {
  const normalized = languageCode?.trim().toLowerCase();
  return normalized === "kha" || normalized === "khasi";
}

const KHASI_CONTEXT_MARKERS = [
  "nga",
  "phi",
  "kumno",
  "kyrteng",
  "ban",
  "lah",
  "dei",
  "ka",
  "ki",
  "ha",
  "jong",
  "shaphang",
  "khasi",
] as const;

function hasLikelyKhasiContext(text: string) {
  const normalized = ` ${text.toLowerCase().replace(/[^a-z]+/g, " ")} `;
  return KHASI_CONTEXT_MARKERS.some((marker) =>
    normalized.includes(` ${marker} `)
  );
}

function containsNonLatinSpeechRecognitionScript(text: string) {
  return NON_LATIN_SPEECH_RECOGNITION_SCRIPT_PATTERN.test(text);
}

function shouldAttemptKhasiVoiceTranscriptNormalization({
  assistantText,
  languageCode,
}: {
  assistantText: string;
  languageCode?: string | null;
}) {
  return isKhasiLanguageCode(languageCode) || hasLikelyKhasiContext(assistantText);
}

function cleanTranscriptText(text: string) {
  return text
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .slice(0, MAX_NORMALIZED_TRANSCRIPT_LENGTH)
    .trim();
}

function parseNormalizationDecision(text: string) {
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as NormalizationDecision;
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.shouldNormalize === "boolean" &&
      typeof parsed.transcript === "string"
    ) {
      return {
        shouldNormalize: parsed.shouldNormalize,
        transcript: cleanTranscriptText(parsed.transcript),
      };
    }
  } catch {
    // Fall back to preserving the raw transcript.
  }

  return null;
}

async function getDefaultChatLanguageModelForVoiceCleanup() {
  try {
    const registry = await withTimeout(
      getModelRegistry(),
      CHAT_MODEL_LOOKUP_TIMEOUT_MS
    );
    if (registry.defaultConfig) {
      return resolveLanguageModel(registry.defaultConfig);
    }
    throw new Error("No default chat model is configured.");
  } catch (error) {
    console.warn(
      "[voice] Default chat model lookup failed. Using hard-coded current default chat model for transcript normalization.",
      error
    );
    return resolveLanguageModel(HARD_CODED_DEFAULT_CHAT_MODEL);
  }
}

export async function normalizeKhasiVoiceTranscript({
  assistantText,
  languageCode,
  userText,
}: {
  assistantText: string;
  languageCode?: string | null;
  userText: string;
}) {
  const rawUserText = userText.replace(/\s+/g, " ").trim();
  const assistantContext = assistantText.replace(/\s+/g, " ").trim();
  const contextLikelyKhasi = shouldAttemptKhasiVoiceTranscriptNormalization({
    assistantText: assistantContext,
    languageCode,
  });
  const rawContainsNonLatinScript =
    containsNonLatinSpeechRecognitionScript(rawUserText);

  if (
    !rawUserText ||
    !contextLikelyKhasi
  ) {
    return rawUserText;
  }

  try {
    const model = await getDefaultChatLanguageModelForVoiceCleanup();
    const result = await withTimeout(
      generateText({
        model,
        system: [
          "You clean saved Voice Mode transcripts for Khasi conversations.",
          "This is transcript correction, not translation.",
          "Only rewrite the user's transcript into standard Khasi Latin script when the raw transcript is likely spoken Khasi that speech recognition incorrectly represented with another language's words, spelling, or script.",
          "Use sound-alike correction for Khasi words. Correct phonetic chunks into normal Khasi spelling when the intended Khasi is clear.",
          "When the conversation context is Khasi and the raw transcript contains Chinese, Japanese, Korean, Devanagari, Bengali, Gurmukhi, or another non-Latin script, treat it as a likely speech-recognition script error unless the assistant context clearly shows the user intentionally spoke that language.",
          "For non-Latin script errors in a Khasi context, set shouldNormalize to true and produce the best concise Khasi Latin-script transcript supported by the raw sounds and assistant reply context.",
          "Keep the raw transcript unchanged when it appears to be genuine English, Hindi, Spanish, or another intentionally spoken language.",
          "Keep intentional code-switching as-is unless the non-Khasi text is clearly phonetic garbage for spoken Khasi.",
          "Use the selected target language and assistant reply as context for whether this is a Khasi voice conversation, but never translate genuine non-Khasi speech.",
          "If uncertain with Latin-script text, set shouldNormalize to false and preserve the raw transcript. If uncertain with non-Latin script text inside a Khasi context, normalize to the most likely Khasi wording instead of preserving the foreign script.",
          "Examples:",
          "{\"raw\":\"Pikerteng Guno\",\"decision\":{\"shouldNormalize\":true,\"transcript\":\"Phi kyrteng kumno?\"}}",
          "{\"raw\":\"Pikerteng kumno\",\"decision\":{\"shouldNormalize\":true,\"transcript\":\"Phi kyrteng kumno?\"}}",
          "{\"raw\":\"가끔씩 아이유가 귀여워 죽어\",\"context\":\"Khasi assistant reply about U Tirot Sing\",\"decision\":{\"shouldNormalize\":true,\"transcript\":\"Katto katne ki jingkynmaw shaphang u?\"}}",
          "{\"raw\":\"¿Cómo te hace?\",\"decision\":{\"shouldNormalize\":true,\"transcript\":\"Kumno phi long?\"}}",
          "{\"raw\":\"What is your name?\",\"decision\":{\"shouldNormalize\":false,\"transcript\":\"What is your name?\"}}",
          "Return strict JSON only with this shape: {\"shouldNormalize\": boolean, \"transcript\": string}.",
        ].join("\n"),
        prompt: JSON.stringify({
          contextLikelyKhasi,
          rawContainsNonLatinScript,
          targetLanguage: "Khasi (kha)",
          rawUserTranscript: rawUserText,
          assistantReplyContext: assistantContext,
        }),
        temperature: 0,
        maxOutputTokens: 240,
      }),
      KHASI_TRANSCRIPT_NORMALIZATION_TIMEOUT_MS
    );
    const decision = parseNormalizationDecision(result.text);
    if (!decision?.shouldNormalize || !decision.transcript) {
      return rawUserText;
    }
    return decision.transcript;
  } catch (error) {
    console.warn("[voice] Khasi transcript normalization failed.", error);
    return rawUserText;
  }
}
