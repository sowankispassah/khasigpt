import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { getChatById, getMessagesByChatIdPage } from "@/lib/db/queries";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { convertToUIMessages } from "@/lib/utils";
import { withTimeout } from "@/lib/utils/async";
import { findOwnedVoiceSession } from "@/lib/voice/duration-session";

export async function handleVoiceSessionHistory(request: Request, native: boolean) {
  const fail = (status: number) => Response.json({ message: "Voice chat history could not be confirmed. Please try again." }, { status, headers: noStoreHeaders() });
  const auth = await getAuthenticatedUser(request, { allowBearer: native });
  if (!auth?.user) return fail(401);
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("sessionId"));
  if (!parsed.success) return fail(400);
  if (!(await incrementRateLimit(`voice-history:${auth.user.id}`, { limit: 150, windowMs: 60000 })).allowed) return fail(429);
  try {
    const owned = await withTimeout(findOwnedVoiceSession(parsed.data, auth.user.id), 5000);
    const chatId = owned?.pricing.historyChatId;
    if (typeof chatId !== "string") return fail(404);
    const savedChat = await withTimeout(getChatById({ id: chatId }), 5000);
    if (!savedChat || savedChat.userId !== auth.user.id || savedChat.deletedAt) return fail(404);
    if (owned?.status === "pending" || owned?.status === "active") return Response.json({ pending: true }, { status: 202, headers: noStoreHeaders() });
    if (owned?.pricing.historyFailed) return fail(503);
    const page = await withTimeout(getMessagesByChatIdPage({ id: chatId, limit: 200 }), 5000);
    return Response.json({ chat: { id: savedChat.id, title: savedChat.title, createdAt: savedChat.createdAt, updatedAt: savedChat.createdAt, mode: savedChat.mode, visibility: savedChat.visibility, status: savedChat.status, statusReason: savedChat.statusReason }, messages: convertToUIMessages(page.messages), hasMore: page.hasMore }, { headers: noStoreHeaders() });
  } catch { return fail(503); }
}
