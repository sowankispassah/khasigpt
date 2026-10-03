import {
  clearMessageVote,
  getChatById,
  getMessageById,
  getVotesByChatId,
  voteMessage,
} from "@/lib/db/queries";
import { ChatSDKError } from "@/lib/errors";
import { getMobileSession } from "@/lib/mobile-auth-session";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get("chatId");

  if (!chatId) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameter chatId is required."
    ).toResponse();
  }

  const session = await getMobileSession(request);

  if (!session?.user) {
    return new ChatSDKError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:vote").toResponse();
  }

  const votes = await getVotesByChatId({ id: chatId });

  return Response.json(votes, { status: 200 });
}

export async function PATCH(request: Request) {
  const {
    chatId,
    messageId,
    type,
  }: { chatId: string; messageId: string; type: "up" | "down" | "clear" } =
    await request.json();

  if (!chatId || !messageId || !["up", "down", "clear"].includes(type)) {
    return new ChatSDKError(
      "bad_request:api",
      "Parameters chatId, messageId, and a valid type are required."
    ).toResponse();
  }

  const session = await getMobileSession(request);

  if (!session?.user) {
    return new ChatSDKError("unauthorized:vote").toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatSDKError("not_found:vote").toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:vote").toResponse();
  }

  let messageExists = false;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [message] = await getMessageById({ id: messageId });
    if (message?.chatId === chatId) {
      messageExists = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  if (!messageExists) {
    return new ChatSDKError("not_found:vote").toResponse();
  }

  if (type === "clear") {
    await clearMessageVote({ chatId, messageId });
  } else {
    await voteMessage({
      chatId,
      messageId,
      type,
    });
  }

  return Response.json({ ok: true }, { status: 200 });
}
