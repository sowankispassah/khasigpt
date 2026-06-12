import "server-only";

import { generateText } from "ai";
import { getModelRegistry } from "@/lib/ai/model-registry";
import { resolveLanguageModel } from "@/lib/ai/providers";
import { withTimeout } from "@/lib/utils/async";

const KHASI_TRANSCRIPT_NORMALIZATION_TIMEOUT_MS = 8_000;
const MAX_NORMALIZED_TRANSCRIPT_LENGTH = 20_000;
const CHAT_MODEL_LOOKUP_TIMEOUT_MS = 2_500;

type NormalizationDecision = {
  transcript?: unknown;
  shouldNormalize?: unknown;
};

function isKhasiLanguageCode(languageCode: string | null | undefined) {
  const normalized = languageCode?.trim().toLowerCase();
  return normalized === "kha" || normalized === "khasi";
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
  const registry = await withTimeout(
    getModelRegistry(),
    CHAT_MODEL_LOOKUP_TIMEOUT_MS
  );
  if (!registry.defaultConfig) {
    throw new Error("No default chat model is configured.");
  }
  return resolveLanguageModel(registry.defaultConfig);
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

  if (!rawUserText || !isKhasiLanguageCode(languageCode)) {
    return rawUserText;
  }

  try {
    const model = await getDefaultChatLanguageModelForVoiceCleanup();
    const result = await withTimeout(
      generateText({
        model,
        system: [
          "You decide whether a saved voice transcript should be corrected for Khasi.",
          "This is transcript correction, not translation.",
          "Only rewrite the user's transcript into Khasi Latin script when the raw transcript is likely spoken Khasi that speech recognition incorrectly represented with another language's words or script.",
          "Keep the raw transcript unchanged when it appears to be genuine English, Hindi, Spanish, or another intentionally spoken language.",
          "Keep intentional code-switching as-is unless the non-Khasi text is clearly phonetic garbage for spoken Khasi.",
          "Use the assistant reply only as weak context. A Khasi assistant reply is not enough by itself to force Khasi normalization.",
          "If uncertain, set shouldNormalize to false and preserve the raw transcript.",
          "Return strict JSON only with this shape: {\"shouldNormalize\": boolean, \"transcript\": string}.",
        ].join("\n"),
        prompt: JSON.stringify({
          targetLanguage: "Khasi (kha)",
          rawUserTranscript: rawUserText,
          assistantReplyContext: assistantContext,
        }),
        temperature: 0,
        maxOutputTokens: 160,
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
