import type {
  ImageIntentInput,
  ImageIntentResolution,
} from "@/lib/image-intent";

export const WEB_SEARCH_KIND_VALUES = [
  "general",
  "shopping",
  "news",
  "video",
] as const;

export const WEB_SEARCH_REASON_VALUES = [
  "explicit_search",
  "current_information",
  "shopping_discovery",
  "current_availability",
  "news_update",
  "video_discovery",
  "contextual_followup",
] as const;

export type WebSearchKind = (typeof WEB_SEARCH_KIND_VALUES)[number];
export type WebSearchReason = (typeof WEB_SEARCH_REASON_VALUES)[number];

export type SemanticWebSearchDecision = {
  confidence: "medium" | "high";
  kind: WebSearchKind;
  query: string;
  reason: WebSearchReason;
};

export type ToolIntentDecision = {
  intent:
    | "normal_chat"
    | "image_generate"
    | "image_edit"
    | "web_search"
    | "other_tool";
  webSearch: SemanticWebSearchDecision | null;
};

export type WebSearchIntentResolution = {
  decisionToken: string;
  intent: "web_search";
  webSearch: SemanticWebSearchDecision;
};

export type ChatToolIntentResolution = {
  decisionToken: string;
  intent: "normal_chat" | "other_tool";
};

export type ToolIntentResolution =
  | ImageIntentResolution
  | WebSearchIntentResolution
  | ChatToolIntentResolution;

export type ToolIntentInput = ImageIntentInput;
