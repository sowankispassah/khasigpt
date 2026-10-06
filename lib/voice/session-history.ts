import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { chat, message } from "@/lib/db/schema";
import { ChatSDKError } from "@/lib/errors";
import { appendDurationTranscript, type DurationTranscriptMessage } from "@/lib/voice/duration-transcripts";

// Voice history is owned by the server connection, independently of whether
// the browser/app remains open long enough to submit a final transcript.
export async function openVoiceSessionHistory(userId: string, requestedChatId?: string) {
  const id = requestedChatId ?? crypto.randomUUID();
  const now = new Date();
  const created = await db.insert(chat).values({ id, userId, title: "Voice chat", createdAt: now, mode: "default", visibility: "private", status: "pending" }).onConflictDoNothing().returning({ id: chat.id });
  const [owner] = await db.select({ userId: chat.userId, deletedAt: chat.deletedAt }).from(chat).where(eq(chat.id, id)).limit(1);
  if (!owner || owner.userId !== userId || owner.deletedAt) throw new ChatSDKError("forbidden:chat");
  let transcripts: DurationTranscriptMessage[] = [];
  const storedText = new Map<string, string>();
  let queue = Promise.resolve();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastTitle = "";
  const flush = async () => {
    const snapshot = transcripts.map(item => ({ ...item }));
    queue = queue.catch(() => undefined).then(async () => {
      const dirty = snapshot.filter(item => item.text.trim() && storedText.get(item.id) !== item.text);
      if (dirty.length) await db.transaction(async tx => {
        const [active] = await tx.select({ id: chat.id }).from(chat).where(and(eq(chat.id, id), eq(chat.userId, userId), isNull(chat.deletedAt))).limit(1);
        if (!active) return;
        for (const item of dirty) {
          const createdAt = new Date(now.getTime() + snapshot.findIndex(entry => entry.id === item.id));
          const parts = [{ type: "text", text: item.text.trim() }];
          await tx.insert(message).values({ id: item.id, chatId: id, role: item.role, parts, attachments: [], createdAt }).onConflictDoUpdate({ target: message.id, set: { parts } });
        }
        const firstUser = snapshot.find(item => item.role === "user" && item.text.trim());
        const title = firstUser?.text.replace(/\s+/g, " ").trim().slice(0, 80);
        await tx.update(chat).set({ createdAt: new Date(), ...(created.length && title && title !== lastTitle ? { title } : {}) }).where(eq(chat.id, id));
        if (title) lastTitle = title;
      });
      for (const item of dirty) storedText.set(item.id, item.text);
    });
    await queue;
  };
  return {
    chatId: id,
    append(event: { type: string; delta?: unknown; start_ms?: unknown; end_ms?: unknown }, sessionId: string) {
      transcripts = appendDurationTranscript(transcripts, event, sessionId);
      if (!timer) timer = setTimeout(() => {
        timer = undefined;
        void flush().catch(() => console.warn("[voice-history] Transcript checkpoint failed."));
      }, 500);
    },
    async finish(failed = false) {
      clearTimeout(timer); timer = undefined;
      await flush();
      await db.update(chat).set({ status: failed ? "failed" : "completed", statusReason: failed ? "Voice chat could not stay connected. Please try again." : null }).where(and(eq(chat.id, id), eq(chat.userId, userId), isNull(chat.deletedAt)));
    },
  };
}
