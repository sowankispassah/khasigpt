export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: "regular" | "creator" | "admin";
  dateOfBirth?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  imageVersion?: string | null;
  allowPersonalKnowledge?: boolean;
};

export type SessionPayload = {
  user: SessionUser;
  expires?: string;
} | null;

export type LanguageOption = {
  id?: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  syncUiLanguage?: boolean;
};

export type ModelSummary = {
  id: string;
  name: string;
  description: string;
  supportsReasoning: boolean;
};

export type IconPromptSuggestion = {
  label: string;
  prompt: string;
  isEditable: boolean;
};

export type IconPromptAction = {
  id: string;
  label: string;
  prompt: string;
  iconUrl: string | null;
  behavior: "append" | "replace";
  selectImageMode: boolean;
  showSuggestions: boolean;
  suggestions: IconPromptSuggestion[];
};

export type PricingPlan = {
  id: string;
  name: string;
  description: string | null;
  priceInPaise: number;
  tokenAllowance: number;
  billingCycleDays: number;
  isActive: boolean;
};

export type BalanceSummary = {
  tokensRemaining: number;
  tokensTotal: number;
  creditsRemaining: number;
  creditsTotal: number;
  allocatedCredits: number;
  rechargedCredits: number;
  expiresAt: string | null;
  startedAt: string | null;
  plan: {
    id: string;
    name: string;
    priceInPaise: number;
    billingCycleDays: number;
  } | null;
};

export type BootstrapPayload = {
  session: SessionPayload;
  i18n: {
    activeLanguage: LanguageOption;
    languages: LanguageOption[];
    dictionary: Record<string, string>;
  };
  featureAccess: {
    calculator: boolean;
    customKnowledge: boolean;
    documentUploads: boolean;
    forum: boolean;
    jobs: boolean;
    study: boolean;
    translate: boolean;
  };
  modelConfig: {
    defaultModelId: string | null;
    models: ModelSummary[];
  };
  chat: {
    languages: LanguageOption[];
    suggestedPrompts: string[];
    iconPromptActions: IconPromptAction[];
    imageGeneration: {
      enabled: boolean;
      canGenerate: boolean;
      requiresPaidCredits: boolean;
    };
  };
  translate: {
    providerMode: string;
    languages: Array<{
      code: string;
      isDefault: boolean;
      modelDisplayName: string | null;
      modelProvider: string | null;
      modelProviderModelId: string | null;
      name: string;
    }>;
  };
  billing: {
    recommendedPlanId: string | null;
    balance: BalanceSummary | null;
    plans: PricingPlan[];
  };
};

export type ChatHistoryItem = {
  id: string;
  mode?: "default" | "study" | "jobs";
  title: string;
  createdAt: string;
  updatedAt?: string;
  visibility?: "public" | "private";
};

export type ChatHistoryResponse = {
  chats: ChatHistoryItem[];
  hasMore: boolean;
};

export type JobChatCard = {
  id: string;
  title: string;
  company: string;
  location: string;
  salary?: string | null;
  source?: string | null;
  applicationLink?: string | null;
  employmentType: string;
  studyExam?: string;
  studyRole?: string;
  studyYears?: number[];
  studyTags?: string[];
  tags?: string[];
  sourceUrl?: string | null;
  pdfSourceUrl?: string | null;
  pdfCachedUrl?: string | null;
};

export type ChatMessagePart =
  | { type: "text"; text: string }
  | { type: "data-jobCards"; data?: { jobs?: JobChatCard[] } }
  | {
      type: "data-jobTitleReference";
      data?: {
        title?: string;
        preview?: string;
      };
    }
  | { type: string; [key: string]: unknown };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  parts?: ChatMessagePart[];
  content?: string;
  createdAt?: string;
};

export type JobListItem = {
  id: string;
  title: string;
  company: string;
  location: string;
  employmentType: string;
  salaryLabel: string;
  notificationDateLabel: string;
  fetchedOnLabel: string;
  sourceLabel: string;
  descriptionSnippet: string;
  hasPdfFile: boolean;
  sourceUrl?: string | null;
};

export type JobDetailsPayload = {
  id: string;
  title: string;
  company: string;
  companyLocationLabel: string;
  location: string;
  employmentType: string;
  salaryLabel: string;
  notificationDateLabel: string;
  fetchedOnLabel: string;
  sourceLabel: string;
  sourceUrl: string | null;
  pdfUrl: string | null;
  pdfPreviewImageUrl: string | null;
};

export type ForumCategory = {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
};

export type ForumThread = {
  id: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  postCount?: number;
  viewCount?: number;
  createdAt?: string;
};
