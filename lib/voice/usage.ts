export type LiveVoiceTurnUsage = {
  inputTokens: number;
  outputTokens: number;
};

const MAX_REPORTED_LIVE_VOICE_TOKENS = 200_000;

function normalizeTokenCount(value: unknown) {
  const numeric =
    typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Math.min(MAX_REPORTED_LIVE_VOICE_TOKENS, Math.round(numeric));
}

export function estimateTextTokens(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return 0;
  }

  const wordCount = normalized.split(" ").filter(Boolean).length;
  const characterEstimate = Math.ceil(normalized.length / 3.5);
  const wordEstimate = Math.ceil(wordCount * 1.35);

  return Math.max(1, characterEstimate, wordEstimate);
}

export function resolveLiveVoiceTurnUsage({
  assistantText,
  inputTokens,
  outputTokens,
  userText,
}: {
  assistantText: string;
  inputTokens?: unknown;
  outputTokens?: unknown;
  userText: string;
}): LiveVoiceTurnUsage {
  const reportedInputTokens = normalizeTokenCount(inputTokens);
  const reportedOutputTokens = normalizeTokenCount(outputTokens);
  const estimatedInputTokens = estimateTextTokens(userText);
  const estimatedOutputTokens = estimateTextTokens(assistantText);

  const hasReportedUsage = reportedInputTokens > 0 || reportedOutputTokens > 0;
  const baseInputTokens = hasReportedUsage
    ? Math.max(reportedInputTokens, estimatedInputTokens)
    : estimatedInputTokens;
  const baseOutputTokens = hasReportedUsage
    ? Math.max(reportedOutputTokens, estimatedOutputTokens)
    : estimatedOutputTokens;

  return {
    inputTokens: Math.max(1, Math.round(baseInputTokens)),
    outputTokens: Math.max(1, Math.round(baseOutputTokens)),
  };
}
