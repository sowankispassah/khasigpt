import type { ModelSummary } from "@/components/model-config-provider";
import type { VisibilityType } from "@/components/visibility-selector";
import type { LanguageOption } from "@/lib/i18n/languages";
import type { IconPromptAction } from "@/lib/icon-prompts";
import type { JobCard, JobListItem } from "@/lib/jobs/types";
import type { ChatMessage } from "@/lib/types";

export type ChatPageLoaderPayload = {
  id: string;
  initialMessages: ChatMessage[];
  initialHasMoreHistory: boolean;
  initialOldestMessageAt: string | null;
  initialChatModel: string;
  initialChatLanguage: string;
  initialJobContext?: JobCard | null;
  jobsListItems?: JobListItem[];
  initialVisibilityType: VisibilityType;
  chatMode: "default" | "study" | "jobs";
  languageSettings?: LanguageOption[];
  isReadonly: boolean;
  autoResume: boolean;
  suggestedPrompts: string[];
  iconPromptActions?: IconPromptAction[];
  imageGeneration: {
    enabled: boolean;
    canGenerate: boolean;
    requiresPaidCredits: boolean;
  };
  documentUploadsEnabled: boolean;
  customKnowledgeEnabled: boolean;
};

export type ChatPageModelConfigPayload = {
  defaultModelId: string | null;
  models: ModelSummary[];
};

export type CachedChatPagePayload = {
  chatId: string;
  modelConfig: ChatPageModelConfigPayload;
  chatLoader: ChatPageLoaderPayload;
};
