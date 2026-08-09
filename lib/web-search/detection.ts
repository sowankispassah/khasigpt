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

const CURRENT_TIME_PATTERNS: Array<[string, RegExp]> = [
  [
    "current_time",
    /\b(?:what(?:'s| is)|tell\s+me|show\s+me|give\s+me)\s+(?:the\s+)?(?:current\s+|local\s+)?time\b/i,
  ],
  ["current_time", /\bwhat\s+time\s+is\s+it\b/i],
  ["current_time", /\b(?:current|local)\s+time\b/i],
  ["current_time", /\btime\s+(?:now|currently|at\s+the\s+moment)\b/i],
  ["current_time", /\bkatno\s+baje\b/i],
  ["current_time", /\bbaje\s+mynta\b/i],
  ["current_time", /\b(?:ka\s+)?por\s+mynta\b/i],
  ["current_time", /\bmynta\s+(?:ka\s+)?por\b/i],
];

const CURRENT_WEATHER_PATTERNS: Array<[string, RegExp]> = [
  ["current_weather", /\b(?:current\s+)?weather\b/i],
  ["current_weather", /\b(?:current\s+)?temperature\b/i],
  ["current_weather", /\b(?:what(?:'s| is)\s+the\s+)?forecast\b/i],
  ["current_weather", /\b(?:will|is)\s+it\s+(?:rain|raining)\b/i],
  ["current_weather", /\b(?:rain|raining)\s+(?:today|now)\b/i],
  ["current_weather", /\b(?:jinglong\s+ka\s+)?suiñbneng\b/i],
  ["current_weather", /\bka\s+suiñ\b/i],
];

const FUTURE_WEATHER_PATTERN =
  /\b(?:forecast|tomorrow|tonight|next\s+(?:day|week)|this\s+weekend)\b/i;

export type CurrentInfoIntent = "time" | "weather";

export type CurrentInfoDecision = {
  intent: CurrentInfoIntent | null;
  locationQuery: string | null;
  reasons: string[];
};

function extractCurrentInfoLocation(text: string) {
  const match = text.match(/\b(?:in|at|for|near|ha)\s+([^?.!]+?)[?.!]*$/i);
  if (!match?.[1]) {
    return null;
  }

  const location = match[1]
    .replace(/\s+(?:right\s+)?now$/i, "")
    .replace(/\s+(?:mynta|today)$/i, "")
    .trim();
  return location.length > 0 && location.length <= 100 ? location : null;
}

export function detectCurrentInfoNeed(text: string): CurrentInfoDecision {
  const normalized = text.trim();
  if (!normalized) {
    return { intent: null, locationQuery: null, reasons: [] };
  }

  const timeReasons = CURRENT_TIME_PATTERNS.flatMap(([reason, pattern]) =>
    pattern.test(normalized) ? [reason] : []
  );
  const weatherReasons = CURRENT_WEATHER_PATTERNS.flatMap(([reason, pattern]) =>
    pattern.test(normalized) ? [reason] : []
  );
  const reasons = Array.from(new Set([...timeReasons, ...weatherReasons]));
  const intent = timeReasons.length > 0
    ? "time"
    : weatherReasons.length > 0 && !FUTURE_WEATHER_PATTERN.test(normalized)
      ? "weather"
      : null;

  return {
    intent,
    locationQuery: intent ? extractCurrentInfoLocation(normalized) : null,
    reasons,
  };
}

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

const VIDEO_SEARCH_PATTERNS: Array<[string, RegExp]> = [
  [
    "video_search",
    /\b(?:find|show|search|look\s+for|give|send|recommend)\b.{0,100}\b(?:youtube|videos?|tutorials?|walkthroughs?)\b/i,
  ],
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
  hasVideoIntent: boolean;
  currentInfoIntent: CurrentInfoIntent | null;
  currentInfoLocationQuery: string | null;
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
      hasVideoIntent: false,
      currentInfoIntent: null,
      currentInfoLocationQuery: null,
    };
  }

  const currentReasons = CURRENT_INFORMATION_PATTERNS.flatMap(
    ([reason, pattern]) => (pattern.test(normalized) ? [reason] : [])
  );
  const explicitReasons = EXPLICIT_WEB_SEARCH_PATTERNS.flatMap(
    ([reason, pattern]) => (pattern.test(normalized) ? [reason] : [])
  );
  const videoReasons = VIDEO_SEARCH_PATTERNS.flatMap(([reason, pattern]) =>
    pattern.test(normalized) ? [reason] : []
  );
  const currentInfo = detectCurrentInfoNeed(normalized);
  const reasons = Array.from(
    new Set([
      ...currentReasons,
      ...explicitReasons,
      ...videoReasons,
      ...currentInfo.reasons,
    ])
  );
  const hasCustomKnowledgeIntent = CUSTOM_KNOWLEDGE_PATTERNS.some((pattern) =>
    pattern.test(normalized)
  );
  const hasExplicitWebIntent = explicitReasons.length > 0;
  const hasVideoIntent = videoReasons.length > 0;
  const hasCurrentIntent = currentReasons.length > 0 || hasExplicitWebIntent;
  const shouldUseWebSearch =
    hasExplicitWebIntent ||
    hasVideoIntent ||
    (hasCurrentIntent && currentInfo.intent === null) ||
    (currentInfo.reasons.length > 0 && currentInfo.intent === null);

  return {
    shouldSearch: shouldUseWebSearch,
    reasons,
    hasCurrentIntent,
    hasCustomKnowledgeIntent,
    hasExplicitWebIntent,
    hasVideoIntent,
    currentInfoIntent: currentInfo.intent,
    currentInfoLocationQuery: currentInfo.locationQuery,
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
