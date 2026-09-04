export type WebSearchProvider =
  | "gemini_grounding"
  | "openai_web_search"
  | "serper"
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
  context?: "web" | "news";
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

export type WebSearchProduct = {
  kind?: "product" | "collection";
  title: string;
  url: string;
  merchant: string;
  price: string;
  imageUrl?: string | null;
  rating?: number | null;
  reviewCount?: string | null;
  availability?: string | null;
  imageProxyToken?: string | null;
  verified?: boolean;
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
  products: WebSearchProduct[];
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
  markupMultiplier: number;
  providerCostPerCallUsd: Record<
    Exclude<WebSearchProvider, "disabled">,
    number
  >;
  readState: "confirmed" | "fallback";
};
