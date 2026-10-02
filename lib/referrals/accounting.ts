import { and, eq, inArray, sql } from "drizzle-orm";
import { CREATOR_REFERRALS_ACCESS_KEY } from "@/lib/constants";
import type { db } from "@/lib/db/queries";
import { appSetting, creatorReferral, type PaymentTransaction, paymentTransaction, referralCommission, user } from "@/lib/db/schema";
import { parseFeatureAccessModeStrict } from "@/lib/feature-access";
import { calculateReferralCommission, referralDeadline } from "./rules";

type AccountingDb = Pick<typeof db, "select" | "insert" | "execute">;

// Called in the same DB transaction as credit allocation and payment completion.
export async function recordReferralCommission(tx: AccountingDb, payment: PaymentTransaction, paidAt: Date) {
  const notes = payment.notes && typeof payment.notes === "object" ? payment.notes as Record<string, unknown> : {};
  const [account] = await tx.select({ code: user.signupReferralCode, signup: user.createdAt, role: user.role })
    .from(user).where(eq(user.id, payment.userId)).for("update");
  if (!account?.code || payment.couponId || payment.amount <= 0 || notes.commissionEligible === false) return;
  const [setting] = await tx.select({ value: appSetting.value }).from(appSetting).where(eq(appSetting.key, CREATOR_REFERRALS_ACCESS_KEY));
  const access = parseFeatureAccessModeStrict(setting?.value) ?? "admin_only";
  if (access !== "enabled" && !(access === "admin_only" && account.role === "admin")) return;
  const [referral] = await tx.select().from(creatorReferral).where(and(eq(creatorReferral.code, account.code), eq(creatorReferral.isActive, true)));
  if (!referral || !referral.creatorId || referral.creatorId === payment.userId || account.signup < referral.createdAt) return;
  const [creator] = await tx.select({ role: user.role, isActive: user.isActive }).from(user).where(eq(user.id, referral.creatorId));
  if (!creator?.isActive || creator.role !== "creator") return;
  const verifiedTime = typeof notes.purchaseTimeMillis === "string" ? Number(notes.purchaseTimeMillis) : NaN;
  const purchaseDate = Number.isFinite(verifiedTime) ? new Date(verifiedTime) : paidAt;
  const deadline = referralDeadline(account.signup, referral);
  if (purchaseDate < account.signup || (deadline && purchaseDate >= deadline)) return;
  if (referral.duration === "first_recharge") {
    const [previous] = await tx.select({ id: paymentTransaction.orderId }).from(paymentTransaction)
      .where(and(eq(paymentTransaction.userId, payment.userId), inArray(paymentTransaction.status, ["paid"]), sql`${paymentTransaction.orderId} <> ${payment.orderId}`)).limit(1);
    if (previous) return;
  }
  await tx.insert(referralCommission).values({
    orderId: payment.orderId, referralId: referral.id, userId: payment.userId, creatorId: referral.creatorId,
    percentage: referral.percentage, paymentAmount: payment.amount,
    amount: calculateReferralCommission(payment.amount, referral.percentage), currency: payment.currency,
    createdAt: purchaseDate,
  }).onConflictDoNothing();
}
