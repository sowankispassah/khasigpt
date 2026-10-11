import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { coupon, couponRedemption, couponRewardPayout, creatorReferral, paymentTransaction, referralCommission, referralPayout, user } from "@/lib/db/schema";

export class PromotionInUseError extends Error {}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// The row lock also serializes FK-backed writes. Never cascade away ledger rows.
export async function deleteUnusedPromotion(tx: Transaction, kind: "referral" | "coupon", id: string) {
  if (kind === "referral") {
    const [row] = await tx.select().from(creatorReferral).where(eq(creatorReferral.id, id)).for("update");
    if (!row) return false;
    const [signups, commissions, payouts] = await Promise.all([
      tx.select({ id: user.id }).from(user).where(eq(user.signupReferralCode, row.code)).limit(1),
      tx.select({ id: referralCommission.orderId }).from(referralCommission).where(eq(referralCommission.referralId, id)).limit(1),
      tx.select({ id: referralPayout.id }).from(referralPayout).where(eq(referralPayout.referralId, id)).limit(1),
    ]);
    if (signups.length || commissions.length || payouts.length) throw new PromotionInUseError();
    await tx.delete(creatorReferral).where(eq(creatorReferral.id, id));
  } else {
    const [row] = await tx.select().from(coupon).where(eq(coupon.id, id)).for("update");
    if (!row) return false;
    const [payments, redemptions, payouts] = await Promise.all([
      tx.select({ id: paymentTransaction.orderId }).from(paymentTransaction).where(eq(paymentTransaction.couponId, id)).limit(1),
      tx.select({ id: couponRedemption.id }).from(couponRedemption).where(eq(couponRedemption.couponId, id)).limit(1),
      tx.select({ id: couponRewardPayout.id }).from(couponRewardPayout).where(eq(couponRewardPayout.couponId, id)).limit(1),
    ]);
    if (payments.length || redemptions.length || payouts.length) throw new PromotionInUseError();
    await tx.delete(coupon).where(eq(coupon.id, id));
  }
  return true;
}

export function deletePromotion(kind: "referral" | "coupon", id: string) {
  return db.transaction(tx => deleteUnusedPromotion(tx, kind, id));
}
