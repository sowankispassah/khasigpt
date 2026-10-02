// All fixtures and setting changes are rolled back. No real payment is made.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

async function main() {
  const databaseUrl = process.env.POSTGRES_URL;
  if (!databaseUrl) throw new Error("POSTGRES_URL is required.");
  const sqlClient = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 10, connection: { statement_timeout: 5000, application_name: "referral-rollback-verification" } });
  const db = drizzle(sqlClient);
  const { appSetting, creatorReferral, paymentTransaction, pricingPlan, referralCommission, user } = await import("../lib/db/schema");
  const { recordReferralCommission } = await import("../lib/referrals/accounting");
  const rollback = new Error("verification_rollback");
  let checks = 0;
  try {
    await db.transaction(async tx => {
      await tx.insert(appSetting).values({ key: "creator.referrals.access", value: "enabled" }).onConflictDoUpdate({ target: appSetting.key, set: { value: "enabled" } });
      const [plan] = await tx.select({ id: pricingPlan.id }).from(pricingPlan).limit(1);
      assert.ok(plan, "A pricing plan is required for verification.");
      const creatorId = randomUUID();
      await tx.insert(user).values({ id: creatorId, email: `referral-${creatorId.slice(0, 8)}@example.invalid`, role: "creator", isActive: true });
      const [referral] = await tx.insert(creatorReferral).values({ creatorId, code: randomUUID(), percentage: 10, duration: "first_recharge", createdAt: new Date("2026-01-01T00:00:00Z") }).returning();
      const userId = randomUUID();
      await tx.insert(user).values({ id: userId, email: `referral-${userId.slice(0, 8)}@example.invalid`, signupReferralCode: referral.code, createdAt: new Date("2026-02-01T00:00:00Z") });
      const makePayment = async (amount = 50000) => {
        const [payment] = await tx.insert(paymentTransaction).values({ orderId: randomUUID(), userId, planId: plan.id, amount, currency: "INR", status: "processing" }).returning();
        return payment;
      };
      const first = await makePayment();
      await recordReferralCommission(tx, first, new Date("2026-02-02T00:00:00Z"));
      await recordReferralCommission(tx, first, new Date("2026-02-02T00:00:00Z"));
      let commissions = await tx.select().from(referralCommission).where(eq(referralCommission.referralId, referral.id));
      assert.equal(commissions.length, 1); assert.equal(commissions[0].amount, 5000); checks += 2;
      await tx.update(paymentTransaction).set({ status: "paid" }).where(eq(paymentTransaction.orderId, first.orderId));
      const second = await makePayment(); await recordReferralCommission(tx, second, new Date("2026-02-03T00:00:00Z"));
      commissions = await tx.select().from(referralCommission).where(eq(referralCommission.referralId, referral.id));
      assert.equal(commissions.length, 1); checks++;
      await tx.update(creatorReferral).set({ duration: "months", months: 1 }).where(eq(creatorReferral.id, referral.id));
      const late = await makePayment(); await recordReferralCommission(tx, late, new Date("2026-03-01T00:00:00Z"));
      assert.equal((await tx.select().from(referralCommission).where(eq(referralCommission.orderId, late.orderId))).length, 0); checks++;
      const timely = await makePayment(45000); await recordReferralCommission(tx, timely, new Date("2026-02-28T00:00:00Z"));
      assert.equal((await tx.select().from(referralCommission).where(eq(referralCommission.orderId, timely.orderId)))[0].amount, 4500); checks++;
      await tx.update(creatorReferral).set({ isActive: false }).where(eq(creatorReferral.id, referral.id));
      const paused = await makePayment(); await recordReferralCommission(tx, paused, new Date("2026-02-28T00:00:00Z"));
      assert.equal((await tx.select().from(referralCommission).where(eq(referralCommission.orderId, paused.orderId))).length, 0); checks++;
      console.info("Verification: checking feature gate and account-deletion history.");
      await tx.update(creatorReferral).set({ isActive: true }).where(eq(creatorReferral.id, referral.id));
      await tx.update(appSetting).set({ value: "admin_only" }).where(eq(appSetting.key, "creator.referrals.access"));
      const gated = await makePayment(); await recordReferralCommission(tx, gated, new Date("2026-02-28T00:00:00Z"));
      assert.equal((await tx.select().from(referralCommission).where(eq(referralCommission.orderId, gated.orderId))).length, 0); checks++;
      await tx.delete(user).where(eq(user.id, userId));
      const history = await tx.select().from(referralCommission).where(and(eq(referralCommission.orderId, first.orderId), eq(referralCommission.amount, 5000)));
      assert.equal(history.length, 1); assert.equal(history[0].userId, null); checks++;
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  console.info(`Verified ${checks} database assertions. All fixtures and setting changes rolled back.`);
  await sqlClient.end();
  process.exit(0);
}
main().catch(error => { console.error("Referral database verification failed:", error instanceof Error ? error.message : "unknown error"); if (error && typeof error === "object" && "cause" in error) { const cause = error.cause as { code?: string; column?: string; constraint?: string; message?: string }; console.error({ code: cause?.code, column: cause?.column, constraint: cause?.constraint, detail: cause?.code === "42703" || cause?.code === "57014" ? cause.message : undefined }); } process.exit(1); });
