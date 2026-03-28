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

export function normalizeDefaultModeRagMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripDefaultModeRagQueryLead(value: string) {
  return value.replace(
    /^(?:who is|what is|tell me about|tell me who is|can you tell me about|do you know|please tell me about)\s+/i,
    ""
  );
}

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

export function isStrongDefaultModeRagTitleMatch({
  userText,
  entryTitle,
}: {
  userText: string;
  entryTitle: string;
}) {
  const normalizedQuery = normalizeDefaultModeRagMatchText(userText);
  const normalizedTitle = normalizeDefaultModeRagMatchText(entryTitle);
  const normalizedQueryCore = normalizeDefaultModeRagMatchText(
    stripDefaultModeRagQueryLead(userText)
  );
  const normalizedTitleCore = normalizeDefaultModeRagMatchText(
    stripDefaultModeRagQueryLead(entryTitle)
  );

  if (!normalizedQuery || !normalizedTitle) {
    return false;
  }

  if (
    normalizedQuery === normalizedTitle ||
    normalizedQuery.includes(normalizedTitle) ||
    normalizedTitle.includes(normalizedQuery) ||
    (normalizedQueryCore.length > 0 &&
      (normalizedQueryCore === normalizedTitle ||
        normalizedTitle.includes(normalizedQueryCore) ||
        normalizedQueryCore.includes(normalizedTitle))) ||
    (normalizedQueryCore.length > 0 &&
      normalizedTitleCore.length > 0 &&
      (normalizedQueryCore === normalizedTitleCore ||
        normalizedTitleCore.includes(normalizedQueryCore) ||
        normalizedQueryCore.includes(normalizedTitleCore)))
  ) {
    return true;
  }

  const queryTokens = new Set(
    (normalizedQueryCore || normalizedQuery).split(" ").filter(Boolean)
  );
  const titleTokens = (normalizedTitleCore || normalizedTitle)
    .split(" ")
    .filter(Boolean);
  if (!queryTokens.size || titleTokens.length === 0) {
    return false;
  }

  const overlapCount = titleTokens.filter((token) => queryTokens.has(token)).length;
  return overlapCount >= 2 && overlapCount / titleTokens.length >= 0.6;
}
