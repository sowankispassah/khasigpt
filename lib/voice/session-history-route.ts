import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/api/auth";
import { noStoreHeaders } from "@/lib/api/cache";
import { withChatReadDatabase } from "@/lib/db/chat-read-database";
import { getChatById, getMessagesByChatIdPage } from "@/lib/db/queries";
import { liveVoiceSession } from "@/lib/db/schema";
import { incrementRateLimit } from "@/lib/security/rate-limit";
import { convertToUIMessages } from "@/lib/utils";

export async function handleVoiceSessionHistory(request: Request, native: boolean) {
  const fail = (status: number) => Response.json({ message: "Voice chat history could not be confirmed. Please try again." }, { status, headers: noStoreHeaders() });
  const auth = await getAuthenticatedUser(request, { allowBearer: native });
  if (!auth?.user) return fail(401);
  const parsed = z.string().uuid().safeParse(new URL(request.url).searchParams.get("sessionId"));
  if (!parsed.success) return fail(400);
  if (!(await incrementRateLimit(`voice-history:${auth.user.id}`, { limit: 150, windowMs: 60000 })).allowed) return fail(429);
  try {
    const snapshot = await withChatReadDatabase("voice.history", async database => {
      const [owned] = await database.select({ status: liveVoiceSession.status, pricing: liveVoiceSession.pricing }).from(liveVoiceSession).where(and(eq(liveVoiceSession.id, parsed.data), eq(liveVoiceSession.userId, auth.user.id))).limit(1);
      const chatId = owned?.pricing?.historyChatId;
      if (typeof chatId !== "string") return { status: 404 as const };
      const savedChat = await getChatById({ id: chatId, database });
      if (!savedChat || savedChat.userId !== auth.user.id || savedChat.deletedAt) return { status: 404 as const };
      if (owned.status === "pending" || owned.status === "active") return { status: 202 as const };
      if (owned.pricing.historyFailed) return { status: 503 as const };
      const page = await getMessagesByChatIdPage({ id: chatId, limit: 200, database });
      return { status: 200 as const, savedChat, page };
    });
    if (snapshot.status === 202) return Response.json({ pending: true }, { status: 202, headers: noStoreHeaders() });
    if (snapshot.status !== 200) return fail(snapshot.status);
    const { savedChat, page } = snapshot;
    return Response.json({ chat: { id: savedChat.id, title: savedChat.title, createdAt: savedChat.createdAt, updatedAt: savedChat.createdAt, mode: savedChat.mode, visibility: savedChat.visibility, status: savedChat.status, statusReason: savedChat.statusReason }, messages: convertToUIMessages(page.messages), hasMore: page.hasMore }, { headers: noStoreHeaders() });
  } catch { return fail(503); }
}
