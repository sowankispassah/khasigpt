const SOCIAL_ONLY_QUERY =
  /^(?:hi|hello|hey|howdy|thanks|thank you|bye|good morning|good evening|khublei|khublei shibun)[.!?\s]*$/i;

export function shouldSkipRagQuery(query: string): boolean {
  const normalized = query.trim();
  return normalized.length < 3 || SOCIAL_ONLY_QUERY.test(normalized);
}
