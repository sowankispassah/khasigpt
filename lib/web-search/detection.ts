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
];

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
};

export function detectWebSearchNeed(text: string): WebSearchDecision {
  const normalized = text.trim();
  if (!normalized) {
    return {
      shouldSearch: false,
      reasons: [],
      hasCurrentIntent: false,
      hasCustomKnowledgeIntent: false,
    };
  }

  const reasons = CURRENT_INFORMATION_PATTERNS.flatMap(([reason, pattern]) =>
    pattern.test(normalized) ? [reason] : []
  );
  const hasCustomKnowledgeIntent = CUSTOM_KNOWLEDGE_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );
  const hasCurrentIntent = reasons.length > 0;

  return {
    shouldSearch: hasCurrentIntent,
    reasons,
    hasCurrentIntent,
    hasCustomKnowledgeIntent,
  };
}

export function getWebSearchDecisionReason(decision: WebSearchDecision) {
  if (decision.reasons.length === 0) {
    return "no_current_information_signal";
  }
  return decision.reasons.slice(0, 4).join(",");
}
