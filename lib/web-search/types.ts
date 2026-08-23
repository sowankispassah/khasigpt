export type WebSearchProvider =
  | "gemini_grounding"
  | "openai_web_search"
  | "disabled";

export type WebSearchPlatform = "web" | "native";

export type WebSearchStatus =
  | "searching"
  | "reading"
  | "generating"
  | "completed"
  | "failed";

export type WebSearchStatusData = {
  status: WebSearchStatus;
  usedWebSearch: boolean;
};

export type WebSearchSource = {
  title: string;
  url: string;
  domain?: string | null;
};

export type WebSearchVideo = {
  title: string;
  url: string;
  videoId: string;
  thumbnailUrl: string;
  domain: string;
};

export type WebSearchCitation = {
  text: string;
  sourceIndexes: number[];
  startIndex?: number;
  endIndex?: number;
};

export type WebSearchUsageMetadata = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type WebSearchAnswer = {
  answer: string;
  provider: WebSearchProvider;
  grounded: boolean;
  sources: WebSearchSource[];
  videos: WebSearchVideo[];
  searchQueries: string[];
  citations: WebSearchCitation[];
  searchCallCount: number;
  usage: WebSearchUsageMetadata;
};

export type WebSearchConfig = {
  accessMode: "disabled" | "admin_only" | "enabled";
  provider: WebSearchProvider;
  fallbackProvider: WebSearchProvider;
  enabledWeb: boolean;
  enabledNative: boolean;
  freeUsersEnabled: boolean;
  paidUsersEnabled: boolean;
  maxCalls: number;
  creditMultiplier: number;
  dailyLimit: number;
  readState: "confirmed" | "fallback";
};
