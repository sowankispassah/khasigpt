export type WebSearchProvider =
  | "gemini_grounding"
  | "openai_web_search"
  | "disabled";

export type WebSearchPlatform = "web" | "native";

export type WebSearchSource = {
  title: string;
  url: string;
  domain?: string | null;
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
  searchQueries: string[];
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
