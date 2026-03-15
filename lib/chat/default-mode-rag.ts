const DEFAULT_MODE_RAG_POSITIVE_PATTERN =
  /\b(?:khasi|app|platform|website|feature|pricing|price|credit|subscription|plan|policy|privacy|terms|account|login|register|upload|document|study|jobs|admin|settings|translation|coupon|billing|payment|rag|knowledge)\b/i;

const DEFAULT_MODE_RAG_NEGATIVE_PATTERNS = [
  /^(?:hi|hello|hey|yo|sup|hola|ping|test)\b[\s.!?]*$/i,
  /^(?:ok|okay|cool|nice|great|sure|thanks|thank you|thx)\b[\s.!?]*$/i,
  /\bhow are you\b/i,
  /\bwho are you\b/i,
  /\bwhat can you do\b/i,
  /\bgood (?:morning|afternoon|evening|night)\b/i,
] as const;

export function shouldUseDefaultModeRag({
  userText,
  hasDocumentContext,
  hasHiddenPrompt,
}: {
  userText: string;
  hasDocumentContext: boolean;
  hasHiddenPrompt: boolean;
}) {
  if (hasDocumentContext || hasHiddenPrompt) {
    return true;
  }

  const normalized = userText.trim();
  if (!normalized) {
    return false;
  }

  if (DEFAULT_MODE_RAG_POSITIVE_PATTERN.test(normalized)) {
    return true;
  }

  if (DEFAULT_MODE_RAG_NEGATIVE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }

  return false;
}
