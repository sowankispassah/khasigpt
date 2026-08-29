import type { UIMessage } from "ai";
import { z } from "zod";
import type { ArtifactKind } from "@/components/artifact";
import type { JobCard, JobTitleReference } from "@/lib/jobs/types";
import type { StudyPaperCard, StudyQuestionReference } from "@/lib/study/types";
import type { Suggestion } from "./db/schema";
import type { AppUsage } from "./usage";
import type {
  WebSearchCitation,
  WebSearchProduct,
  WebSearchSource,
  WebSearchStatusData,
  WebSearchVideo,
} from "./web-search/types";

export type DataPart = { type: "append-message"; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

export type ChatTools = Record<string, never>;

export type CustomUIDataTypes = {
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  usage: AppUsage;
  ragUsage: {
    chatId: string;
    modelId: string;
    modelName: string;
    entries: Array<{
      id: string;
      title: string;
      status: string;
      tags: string[];
      score: number;
      sourceUrl: string | null;
    }>;
  };
  studyCards: {
    papers: StudyPaperCard[];
  };
  studyAssistChips: {
    question: string;
    chips: string[];
  };
  studyQuestionReference: StudyQuestionReference;
  jobTitleReference: JobTitleReference;
  jobCards: {
    jobs: JobCard[];
  };
  newsInitial: {
    hidden: true;
  };
  webSources: {
    sources: WebSearchSource[];
    searchQueries?: string[];
    citations?: WebSearchCitation[];
    videos?: WebSearchVideo[];
    products?: WebSearchProduct[];
  };
  webSearchStatus: WebSearchStatusData;
  imageGeneration: {
    status: "pending" | "completed" | "failed" | "cancelled";
    prompt: string;
    message: string;
    reason?: "safety" | "generation" | "cancelled";
    updatedAt: string;
  };
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export type Attachment = {
  name: string;
  url: string;
  contentType: string;
};

export type SerializedBalanceSummary = {
  tokensRemaining: number;
  tokensTotal: number;
  creditsRemaining: number;
  creditsTotal: number;
  expiresAt: string | null;
  startedAt: string | null;
  plan?: {
    id: string;
    name: string;
    priceInPaise: number;
    billingCycleDays: number;
  } | null;
};
