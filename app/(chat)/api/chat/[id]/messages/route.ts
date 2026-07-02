import { NextResponse } from "next/server";
import { withApiTiming } from "@/lib/api/observability";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { getChatById, getMessagesByChatIdPage } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";
import { rewriteDocumentUrlsForViewer } from "@/lib/uploads/document-access";
import { convertToUIMessages } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PAGE_SIZE = 200;
const CHAT_MESSAGES_READ_TIMEOUT_MS = 8000;

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

  const session = await withApiTiming(
    "chat.messages.session",
    () => getMobileSession(request),
    {
      metadata: {
        chatId,
      },
      slowMs: 750,
    }
  );
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  let chat: Awaited<ReturnType<typeof getChatById>>;
  try {
    chat = await withApiTiming(
      "chat.messages.chat_lookup",
      () =>
        withTimeout(
          getChatById({ id: chatId, includeDeleted: true }),
          CHAT_MESSAGES_READ_TIMEOUT_MS,
          () => {
            console.error("[api/chat/messages] chat lookup timed out.", {
              chatId,
              timeoutMs: CHAT_MESSAGES_READ_TIMEOUT_MS,
            });
          }
        ),
      {
        metadata: {
          chatId,
        },
        slowMs: 1000,
      }
    );
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
  const beforeIdParam = searchParams.get("before_id");
  const limitParam = searchParams.get("limit");
  const parsedLimit = Number.parseInt(limitParam ?? "", 10);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_PAGE_SIZE)
      : CHAT_HISTORY_PAGE_SIZE;
  const before = beforeParam && !beforeIdParam ? new Date(beforeParam) : null;

  let messagesResult: Awaited<ReturnType<typeof getMessagesByChatIdPage>>;
  try {
    messagesResult = await withApiTiming(
      "chat.messages.page_query",
      () =>
        withTimeout(
          getMessagesByChatIdPage({
            beforeMessageId: beforeIdParam,
            id: chatId,
            limit,
            before,
          }),
          CHAT_MESSAGES_READ_TIMEOUT_MS,
          () => {
            console.error("[api/chat/messages] message page query timed out.", {
              chatId,
              timeoutMs: CHAT_MESSAGES_READ_TIMEOUT_MS,
            });
          }
        ),
      {
        metadata: {
          chatId,
          direction: before || beforeIdParam ? "older" : "initial",
          limit,
        },
        slowMs: 1000,
      }
    );
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
  const oldestMessageId = oldestMessage?.id ?? null;

  const uiMessages = convertToUIMessages(messages);
  const rewrittenMessages = await withApiTiming(
    "chat.messages.document_url_rewrite",
    () =>
      Promise.resolve(
        rewriteDocumentUrlsForViewer({
          messages: uiMessages,
          viewerUserId: session.user.id,
          isAdmin,
          baseUrl: request.url,
        })
      ),
    {
      metadata: {
        chatId,
        messageCount: uiMessages.length,
      },
      slowMs: 500,
    }
  );

  return NextResponse.json(
    {
      messages: rewrittenMessages,
      hasMore,
      oldestMessageAt,
      oldestMessageId,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
