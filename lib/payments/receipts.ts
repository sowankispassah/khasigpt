import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { paymentReceipt, paymentTransaction, pricingPlan, user } from "@/lib/db/schema";
import { sendPaymentReceiptEmail } from "@/lib/email/brevo";
import { getGooglePlayOrderTotal } from "./google-play";
import { buildReceiptData, receiptDataSchema } from "./receipt-data";
import { createReceiptPdf } from "./receipt-pdf";

// Paid purchases predating this feature are materialized on first download.
// Suppress email for these historical receipts rather than mailing old purchases.
export async function getOwnedReceipt(orderId: string, userId: string) {
  const [paid] = await db.select({ transaction: paymentTransaction, email: user.email, firstName: user.firstName, lastName: user.lastName, planName: pricingPlan.name })
    .from(paymentTransaction).innerJoin(user, eq(user.id, paymentTransaction.userId))
    .leftJoin(pricingPlan, eq(pricingPlan.id, paymentTransaction.planId))
    .where(and(eq(paymentTransaction.orderId, orderId), eq(paymentTransaction.userId, userId), eq(paymentTransaction.status, "paid"))).limit(1);
  if (!paid) return null;
  let [record] = await db.select().from(paymentReceipt).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.userId, userId))).limit(1);
  if (!record) {
    await db.insert(paymentReceipt).values({ orderId, userId, emailRequested: false, snapshot: buildReceiptData({
      ...paid.transaction, paidAt: paid.transaction.updatedAt, email: paid.email,
      name: [paid.firstName, paid.lastName].filter(Boolean).join(" "), planName: paid.planName ?? "Subscription recharge",
    }) }).onConflictDoNothing();
    [record] = await db.select().from(paymentReceipt).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.userId, userId))).limit(1);
  }
  if (!record) throw new Error("Receipt could not be created");
  const receipt = receiptDataSchema.parse(record.snapshot);
  if (!record.emailRequested && !receipt.amountVerified) {
    // Historical purchases contain only the app's saved recharge amount.
    // Preserve it explicitly as a ledger receipt, independent of checkout APIs.
    const historical = { ...receipt, amountVerified: true, amountSource: "recorded" as const };
    await db.update(paymentReceipt).set({ snapshot: historical }).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.userId, userId)));
    return historical;
  }
  if (!receipt.amountVerified) {
    // Never show the configured catalogue price as a Google Play receipt total.
    const total = await getGooglePlayOrderTotal(receipt.paymentId ?? "");
    const verified = { ...receipt, ...total, amountVerified: true };
    await db.update(paymentReceipt).set({ snapshot: verified }).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.userId, userId)));
    return verified;
  }
  return receipt;
}

export async function deliverReceiptEmail(orderId: string) {
  const leaseId = randomUUID();
  const now = new Date();
  const [claim] = await db.update(paymentReceipt).set({
    leaseId, nextAttemptAt: new Date(now.getTime() + 5 * 60_000),
    emailAttempts: sql`${paymentReceipt.emailAttempts} + 1`,
  }).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.emailRequested, true), isNull(paymentReceipt.emailSentAt), lte(paymentReceipt.nextAttemptAt, now))).returning();
  if (!claim) return false;
  try {
    const receipt = await getOwnedReceipt(orderId, claim.userId);
    if (!receipt) throw new Error("Paid receipt unavailable");
    const pdf = await createReceiptPdf(receipt);
    await sendPaymentReceiptEmail({ receipt, pdf });
    await db.update(paymentReceipt).set({ emailSentAt: new Date(), leaseId: null }).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.leaseId, leaseId)));
    return true;
  } catch {
    const delay = Math.min(24 * 60 * 60_000, 60_000 * 2 ** Math.min(claim.emailAttempts, 10));
    await db.update(paymentReceipt).set({ leaseId: null, nextAttemptAt: new Date(Date.now() + delay) }).where(and(eq(paymentReceipt.orderId, orderId), eq(paymentReceipt.leaseId, leaseId)));
    console.error("[receipts] Email delivery failed; queued for retry", { orderId, attempt: claim.emailAttempts });
    return false;
  }
}

export async function deliverPendingReceiptEmails() {
  const startedAt = Date.now();
  let attempted = 0;
  let sent = 0;
  while (attempted < 200 && Date.now() - startedAt < 120_000) {
    const pending = await db.select({ orderId: paymentReceipt.orderId }).from(paymentReceipt)
      .where(and(eq(paymentReceipt.emailRequested, true), isNull(paymentReceipt.emailSentAt), lte(paymentReceipt.nextAttemptAt, new Date())))
      .orderBy(paymentReceipt.nextAttemptAt).limit(4);
    if (pending.length === 0) break;
    const result = await Promise.all(pending.map((row) => deliverReceiptEmail(row.orderId)));
    attempted += pending.length;
    sent += result.filter(Boolean).length;
  }
  return { attempted, sent };
}
