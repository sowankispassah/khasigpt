import { cookies } from "next/headers";
import { ModelConfigProvider } from "@/components/model-config-provider";
import type { VisibilityType } from "@/components/visibility-selector";
import { loadChatModels } from "@/lib/ai/models";
import { DOCUMENT_UPLOADS_FEATURE_FLAG_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import {
  isFeatureEnabledForRole,
  type FeatureAccessRole,
} from "@/lib/feature-access";
import type { JobCard } from "@/lib/jobs/types";
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
  const [{ defaultModel, models }, documentUploadsSetting] = await Promise.all([
    loadChatModels().catch(() => ({
      defaultModel: null,
      models: [],
    })),
    getAppSetting<string | boolean>(DOCUMENT_UPLOADS_FEATURE_FLAG_KEY).catch(
      () => null
    ),
  ]);

  const cookieModelValue = cookieStore.get("chat-model")?.value ?? "";
  const resolvedCookieModelId =
    cookieModelValue &&
    (models.some((model) => model.id === cookieModelValue)
      ? cookieModelValue
      : models.find((model) => model.key === cookieModelValue)?.id ??
        models.find((model) => model.providerModelId === cookieModelValue)?.id ??
        "");
  const fallbackModelId =
    resolvedCookieModelId || cookieModelValue || defaultModel?.id || models[0]?.id || "default";
  const initialChatLanguage =
    cookieStore.get("chat-language")?.value ?? preferredLanguage ?? "";
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
