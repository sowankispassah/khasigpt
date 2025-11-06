import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ChatLoader } from "@/components/chat-loader";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { loadChatModels } from "@/lib/ai/models";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { convertToUIMessages } from "@/lib/utils";
import { loadRootContext } from "../../../root-context";

export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params;
  const chat = await getChatById({ id, includeDeleted: true });

  if (!chat) {
    notFound();
  }

  const { session, preferredLanguage, activeLanguage, languages, dictionary } =
    await loadRootContext();

  if (!session) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/chat/${id}`)}`);
  }
  const isAdmin = session.user?.role === "admin";

  if (chat.deletedAt && !isAdmin) {
    redirect("/");
  }

  if (
    chat.visibility === "private" &&
    !isAdmin &&
    session.user?.id !== chat.userId
  ) {
    return notFound();
  }

  const cookieStore = await cookies();

  const [modelsResult, suggestedPrompts, messagesFromDb] = await Promise.all([
    loadChatModels(),
    loadSuggestedPrompts({
      preferredLanguageCode: preferredLanguage,
      activeLanguage,
      languages,
    }),
    getMessagesByChatId({ id }),
  ]);

  const { defaultModel, models } = modelsResult;
  const uiMessages = convertToUIMessages(messagesFromDb);

  const chatModelFromCookie = cookieStore.get("chat-model");
  const fallbackModelId =
    chatModelFromCookie?.value ?? defaultModel?.id ?? models[0]?.id ?? "";

  const deletedBanner = chat.deletedAt && isAdmin;

  if (!chatModelFromCookie) {
    return (
      <>
        {deletedBanner && <DeletedNotice dictionary={dictionary} />}
        <ChatLoader
          autoResume={true}
          id={chat.id}
          initialChatModel={fallbackModelId}
          initialMessages={uiMessages}
          initialVisibilityType={chat.visibility}
          isReadonly={session.user?.id !== chat.userId}
          suggestedPrompts={suggestedPrompts}
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
        isReadonly={session.user?.id !== chat.userId}
        suggestedPrompts={suggestedPrompts}
      />
      <DataStreamHandler />
    </>
  );
}

function DeletedNotice({ dictionary }: { dictionary: Record<string, string> }) {
  return (
    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive text-sm">
      {dictionary["chat.deleted_notice"] ??
        "This chat has been deleted. You are viewing it in read-only mode."}
    </div>
  );
}
