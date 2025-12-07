import { createUIMessageStream, JsonToSseTransformStream } from "ai";
import { differenceInSeconds } from "date-fns";
import { auth } from "@/app/(auth)/auth";
import {
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
} from "@/lib/db/queries";
import type { Chat } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import type { ChatMessage } from "@/lib/types";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { getClientKeyFromHeaders } from "@/lib/security/request-helpers";
import { getStreamContext } from "../../route";

const STREAM_HEADERS: HeadersInit = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "X-Accel-Buffering": "no",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const ONE_MINUTE = 60 * 1000;
const CHAT_RATE_LIMIT = {
  limit: 120,
  windowMs: ONE_MINUTE,
};

async function enforceStreamRateLimit(request: Request): Promise<Response | null> {
  const clientKey = getClientKeyFromHeaders(request.headers);
  const { allowed, resetAt } = await incrementRateLimit(
    `api:chat:${clientKey}`,
    CHAT_RATE_LIMIT
  );

  if (allowed) {
    return null;
  }

  const retryAfterSeconds = Math.max(
    Math.ceil((resetAt - Date.now()) / 1000),
    1
  ).toString();

  return new Response(
    JSON.stringify({
      code: "rate_limit:api",
      message: "Too many requests. Please try again later.",
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": retryAfterSeconds,
      },
    }
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: chatId } = await params;
  const rateLimited = await enforceStreamRateLimit(request);

  if (rateLimited) {
    return rateLimited;
  }

  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  if (!chatId) {
    return new ChatSDKError("bad_request:api").toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError("unauthorized:chat").toResponse();
  }

  let chat: Chat | null;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (!chat) {
    return new ChatSDKError("not_found:chat").toResponse();
  }

  if (chat.visibility === "private" && chat.userId !== session.user.id) {
    return new ChatSDKError("forbidden:chat").toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError("not_found:stream").toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError("not_found:stream").toResponse();
  }

  const emptyDataStream = createUIMessageStream<ChatMessage>({
    // biome-ignore lint/suspicious/noEmptyBlockStatements: "Needs to exist"
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(recentStreamId, () =>
    emptyDataStream.pipeThrough(new JsonToSseTransformStream())
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, {
        status: 200,
        headers: STREAM_HEADERS,
      });
    }

    if (mostRecentMessage.role !== "assistant") {
      return new Response(emptyDataStream, {
        status: 200,
        headers: STREAM_HEADERS,
      });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        writer.write({
          type: "data-appendMessage",
          data: JSON.stringify(mostRecentMessage),
          transient: true,
        });
      },
    });

    return new Response(
      restoredStream.pipeThrough(new JsonToSseTransformStream()),
      { status: 200, headers: STREAM_HEADERS }
    );
  }

  return new Response(stream, { status: 200, headers: STREAM_HEADERS });
}
