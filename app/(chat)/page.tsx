import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { ChatLoader } from "@/components/chat-loader";
import { loadChatModels } from "@/lib/ai/models";
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

  const [modelsResult, suggestedPrompts] = await Promise.all([
    loadChatModels(),
    loadSuggestedPrompts(preferredLanguage),
  ]);

  const { defaultModel, models } = modelsResult;

  const id = generateUUID();

  const modelIdFromCookie = cookieStore.get("chat-model");
  const fallbackModelId =
    modelIdFromCookie?.value ??
    defaultModel?.id ??
    models[0]?.id ??
    "";

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
          suggestedPrompts={suggestedPrompts}
          key={id}
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
        suggestedPrompts={suggestedPrompts}
        key={id}
      />
      <DataStreamHandler />
    </>
  );
}
