import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { type ContactMessage, type ContactMessageStatus, contactMessage, contactMessageStatusEvent, user } from "@/lib/db/schema";

export async function listMessageStatusEvents(messageId: string, kind: ContactMessage["kind"]) {
  const [message] = await db.select({ id: contactMessage.id }).from(contactMessage)
    .where(and(eq(contactMessage.id, messageId), eq(contactMessage.kind, kind))).limit(1);
  if (!message) return null;
  return db.select({
    id: contactMessageStatusEvent.id,
    fromStatus: contactMessageStatusEvent.fromStatus,
    toStatus: contactMessageStatusEvent.toStatus,
    note: contactMessageStatusEvent.note,
    createdAt: contactMessageStatusEvent.createdAt,
    actorFirstName: user.firstName,
    actorLastName: user.lastName,
  }).from(contactMessageStatusEvent)
    .leftJoin(user, eq(contactMessageStatusEvent.actorUserId, user.id))
    .where(eq(contactMessageStatusEvent.messageId, messageId))
    .orderBy(asc(contactMessageStatusEvent.createdAt), asc(contactMessageStatusEvent.id));
}

export async function changeMessageStatus(input: {
  messageId: string;
  kind: ContactMessage["kind"];
  actorUserId: string;
  status: ContactMessageStatus;
  note: string | null;
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(contactMessage)
      .where(and(eq(contactMessage.id, input.messageId), eq(contactMessage.kind, input.kind)))
      .for("update").limit(1);
    if (!current) return null;
    if (current.status === input.status) return { message: current, unchanged: true };
    const [message] = await tx.update(contactMessage)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(contactMessage.id, input.messageId)).returning();
    await tx.insert(contactMessageStatusEvent).values({
      messageId: input.messageId,
      actorUserId: input.actorUserId,
      fromStatus: current.status,
      toStatus: input.status,
      note: input.note,
    });
    return { message, unchanged: false };
  });
}

export const listReportStatusEvents = (messageId: string) => listMessageStatusEvents(messageId, "report");
export const changeReportStatus = (input: Omit<Parameters<typeof changeMessageStatus>[0], "kind">) =>
  changeMessageStatus({ ...input, kind: "report" }).then((result) => result && ({ report: result.message, unchanged: result.unchanged }));
