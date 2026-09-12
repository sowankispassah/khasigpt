import type { LanguageModelUsage } from "ai";
import type { UsageData } from "tokenlens/helpers";

export type ChatUiContext = {
  jobPostingId?: string | null;
  studyPaperId?: string | null;
};

// Server-merged usage: base usage + TokenLens summary + optional modelId
export type AppUsage = LanguageModelUsage &
  UsageData & {
    modelId?: string;
    uiContext?: ChatUiContext;
    originUiContext?: ChatUiContext;
    costINR?: {
      inputINR: number;
      outputINR: number;
      reasoningINR: number;
      cacheReadINR: number;
      totalINR: number;
    };
    conversionRateINR?: number;
  };
