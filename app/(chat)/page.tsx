import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { loadChatModels } from "@/lib/ai/models";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";
import { getAppSetting } from "@/lib/db/queries";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { generateUUID } from "@/lib/utils";
import { auth } from "../(auth)/auth";

export default async function Page() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const session = await auth();
  if (!session) {
    redirect("/login");
  }

  const [modelsResult, suggestedPrompts, customKnowledgeSetting] =
    await Promise.all([
      loadChatModels(),
      loadSuggestedPrompts(preferredLanguage),
      getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
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
      <>
        <ChatLoader
          autoResume={false}
          customKnowledgeEnabled={customKnowledgeEnabled}
          id={id}
          initialChatModel={fallbackModelId}
          initialMessages={[]}
          initialVisibilityType="private"
          isReadonly={false}
          key={id}
          suggestedPrompts={suggestedPrompts}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      <ChatLoader
        autoResume={false}
        customKnowledgeEnabled={customKnowledgeEnabled}
        id={id}
        initialChatModel={fallbackModelId}
        initialMessages={[]}
        initialVisibilityType="private"
        isReadonly={false}
        key={id}
        suggestedPrompts={suggestedPrompts}
      />
      <DataStreamHandler />
    </>
  );
}
