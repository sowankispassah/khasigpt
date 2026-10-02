import "server-only";
import { randomBytes } from "node:crypto";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/queries";
import { creatorReferral, referralCommission, referralPayout, user } from "@/lib/db/schema";
import { referralInputSchema } from "./rules";

export async function createReferral(input: unknown) {
  const value = referralInputSchema.parse(input);
  if (value.rechargeBefore && new Date(value.rechargeBefore) <= new Date()) throw new Error("The recharge cutoff must be in the future.");
  const [creator] = await db.select({ role: user.role, active: user.isActive }).from(user).where(eq(user.id, value.creatorId));
  if (creator?.role !== "creator" || !creator.active) throw new Error("Choose an active creator account.");
  const [result] = await db.insert(creatorReferral).values({ ...value, rechargeBefore: value.rechargeBefore ? new Date(value.rechargeBefore) : null, code: randomBytes(18).toString("base64url") }).returning();
  return result;
}

export async function getReferralByCode(code: string) {
  const [row] = await db.select().from(creatorReferral).where(and(eq(creatorReferral.code, code), eq(creatorReferral.isActive, true))).limit(1);
  return row ?? null;
}

export async function listReferralDashboard(creatorId?: string, page = 1) {
  const filter = creatorId ? eq(creatorReferral.creatorId, creatorId) : undefined;
  const [rows, total] = await Promise.all([
    db.select({ referral: creatorReferral, creatorName: user.firstName }).from(creatorReferral).leftJoin(user, eq(user.id, creatorReferral.creatorId)).where(filter).orderBy(desc(creatorReferral.createdAt)).limit(20).offset((page - 1) * 20),
    db.select({ count: count() }).from(creatorReferral).where(filter),
  ]);
  const ids = rows.map(row => row.referral.id);
  if (!ids.length) return { referrals: [], recentCommissions: [], page, totalCount: total[0].count };
  const codes = rows.map(row => row.referral.code);
  const [signups, earnings, payouts, recent, recentPayouts] = await Promise.all([
    db.select({ code: user.signupReferralCode, count: count() }).from(user).where(inArray(user.signupReferralCode, codes)).groupBy(user.signupReferralCode),
    db.select({ id: referralCommission.referralId, currency: referralCommission.currency, earned: sql<number>`coalesce(sum(case when ${referralCommission.reversed} then 0 else ${referralCommission.amount} end),0)`, revenue: sql<number>`coalesce(sum(${referralCommission.paymentAmount}),0)`, recharges: count() }).from(referralCommission).where(inArray(referralCommission.referralId, ids)).groupBy(referralCommission.referralId, referralCommission.currency),
    db.select({ id: referralPayout.referralId, currency: referralPayout.currency, paid: sql<number>`coalesce(sum(${referralPayout.amount}),0)` }).from(referralPayout).where(inArray(referralPayout.referralId, ids)).groupBy(referralPayout.referralId, referralPayout.currency),
    db.select().from(referralCommission).where(inArray(referralCommission.referralId, ids)).orderBy(desc(referralCommission.createdAt)).limit(20),
    db.select().from(referralPayout).where(inArray(referralPayout.referralId, ids)).orderBy(desc(referralPayout.createdAt)).limit(20),
  ]);
  return {
    referrals: rows.map(({ referral, creatorName }) => ({ ...referral, creatorName, signups: signups.find(row => row.code === referral.code)?.count ?? 0,
      balances: Array.from(new Set([...earnings.filter(row => row.id === referral.id).map(row => row.currency), ...payouts.filter(row => row.id === referral.id).map(row => row.currency)])).map(currency => {
        const earned = Number(earnings.find(row => row.id === referral.id && row.currency === currency)?.earned ?? 0);
        const paid = Number(payouts.find(row => row.id === referral.id && row.currency === currency)?.paid ?? 0);
        const activity = earnings.find(row => row.id === referral.id && row.currency === currency);
        return { currency, earned, paid, remaining: earned - paid, recharges: Number(activity?.recharges ?? 0), revenue: Number(activity?.revenue ?? 0) };
      }),
    })), recentCommissions: recent.map(({ userId: _userId, ...entry }) => entry), recentPayouts, page, totalCount: total[0].count,
  };
}

export async function recordReferralPayout(input: { referralId: string; amount: number; currency: string; note: string | null; recordedBy: string }) {
  return db.transaction(async tx => {
    const [referral] = await tx.select().from(creatorReferral).where(eq(creatorReferral.id, input.referralId)).for("update");
    if (!referral) throw new Error("Referral link not found.");
    const [earned, paid] = await Promise.all([
      tx.select({ amount: sql<number>`coalesce(sum(${referralCommission.amount}),0)` }).from(referralCommission).where(and(eq(referralCommission.referralId, input.referralId), eq(referralCommission.currency, input.currency), eq(referralCommission.reversed, false))),
      tx.select({ amount: sql<number>`coalesce(sum(${referralPayout.amount}),0)` }).from(referralPayout).where(and(eq(referralPayout.referralId, input.referralId), eq(referralPayout.currency, input.currency))),
    ]);
    if (input.amount > Number(earned[0].amount) - Number(paid[0].amount)) throw new Error("Payout exceeds the unpaid commission.");
    await tx.insert(referralPayout).values(input);
  });
}

export type ReferralDashboard = Awaited<ReturnType<typeof listReferralDashboard>>;
