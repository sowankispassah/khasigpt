import { cookies } from "next/headers";
import { ModelConfigProvider } from "@/components/model-config-provider";
import type { VisibilityType } from "@/components/visibility-selector";
import { loadChatModels } from "@/lib/ai/models";
import { DOCUMENT_UPLOADS_FEATURE_FLAG_KEY } from "@/lib/constants";
import {
  type FeatureAccessRole,
  isFeatureEnabledForRole,
} from "@/lib/feature-access";
import type { JobCard } from "@/lib/jobs/types";
import {
  getFeatureAccessModeSettingValue,
  loadFeatureAccessSettingsByKeys,
} from "@/lib/settings/feature-access-settings";
import type { ChatMessage } from "@/lib/types";
import { parseDocumentUploadsAccessModeSetting } from "@/lib/uploads/document-uploads";
import { JobDetailsChatPanel } from "./job-details-chat-panel";

type JobDetailsChatShellProps = {
  chatId?: string | null;
  defaultOpen?: boolean;
  jobContext: JobCard;
  initialHasMoreHistory?: boolean;
  initialMessages?: ChatMessage[];
  initialOldestMessageAt?: string | null;
  initialVisibilityType?: VisibilityType;
  isReadonly?: boolean;
  userRole: FeatureAccessRole;
};

const JOB_CHAT_FEATURE_ACCESS_TIMEOUT_MS = 2_000;

export async function JobDetailsChatShell({
  chatId = null,
  defaultOpen = false,
  jobContext,
  initialHasMoreHistory = false,
  initialMessages = [],
  initialOldestMessageAt = null,
  initialVisibilityType = "private",
  isReadonly = false,
  userRole,
}: JobDetailsChatShellProps) {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [{ defaultModel, models }, featureAccessSettings] = await Promise.all([
    loadChatModels().catch(() => ({
      defaultModel: null,
      models: [],
    })),
    loadFeatureAccessSettingsByKeys([DOCUMENT_UPLOADS_FEATURE_FLAG_KEY], {
      source: "jobs.details.chat-shell.feature-access",
      timeoutMs: JOB_CHAT_FEATURE_ACCESS_TIMEOUT_MS,
    }),
  ]);

  const fallbackModelId = defaultModel?.id || models[0]?.id || "default";
  const initialChatLanguage =
    cookieStore.get("chat-language")?.value ?? preferredLanguage ?? "";
  const documentUploadsSetting =
    getFeatureAccessModeSettingValue(
      featureAccessSettings,
      DOCUMENT_UPLOADS_FEATURE_FLAG_KEY
    );
  const documentUploadsMode = parseDocumentUploadsAccessModeSetting(
    documentUploadsSetting
  );
  const documentUploadsEnabled = isFeatureEnabledForRole(
    documentUploadsMode,
    userRole
  );

  return (
    <ModelConfigProvider
      defaultModelId={defaultModel?.id ?? null}
      models={models.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description,
        supportsReasoning: model.supportsReasoning,
      }))}
    >
      <JobDetailsChatPanel
        chatId={chatId}
        defaultOpen={defaultOpen}
        documentUploadsEnabled={documentUploadsEnabled}
        initialHasMoreHistory={initialHasMoreHistory}
        initialChatLanguage={initialChatLanguage}
        initialChatModel={fallbackModelId}
        initialMessages={initialMessages}
        initialOldestMessageAt={initialOldestMessageAt}
        initialVisibilityType={initialVisibilityType}
        isReadonly={isReadonly}
        jobContext={jobContext}
      />
    </ModelConfigProvider>
  );
}
