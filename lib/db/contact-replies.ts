import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { contactMessage, contactMessageInboundEmail, contactMessageReply, contactMessageStatusEvent, user } from "@/lib/db/schema";
import { contactReplySubject, sendContactReplyEmail } from "@/lib/email/brevo";
import type { ParsedInboundContactEmail } from "@/lib/email/contact-inbound";

export async function listContactReplies(messageId: string) {
  const [contact] = await db.select({ id: contactMessage.id }).from(contactMessage)
    .where(and(eq(contactMessage.id, messageId), eq(contactMessage.kind, "contact"))).limit(1);
  if (!contact) return null;
  const [outbound, inbound] = await Promise.all([db.select({
    id: contactMessageReply.id,
    email: contactMessageReply.recipientEmail,
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
    .limit(50), db.select({
      id: contactMessageInboundEmail.id,
      email: contactMessageInboundEmail.senderEmail,
      subject: contactMessageInboundEmail.subject,
      body: contactMessageInboundEmail.body,
      createdAt: contactMessageInboundEmail.receivedAt,
    }).from(contactMessageInboundEmail)
      .where(eq(contactMessageInboundEmail.messageId, messageId))
      .orderBy(desc(contactMessageInboundEmail.receivedAt), desc(contactMessageInboundEmail.id))
      .limit(50)]);
  return [
    ...outbound.map((reply) => ({ ...reply, direction: "outbound" as const })),
    ...inbound.map((reply) => ({
      ...reply,
      direction: "inbound" as const,
      deliveryStatus: null,
      sentAt: null,
      actorFirstName: null,
      actorLastName: null,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 50);
}

export async function listLatestInboundContactEmails(messageIds: string[]) {
  if (messageIds.length === 0) return [];
  return db.selectDistinctOn([contactMessageInboundEmail.messageId], {
    messageId: contactMessageInboundEmail.messageId,
    body: contactMessageInboundEmail.body,
    receivedAt: contactMessageInboundEmail.receivedAt,
  }).from(contactMessageInboundEmail)
    .where(inArray(contactMessageInboundEmail.messageId, messageIds))
    .orderBy(contactMessageInboundEmail.messageId, desc(contactMessageInboundEmail.receivedAt));
}

export async function recordInboundContactEmail(input: ParsedInboundContactEmail) {
  return db.transaction(async (tx) => {
    const [contact] = await tx.select({ id: contactMessage.id, email: contactMessage.email, status: contactMessage.status })
      .from(contactMessage)
      .where(and(eq(contactMessage.id, input.contactId), eq(contactMessage.kind, "contact")))
      .limit(1);
    if (!contact || contact.email.trim().toLowerCase() !== input.senderEmail) return "ignored" as const;
    const now = new Date();
    const [inserted] = await tx.insert(contactMessageInboundEmail).values({
      messageId: contact.id,
      providerMessageId: input.providerMessageId,
      senderEmail: input.senderEmail,
      subject: input.subject,
      body: input.body,
      receivedAt: now,
    }).onConflictDoNothing().returning({ id: contactMessageInboundEmail.id });
    if (!inserted) return "duplicate" as const;
    const reopen = contact.status === "resolved" || contact.status === "archived";
    await tx.update(contactMessage).set({
      isViewed: false,
      lastInboundAt: now,
      updatedAt: now,
      ...(reopen ? { status: "in_progress" as const } : {}),
    }).where(eq(contactMessage.id, contact.id));
    if (reopen) await tx.insert(contactMessageStatusEvent).values({
      messageId: contact.id,
      fromStatus: contact.status,
      toStatus: "in_progress",
      note: "Customer replied by email.",
    });
    return "recorded" as const;
  });
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
      messageId: contact.id,
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
