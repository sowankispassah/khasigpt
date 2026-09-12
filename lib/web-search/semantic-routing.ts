import type { ToolIntentDecision } from "@/lib/tool-intent";
import type { WebSearchDecision } from "@/lib/web-search/detection";

export function mergeSemanticWebSearchDecision({
  deterministicDecision,
  semanticDecision,
}: {
  deterministicDecision: WebSearchDecision;
  semanticDecision: ToolIntentDecision | null;
}): WebSearchDecision {
  if (!semanticDecision) {
    return deterministicDecision;
  }

  if (semanticDecision.intent !== "web_search" || !semanticDecision.webSearch) {
    return {
      ...deterministicDecision,
      shouldSearch: false,
      reasons: [],
      hasCurrentIntent: false,
      hasExplicitWebIntent: false,
      hasVideoIntent: false,
      hasShoppingIntent: false,
    };
  }

  const webSearch = semanticDecision.webSearch;

  return {
    ...deterministicDecision,
    shouldSearch: true,
    reasons: [webSearch.reason],
    hasCurrentIntent: true,
    hasExplicitWebIntent:
      deterministicDecision.hasExplicitWebIntent ||
      webSearch.reason === "explicit_search",
    hasVideoIntent: webSearch.kind === "video",
    hasShoppingIntent: webSearch.kind === "shopping",
  };
}
