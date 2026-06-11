import "server-only";

import { generateText } from "ai";
import { getTitleLanguageModel } from "@/lib/ai/providers";
import { withTimeout } from "@/lib/utils/async";

const KHASI_TRANSCRIPT_NORMALIZATION_TIMEOUT_MS = 8_000;
const MAX_NORMALIZED_TRANSCRIPT_LENGTH = 20_000;

function isKhasiLanguageCode(languageCode: string | null | undefined) {
  const normalized = languageCode?.trim().toLowerCase();
  return normalized === "kha" || normalized === "khasi";
}

function cleanModelOutput(text: string) {
  return text
    .replace(/^```(?:text)?/i, "")
    .replace(/```$/i, "")
    .trim()
    .slice(0, MAX_NORMALIZED_TRANSCRIPT_LENGTH)
    .trim();
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
    const result = await withTimeout(
      generateText({
        model: getTitleLanguageModel(),
        system: [
          "You clean final saved transcripts for Khasi voice chat.",
          "The speech recognizer may write spoken Khasi phonetically in another language or script, such as Devanagari, Hindi-looking text, Spanish-looking text, or English-looking text.",
          "Rewrite the user's utterance as natural Khasi in Latin script.",
          "Use the assistant reply only as context for the intended meaning.",
          "Do not answer the user. Do not translate the assistant reply. Do not add explanations.",
          "If the raw text is already readable Khasi, lightly correct spelling and spacing only.",
          "Return only the cleaned Khasi user transcript.",
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
    const normalized = cleanModelOutput(result.text);
    return normalized || rawUserText;
  } catch (error) {
    console.warn("[voice] Khasi transcript normalization failed.", error);
    return rawUserText;
  }
}
