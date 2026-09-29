import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { contactMessage, contactMessageReply, user } from "@/lib/db/schema";
import { contactReplySubject, sendContactReplyEmail } from "@/lib/email/brevo";

export async function listContactReplies(messageId: string) {
  const [contact] = await db.select({ id: contactMessage.id }).from(contactMessage)
    .where(and(eq(contactMessage.id, messageId), eq(contactMessage.kind, "contact"))).limit(1);
  if (!contact) return null;
  return db.select({
    id: contactMessageReply.id,
    recipientEmail: contactMessageReply.recipientEmail,
    subject: contactMessageReply.subject,
    body: contactMessageReply.body,
    deliveryStatus: contactMessageReply.deliveryStatus,
    createdAt: contactMessageReply.createdAt,
    sentAt: contactMessageReply.sentAt,
    actorFirstName: user.firstName,
    actorLastName: user.lastName,
  }).from(contactMessageReply)
    .leftJoin(user, eq(contactMessageReply.actorUserId, user.id))
    .where(eq(contactMessageReply.messageId, messageId))
    .orderBy(desc(contactMessageReply.createdAt), desc(contactMessageReply.id))
    .limit(50);
}

export async function sendContactReply(input: {
  messageId: string;
  requestId: string;
  actorUserId: string;
  body: string;
}) {
  const [contact] = await db.select().from(contactMessage)
    .where(and(eq(contactMessage.id, input.messageId), eq(contactMessage.kind, "contact"))).limit(1);
  if (!contact) return null;
  const recipientEmail = contact.email.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) return { deliveryStatus: "invalid_recipient" as const };

  const [claimed] = await db.insert(contactMessageReply).values({
    id: input.requestId,
    messageId: contact.id,
    actorUserId: input.actorUserId,
    recipientEmail,
    subject: contactReplySubject(contact.subject),
    body: input.body,
  }).onConflictDoNothing().returning({ id: contactMessageReply.id });
  if (!claimed) {
    const [existing] = await db.select({
      messageId: contactMessageReply.messageId,
      body: contactMessageReply.body,
      deliveryStatus: contactMessageReply.deliveryStatus,
    }).from(contactMessageReply).where(eq(contactMessageReply.id, input.requestId)).limit(1);
    if (!existing || existing.messageId !== input.messageId || existing.body !== input.body) return { deliveryStatus: "invalid_request" as const };
    return { deliveryStatus: existing.deliveryStatus };
  }

  try {
    await sendContactReplyEmail({
      toEmail: recipientEmail,
      toName: contact.name,
      subject: contact.subject,
      body: input.body,
    });
    await db.update(contactMessageReply).set({ deliveryStatus: "sent", sentAt: new Date() })
      .where(eq(contactMessageReply.id, input.requestId));
    return { deliveryStatus: "sent" as const };
  } catch {
    await db.update(contactMessageReply).set({ deliveryStatus: "unconfirmed" })
      .where(eq(contactMessageReply.id, input.requestId));
    return { deliveryStatus: "unconfirmed" as const };
  }
}
