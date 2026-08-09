const SOCIAL_ONLY_QUERY =
  /^(?:hi|hello|hey|howdy|thanks|thank you|bye|good morning|good evening|khublei|khublei shibun)[.!?\s]*$/i;
const CONVERSATIONAL_CONTROL_QUERY =
  /^(?:please\s+)?(?:stop(?:\s+(?:here|now))?|wait(?:\s+(?:here|a\s+second|a\s+moment))?|hold\s+on|cancel(?:\s+that)?|never\s+mind|nevermind|that(?:'s|\s+is)\s+all|no\s+thanks|okay|ok|alright|got\s+it|understood|go\s+ahead|continue)[.!?,\s]*$/i;
const CONTEXTUAL_FOLLOWUP_QUERY =
  /^(?:which\s+(?:location|place|city|country|one)|what\s+(?:location|place|city|country)|which\s+one|what\s+about\s+(?:that|it)|and\s+(?:where|when|which))[?!.\s]*$/i;

export function shouldSkipRagQuery(query: string): boolean {
  const normalized = query.trim();
  return (
    normalized.length < 3 ||
    SOCIAL_ONLY_QUERY.test(normalized) ||
    CONVERSATIONAL_CONTROL_QUERY.test(normalized) ||
    CONTEXTUAL_FOLLOWUP_QUERY.test(normalized)
  );
}
