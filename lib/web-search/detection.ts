const CURRENT_INFORMATION_PATTERNS: Array<[string, RegExp]> = [
  ["latest", /\blatest\b/i],
  ["current", /\bcurrent(?:ly)?\b/i],
  ["today", /\btoday(?:'s|s)?\b/i],
  ["now", /\bnow\b/i],
  ["recent", /\brecent(?:ly)?\b/i],
  ["this_week", /\bthis\s+week\b/i],
  ["this_month", /\bthis\s+month\b/i],
  ["news", /\bnews\b|\bbreaking\b/i],
  ["price", /\bprices?\b|\bcosts?\b|\bexchange\s+rate\b/i],
  ["schedule", /\bschedule\b|\bstandings?\b|\bscore\b/i],
  ["release", /\brelease\s+date\b|\bnew\s+update\b|\bnew\s+release\b/i],
  ["availability", /\bcurrently\s+available\b|\bavailable\s+now\b/i],
  ["person_lookup", /\bwho\s+is\b|\bwho['’]s\b/i],
];

const EXPLICIT_WEB_SEARCH_PATTERNS: Array<[string, RegExp]> = [
  [
    "explicit_web_search",
    /\b(?:browse|search)\s+(?:the\s+)?(?:web|net|internet|online)\b/i,
  ],
  [
    "explicit_web_search",
    /\b(?:search|find)\s+(?:for\s+)?(?:this|that|it|information|details?)\s+(?:online|on\s+(?:the\s+)?(?:web|internet|net))\b/i,
  ],
  [
    "explicit_web_search",
    /\b(?:search|find)\s+(?:for|about)\b/i,
  ],
  [
    "explicit_web_search",
    /\b(?:look|check)\s+(?:it|this|that)\s+up(?:\s+online)?\b/i,
  ],
  ["explicit_web_search", /\bgoogle\s+(?:it|this|that|for)\b/i],
  ["explicit_web_search", /\buse\s+(?:google|web\s+search|the\s+internet)\b/i],
];

const BARE_WEB_SEARCH_REQUEST_PATTERN =
  /^(?:please\s+)?(?:(?:browse|search)(?:\s+(?:the\s+)?(?:web|net|internet)|\s+online)|(?:look|check)\s+(?:it|this|that)\s+up(?:\s+online)?|google\s+(?:it|this|that))[\s.!?]*$/i;

const CUSTOM_KNOWLEDGE_PATTERNS: RegExp[] = [
  /\bkhasi\s*gpt\b/i,
  /\bkhasigpt\b/i,
  /\bthe\s+app\b/i,
  /\bour\s+(?:app|plan|service)\b/i,
  /\bfree\s+(?:daily\s+)?(?:chat|message)\s+limit\b/i,
  /\b(?:chat|message|credit|subscription|pricing)\s+limit\b/i,
  /\bpersonal\s+knowledge\b/i,
  /\b(?:rag|study\s+mode|jobs\s+mode|admin\s+settings?)\b/i,
];

export type WebSearchDecision = {
  shouldSearch: boolean;
  reasons: string[];
  hasCurrentIntent: boolean;
  hasCustomKnowledgeIntent: boolean;
  hasExplicitWebIntent: boolean;
};

export function detectWebSearchNeed(text: string): WebSearchDecision {
  const normalized = text.trim();
  if (!normalized) {
    return {
      shouldSearch: false,
      reasons: [],
      hasCurrentIntent: false,
      hasCustomKnowledgeIntent: false,
      hasExplicitWebIntent: false,
    };
  }

  const currentReasons = CURRENT_INFORMATION_PATTERNS.flatMap(
    ([reason, pattern]) => (pattern.test(normalized) ? [reason] : [])
  );
  const explicitReasons = EXPLICIT_WEB_SEARCH_PATTERNS.flatMap(
    ([reason, pattern]) => (pattern.test(normalized) ? [reason] : [])
  );
  const reasons = Array.from(new Set([...currentReasons, ...explicitReasons]));
  const hasCustomKnowledgeIntent = CUSTOM_KNOWLEDGE_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );
  const hasExplicitWebIntent = explicitReasons.length > 0;
  const hasCurrentIntent = currentReasons.length > 0 || hasExplicitWebIntent;

  return {
    shouldSearch: hasCurrentIntent,
    reasons,
    hasCurrentIntent,
    hasCustomKnowledgeIntent,
    hasExplicitWebIntent,
  };
}

export function resolveWebSearchQuery({
  currentText,
  previousUserMessages = [],
}: {
  currentText: string;
  previousUserMessages?: string[];
}) {
  const normalized = currentText.trim();
  if (!BARE_WEB_SEARCH_REQUEST_PATTERN.test(normalized)) {
    return normalized;
  }

  for (let index = previousUserMessages.length - 1; index >= 0; index -= 1) {
    const previousMessage = previousUserMessages[index]?.trim();
    if (
      previousMessage &&
      !BARE_WEB_SEARCH_REQUEST_PATTERN.test(previousMessage)
    ) {
      return previousMessage;
    }
  }

  return normalized;
}

export function getWebSearchDecisionReason(decision: WebSearchDecision) {
  if (decision.reasons.length === 0) {
    return "no_current_information_signal";
  }
  return decision.reasons.slice(0, 4).join(",");
}
