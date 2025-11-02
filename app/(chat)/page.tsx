import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { loadChatModels } from "@/lib/ai/models";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { generateUUID } from "@/lib/utils";
import { auth } from "../(auth)/auth";

export default async function Page() {
  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;

  const [session, modelsResult, suggestedPrompts] = await Promise.all([
    auth(),
    loadChatModels(),
    loadSuggestedPrompts(preferredLanguage),
  ]);

  const { defaultModel, models } = modelsResult;

  if (!session) {
    redirect("/login");
  }

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
        <Chat
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
      <Chat
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
