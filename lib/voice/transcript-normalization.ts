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
  /[\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff\u0600-\u06ff\u0900-\u097f\u0980-\u09ff\u0a00-\u0d7f\u0e00-\u0e7f\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u;
const MOJIBAKE_TRANSCRIPT_PATTERN =
  /(?:\u00c2|\u00c3|\u00e2[\u0080-\u00bf]?|\ufffd|\u00bf|\u00a1)/iu;
const UNRELATED_LATIN_LANGUAGE_MARKER_PATTERNS = [
  /\b(?:mahal|kita|salamat|kumusta|ikaw|siya|tayo|bakit|paano|saan|ngayon|hindi|opo)\b/i,
  /\b(?:c(?:o|\u00f3)mo|qu(?:e|\u00e9)|hola|gracias|buenos|buenas|usted|estoy|tiene|hacer|favor)\b/i,
  /\b(?:mera|teri|tum|aap|kaise|kya|nahi|hai|haan|namaste|dhanyavad)\b/i,
  /\b(?:ni hao|xie xie|annyeong|kamsahamnida|arigato)\b/i,
] as const;
const ENGLISH_FAILURE_FALLBACK_PATTERN =
  /\b(?:cannot|can't|unable|unclear|transcribe|transcript|speech|language)\b/i;
const UNCLEAR_KHASI_TRANSCRIPT_FALLBACK =
  "Ym lah ban pynbeit shai ia ka jingkren Khasi.";
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

function containsMojibakeTranscriptArtifact(text: string) {
  return MOJIBAKE_TRANSCRIPT_PATTERN.test(text);
}

function hasLikelyUnrelatedLatinLanguage(text: string) {
  return UNRELATED_LATIN_LANGUAGE_MARKER_PATTERNS.some((pattern) =>
    pattern.test(text)
  );
}

function isUnsafeForForcedKhasiTranscript(text: string) {
  return (
    containsNonLatinSpeechRecognitionScript(text) ||
    containsMojibakeTranscriptArtifact(text) ||
    hasLikelyUnrelatedLatinLanguage(text) ||
    ENGLISH_FAILURE_FALLBACK_PATTERN.test(text)
  );
}

function shouldAttemptKhasiVoiceTranscriptNormalization({
  assistantText,
  languageCode,
  userText,
}: {
  assistantText: string;
  languageCode?: string | null;
  userText?: string;
}) {
  return (
    isKhasiLanguageCode(languageCode) ||
    hasLikelyKhasiContext(assistantText) ||
    hasLikelyKhasiContext(userText ?? "")
  );
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

async function forceKhasiTranscriptNormalization({
  assistantContext,
  model,
  rawUserText,
}: {
  assistantContext: string;
  model: Awaited<ReturnType<typeof getDefaultChatLanguageModelForVoiceCleanup>>;
  rawUserText: string;
}) {
  const result = await withTimeout(
    generateText({
      model,
      system: [
        "Rewrite a likely Khasi voice-recognition transcript into clean Khasi Latin script only.",
        "This is transcript correction, not translation.",
        "The user intended to speak Khasi, but speech recognition may have output Chinese, Filipino, Hindi, Spanish, mojibake, or another unrelated language/script.",
        "Do not preserve unrelated words or foreign script when they are recognition errors for Khasi speech.",
        "Do not output explanations, labels, alternatives, JSON, or any non-Khasi language.",
        "If exact wording is uncertain, output the closest concise Khasi sentence supported by the raw sounds and assistant context.",
      ].join("\n"),
      prompt: JSON.stringify({
        targetLanguage: "Khasi (kha)",
        rawUserTranscript: rawUserText,
        assistantReplyContext: assistantContext,
      }),
      temperature: 0,
      maxOutputTokens: 240,
    }),
    KHASI_TRANSCRIPT_NORMALIZATION_TIMEOUT_MS
  );
  const transcript = cleanTranscriptText(result.text);
  if (!transcript || isUnsafeForForcedKhasiTranscript(transcript)) {
    return null;
  }
  return transcript;
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
  const expectedKhasi = isKhasiLanguageCode(languageCode);
  const contextLikelyKhasi = shouldAttemptKhasiVoiceTranscriptNormalization({
    assistantText: assistantContext,
    languageCode,
    userText: rawUserText,
  });
  const rawContainsNonLatinScript =
    containsNonLatinSpeechRecognitionScript(rawUserText);
  const rawContainsMojibakeArtifact =
    containsMojibakeTranscriptArtifact(rawUserText);
  const rawLooksUnrelatedLatin =
    hasLikelyUnrelatedLatinLanguage(rawUserText);
  const mustProduceKhasiTranscript =
    expectedKhasi &&
    (rawContainsNonLatinScript ||
      rawContainsMojibakeArtifact ||
      rawLooksUnrelatedLatin);

  if (!rawUserText || !contextLikelyKhasi) {
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
          "When the selected language is Khasi, the final saved transcript must be readable Khasi in Latin script.",
          "Only rewrite the user's transcript into standard Khasi Latin script when the raw transcript is likely spoken Khasi that speech recognition incorrectly represented with another language's words, spelling, or script.",
          "Use sound-alike correction for Khasi words. Correct phonetic chunks into normal Khasi spelling when the intended Khasi is clear.",
          "When the conversation context is Khasi and the raw transcript contains Chinese, Japanese, Korean, Devanagari, Bengali, Gurmukhi, Arabic, Thai, Cyrillic, Greek, or another non-Latin script, treat it as a likely speech-recognition script error unless the assistant context clearly shows the user intentionally spoke that language.",
          "When the selected language is Khasi and the raw transcript contains obvious Filipino, Spanish, Hindi, Chinese romanization, or mojibake artifacts, treat it as a likely recognition error for spoken Khasi.",
          "For non-Latin script errors in a Khasi context, set shouldNormalize to true and produce the best concise Khasi Latin-script transcript supported by the raw sounds and assistant reply context.",
          "Never return Chinese, Filipino, Hindi, Spanish, Korean, Japanese, Bengali, Devanagari, or mojibake text as the corrected transcript when the selected language is Khasi.",
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
          expectedKhasi,
          mustProduceKhasiTranscript,
          rawContainsMojibakeArtifact,
          rawContainsNonLatinScript,
          rawLooksUnrelatedLatin,
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
    if (
      decision?.transcript &&
      (decision.shouldNormalize || mustProduceKhasiTranscript) &&
      !(
        mustProduceKhasiTranscript &&
        isUnsafeForForcedKhasiTranscript(decision.transcript)
      )
    ) {
      return decision.transcript;
    }
    if (mustProduceKhasiTranscript) {
      const strictTranscript = await forceKhasiTranscriptNormalization({
        assistantContext,
        model,
        rawUserText,
      });
      return strictTranscript ?? UNCLEAR_KHASI_TRANSCRIPT_FALLBACK;
    }
    return rawUserText;
  } catch (error) {
    console.warn("[voice] Khasi transcript normalization failed.", error);
    return mustProduceKhasiTranscript
      ? UNCLEAR_KHASI_TRANSCRIPT_FALLBACK
      : rawUserText;
  }
}
