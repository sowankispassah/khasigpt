import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { type ContactMessageStatus, contactMessage, contactMessageStatusEvent, user } from "@/lib/db/schema";

export async function listReportStatusEvents(messageId: string) {
  const [report] = await db.select({ id: contactMessage.id }).from(contactMessage)
    .where(and(eq(contactMessage.id, messageId), eq(contactMessage.kind, "report"))).limit(1);
  if (!report) return null;
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

export async function changeReportStatus(input: {
  messageId: string;
  actorUserId: string;
  status: ContactMessageStatus;
  note: string | null;
}) {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(contactMessage)
      .where(and(eq(contactMessage.id, input.messageId), eq(contactMessage.kind, "report")))
      .for("update").limit(1);
    if (!current) return null;
    if (current.status === input.status) return { report: current, unchanged: true };
    const [report] = await tx.update(contactMessage)
      .set({ status: input.status, updatedAt: new Date() })
      .where(eq(contactMessage.id, input.messageId)).returning();
    await tx.insert(contactMessageStatusEvent).values({
      messageId: input.messageId,
      actorUserId: input.actorUserId,
      fromStatus: current.status,
      toStatus: input.status,
      note: input.note,
    });
    return { report, unchanged: false };
  });
}
