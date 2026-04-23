import { NextResponse } from "next/server";
import { auth } from "@/app/(auth)/auth";
import {
  deleteMessagesByChatIdAfterTimestamp,
  getChatById,
  getMessageById,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  const { messageId } = await params;
  if (!messageId) {
    return new ChatSDKError("bad_request:api", "Missing message id.").toResponse();
  }

  const [message] = await getMessageById({ id: messageId });
  if (!message) {
    return new ChatSDKError("not_found:api", "Message not found.").toResponse();
  }

  const chat = await getChatById({ id: message.chatId });
  if (chat?.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });

  return NextResponse.json({ ok: true });
}
