import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/app/(auth)/auth";
import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { DataStreamProvider } from "@/components/data-stream-provider";
import { ModelConfigProvider } from "@/components/model-config-provider";
import { getImageGenerationAccess } from "@/lib/ai/image-generation";
import { loadChatModels } from "@/lib/ai/models";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { generateUUID } from "@/lib/utils";

export default async function Page() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const session = await auth();
  if (!session) {
    redirect("/login?callbackUrl=/");
  }

  const [
    modelsResult,
    suggestedPrompts,
    customKnowledgeSetting,
    imageGenerationAccess,
  ] = await Promise.all([
    loadChatModels(),
    loadSuggestedPrompts(preferredLanguage),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
    getImageGenerationAccess({
      userId: session.user.id,
      userRole: session.user.role,
    }),
  ]);

  const { defaultModel, models } = modelsResult;

  const id = generateUUID();

  const modelIdFromCookie = cookieStore.get("chat-model");
  const cookieModelValue =
    typeof modelIdFromCookie?.value === "string" ? modelIdFromCookie.value : "";
  const resolvedCookieModelId =
    cookieModelValue &&
    (models.some((model) => model.id === cookieModelValue)
      ? cookieModelValue
      : models.find((model) => model.key === cookieModelValue)?.id ??
        models.find((model) => model.providerModelId === cookieModelValue)?.id ??
        "");
  const fallbackModelId =
    resolvedCookieModelId || defaultModel?.id || models[0]?.id || "";

  const customKnowledgeEnabled =
    typeof customKnowledgeSetting === "boolean"
      ? customKnowledgeSetting
      : typeof customKnowledgeSetting === "string"
        ? customKnowledgeSetting.toLowerCase() === "true"
        : false;

  if (!modelIdFromCookie) {
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
        <DataStreamProvider>
          <ChatLoader
            autoResume={false}
            customKnowledgeEnabled={customKnowledgeEnabled}
            id={id}
            imageGeneration={{
              enabled: imageGenerationAccess.enabled,
              canGenerate: imageGenerationAccess.canGenerate,
              requiresPaidCredits:
                imageGenerationAccess.requiresPaidCredits ?? false,
            }}
            initialChatModel={fallbackModelId}
            initialMessages={[]}
            initialHasMoreHistory={false}
            initialOldestMessageAt={null}
            initialVisibilityType="private"
            isReadonly={false}
            key={id}
            suggestedPrompts={suggestedPrompts}
          />
          <DataStreamHandler />
        </DataStreamProvider>
      </ModelConfigProvider>
    );
  }

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
      <DataStreamProvider>
        <ChatLoader
          autoResume={false}
          customKnowledgeEnabled={customKnowledgeEnabled}
          id={id}
          imageGeneration={{
            enabled: imageGenerationAccess.enabled,
            canGenerate: imageGenerationAccess.canGenerate,
            requiresPaidCredits: imageGenerationAccess.requiresPaidCredits ?? false,
          }}
          initialChatModel={fallbackModelId}
          initialMessages={[]}
          initialHasMoreHistory={false}
          initialOldestMessageAt={null}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
          suggestedPrompts={suggestedPrompts}
        />
        <DataStreamHandler />
      </DataStreamProvider>
    </ModelConfigProvider>
  );
}
