import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { loadChatModels } from "@/lib/ai/models";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { getAppSetting, getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { getTranslationBundle } from "@/lib/i18n/dictionary";
import { convertToUIMessages } from "@/lib/utils";
import { CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY } from "@/lib/constants";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id, includeDeleted: true });

  if (!chat) {
    notFound();
  }

  const cookieStore = await cookies();
  const preferredLanguage = cookieStore.get("lang")?.value ?? null;
  const [
    session,
    modelsResult,
    suggestedPrompts,
    translationBundle,
    customKnowledgeSetting,
  ] = await Promise.all([
    auth(),
    loadChatModels(),
    loadSuggestedPrompts(preferredLanguage),
    getTranslationBundle(preferredLanguage),
    getAppSetting<string | boolean>(CUSTOM_KNOWLEDGE_ENABLED_SETTING_KEY),
  ]);
  const { dictionary } = translationBundle;
  const customKnowledgeEnabled =
    typeof customKnowledgeSetting === "boolean"
      ? customKnowledgeSetting
      : typeof customKnowledgeSetting === "string"
        ? customKnowledgeSetting.toLowerCase() === "true"
        : false;

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
  }
  const isAdmin = session.user?.role === "admin";

  if (chat.deletedAt && !isAdmin) {
    redirect("/");
  }

  const { defaultModel, models } = modelsResult;

  if (chat.visibility === "private" && !isAdmin) {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  const uiMessages = convertToUIMessages(messagesFromDb);

  const chatModelFromCookie = cookieStore.get("chat-model");
  const fallbackModelId =
    chatModelFromCookie?.value ??
    defaultModel?.id ??
    models[0]?.id ??
    "";

  const deletedBanner = chat.deletedAt && isAdmin;

  if (!chatModelFromCookie) {
    return (
      <>
        {deletedBanner && (
          <DeletedNotice dictionary={dictionary} />
        )}
        <ChatLoader
          autoResume={true}
          id={chat.id}
          initialChatModel={fallbackModelId}
          initialMessages={uiMessages}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
          suggestedPrompts={suggestedPrompts}
          customKnowledgeEnabled={customKnowledgeEnabled}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      {deletedBanner && <DeletedNotice dictionary={dictionary} />}
      <ChatLoader
        autoResume={true}
        id={chat.id}
        initialChatModel={fallbackModelId}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        suggestedPrompts={suggestedPrompts}
        customKnowledgeEnabled={customKnowledgeEnabled}
      />
      <DataStreamHandler />
    </>
  );
}

function DeletedNotice({ dictionary }: { dictionary: Record<string, string> }) {
  return (
    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      {dictionary["chat.deleted_notice"] ??
        "This chat has been deleted. You are viewing it in read-only mode."}
    </div>
  );
}


