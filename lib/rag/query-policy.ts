const SOCIAL_ONLY_QUERY =
  /^(?:hi|hello|hey|howdy|thanks|thank you|bye|good morning|good evening|khublei|khublei shibun)[.!?\s]*$/i;
const CONVERSATIONAL_CONTROL_QUERY =
  /^(?:please\s+)?(?:stop(?:\s+(?:here|now))?|wait(?:\s+(?:here|a\s+second|a\s+moment))?|hold\s+on|cancel(?:\s+that)?|never\s+mind|nevermind|that(?:'s|\s+is)\s+all|no\s+thanks|okay|ok|alright|got\s+it|understood|go\s+ahead|continue)[.!?,\s]*$/i;
const CONTEXTUAL_FOLLOWUP_QUERY =
  /^(?:(?:location|place|city|country|date|day|time|temperature|weather|source|name|details?|what|where|when|which|who|why|how|jaka|shano)|which\s+(?:location|place|city|country|one)(?:\s+(?:was|is)\s+(?:that|it))?|what\s+(?:location|place|city|country)(?:\s+(?:was|is)\s+(?:that|it))?|where\s+exactly|when\s+exactly|who\s+exactly|what\s+exactly|what\s+about\s+(?:that|it)|and\s+(?:where|when|which)|kaei\s+ka\s+jaka)[?!.\s]*$/i;
const CONTEXTUAL_REFERENCE_WORD =
  /\b(?:this|that|it|its|one|ones|those|these|there|above|previous|kane|kata|katu|kine|kito|une|uta|uto|tei)\b/i;
const CONTEXTUAL_QUESTION_OR_FIELD_WORD =
  /\b(?:what|which|where|when|who|why|how|number|name|source|location|place|city|country|date|day|time|temperature|weather|song|hymn|details?|kaei|kino|mano|uei|shano|hangno|mynno|kumno|balei|katno|nombar|jaka|kyrteng|por|tarik|jingrwai)\b/i;
const EXPLICIT_REFERENTIAL_FACT_QUERY =
  /\b(?:who\s+(?:founded|created|developed|made)|founder|creator|developer|nongseng|nongthaw)\b/i;

function isShortReferentialFollowup(query: string): boolean {
  const words = query
    .replace(/[?!.,;:()[\]{}"']/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  return (
    words.length > 0 &&
    words.length <= 14 &&
    CONTEXTUAL_REFERENCE_WORD.test(query) &&
    CONTEXTUAL_QUESTION_OR_FIELD_WORD.test(query) &&
    !EXPLICIT_REFERENTIAL_FACT_QUERY.test(query)
  );
}

export function isContextualFollowupQuery(query: string): boolean {
  const normalized = query.trim();
  return (
    CONTEXTUAL_FOLLOWUP_QUERY.test(normalized) ||
    isShortReferentialFollowup(normalized)
  );
}

export function shouldSkipRagQuery(query: string): boolean {
  const normalized = query.trim();
  return (
    normalized.length < 3 ||
    SOCIAL_ONLY_QUERY.test(normalized) ||
    CONVERSATIONAL_CONTROL_QUERY.test(normalized) ||
    isContextualFollowupQuery(normalized)
  );
}
