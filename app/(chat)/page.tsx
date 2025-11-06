import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { loadChatModels } from "@/lib/ai/models";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { generateUUID } from "@/lib/utils";
import { loadRootContext } from "../root-context";

export default async function Page() {
  const { session, preferredLanguage, activeLanguage, languages } =
    await loadRootContext();

  if (!session) {
    redirect("/login");
  }

  const cookieStore = cookies();

  const [modelsResult, suggestedPrompts] = await Promise.all([
    loadChatModels(),
    loadSuggestedPrompts({
      preferredLanguageCode: preferredLanguage,
      activeLanguage,
      languages,
    }),
  ]);

  const { defaultModel, models } = modelsResult;

  const id = generateUUID();

  const modelIdFromCookie = cookieStore.get("chat-model");
  const fallbackModelId =
    modelIdFromCookie?.value ?? defaultModel?.id ?? models[0]?.id ?? "";

  if (!modelIdFromCookie) {
    return (
      <>
        <ChatLoader
          autoResume={false}
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
