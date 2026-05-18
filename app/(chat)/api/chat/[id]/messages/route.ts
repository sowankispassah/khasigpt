import { NextResponse } from "next/server";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { getChatById, getMessagesByChatIdPage } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";
import { convertToUIMessages } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PAGE_SIZE = 200;

function getErrorDetails(error: unknown) {
  if (error instanceof ChatSDKError && typeof error.cause === "string") {
    return error.cause;
  }
  return error instanceof Error ? error.message : "";
}

function isTransientDatabaseConnectionError(details: string) {
  return /connect_timeout|econnrefused|econnreset|etimedout|connection terminated|network|timeout/i.test(
    details
  );
}

function unavailableChatMessagesResponse(details: string) {
  console.warn("[api/chat/messages] transient chat read failure", { details });
  return NextResponse.json(
    {
      code: "service_unavailable:chat_messages",
      degraded: true,
      message: "Chat messages could not be confirmed. Please try again.",
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await params;

  if (!chatId) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  const session = await getMobileSession(request);
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  let chat: Awaited<ReturnType<typeof getChatById>>;
  try {
    chat = await getChatById({ id: chatId, includeDeleted: true });
  } catch (error) {
    const details = getErrorDetails(error);
    if (isTransientDatabaseConnectionError(details)) {
      return unavailableChatMessagesResponse(details || "chat_lookup_timeout");
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  const isAdmin = session.user.role === "admin";

  if (chat.deletedAt && !isAdmin) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  if (chat.visibility === "private" && !isAdmin && chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const { searchParams } = new URL(request.url);
  const beforeParam = searchParams.get("before");
  const limitParam = searchParams.get("limit");
  const parsedLimit = Number.parseInt(limitParam ?? "", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_PAGE_SIZE)
      : CHAT_HISTORY_PAGE_SIZE;
  const before = beforeParam ? new Date(beforeParam) : null;

  let messagesResult: Awaited<ReturnType<typeof getMessagesByChatIdPage>>;
  try {
    messagesResult = await getMessagesByChatIdPage({
      id: chatId,
      limit,
      before,
    });
  } catch (error) {
    const details = getErrorDetails(error);
    if (isTransientDatabaseConnectionError(details)) {
      return unavailableChatMessagesResponse(details || "message_query_timeout");
    }
    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }
    throw error;
  }
  const { messages, hasMore } = messagesResult;

  const oldestMessage = messages[0];
  const oldestMessageAt =
    oldestMessage?.createdAt instanceof Date
      ? oldestMessage.createdAt.toISOString()
      : oldestMessage?.createdAt
        ? new Date(oldestMessage.createdAt as unknown as string).toISOString()
        : null;

  return NextResponse.json(
    {
      messages: rewriteDocumentUrlsForViewer({
        messages: convertToUIMessages(messages),
        viewerUserId: session.user.id,
        isAdmin,
        baseUrl: request.url,
      }),
      hasMore,
      oldestMessageAt,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
