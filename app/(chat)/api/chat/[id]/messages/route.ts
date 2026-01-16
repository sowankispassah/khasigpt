import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import { CHAT_HISTORY_PAGE_SIZE } from "@/lib/constants";
import { getChatById, getMessagesByChatIdPage } from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { convertToUIMessages } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PAGE_SIZE = 200;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await params;

  if (!chatId) {
    return new ChatSDKError("bad_request:chat").toResponse();
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const chat = await getChatById({ id: chatId, includeDeleted: true });
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

  const { messages, hasMore } = await getMessagesByChatIdPage({
    id: chatId,
    limit,
    before,
  });

  const oldestMessage = messages[0];
  const oldestMessageAt =
    oldestMessage?.createdAt instanceof Date
      ? oldestMessage.createdAt.toISOString()
      : oldestMessage?.createdAt
        ? new Date(oldestMessage.createdAt as unknown as string).toISOString()
        : null;

  return NextResponse.json(
    {
      messages: convertToUIMessages(messages),
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
