import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/app/(auth)/auth";
import { Chat } from "@/components/chat";
import { DataStreamHandler } from "@/components/data-stream-handler";
import { loadChatModels } from "@/lib/ai/models";
import { loadSuggestedPrompts } from "@/lib/suggested-prompts";
import { getChatById, getMessagesByChatId } from "@/lib/db/queries";
import { convertToUIMessages } from "@/lib/utils";

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id, includeDeleted: true });

  if (!chat) {
    notFound();
  }

  const [session, modelsResult, suggestedPrompts] = await Promise.all([
    auth(),
    loadChatModels(),
    loadSuggestedPrompts(),
  ]);

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

  const cookieStore = await cookies();
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
          <DeletedNotice />
        )}
        <Chat
          autoResume={true}
          id={chat.id}
          initialChatModel={fallbackModelId}
          initialMessages={uiMessages}
          initialVisibilityType={chat.visibility}
          isReadonly={session?.user?.id !== chat.userId}
          suggestedPrompts={suggestedPrompts}
        />
        <DataStreamHandler />
      </>
    );
  }

  return (
    <>
      {deletedBanner && <DeletedNotice />}
      <Chat
        autoResume={true}
        id={chat.id}
        initialChatModel={fallbackModelId}
        initialMessages={uiMessages}
        initialVisibilityType={chat.visibility}
        isReadonly={session?.user?.id !== chat.userId}
        suggestedPrompts={suggestedPrompts}
      />
      <DataStreamHandler />
    </>
  );
}

function DeletedNotice() {
  return (
    <div className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      This chat has been deleted. You are viewing it in read-only mode.
    </div>
  );
}


