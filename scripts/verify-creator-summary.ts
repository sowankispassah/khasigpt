// Verification fixtures exist only inside a transaction that always rolls back.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env", override: false });

async function main() {
  if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required.");
  const client = postgres(process.env.POSTGRES_URL, { max: 1, prepare: false, connect_timeout: 10, connection: { statement_timeout: 5000 } });
  const db = drizzle(client);
  const { creatorReferral, referralCommission, referralPayout, user } = await import("../lib/db/schema");
  const { getCreatorReferralTotals } = await import("../lib/referrals/service");
  const rollback = new Error("verification_rollback");
  try {
    await db.transaction(async tx => {
      const owner = randomUUID(), other = randomUUID();
      await tx.insert(user).values([owner, other].map(id => ({ id, email: `summary-${id.slice(0, 8)}@example.invalid`, role: "creator" as const, isActive: true })));
      const links = await tx.insert(creatorReferral).values(Array.from({ length: 21 }, () => ({ creatorId: owner, code: randomUUID(), percentage: 5, duration: "indefinite" }))).returning();
      const [foreign] = await tx.insert(creatorReferral).values({ creatorId: other, code: randomUUID(), percentage: 5, duration: "indefinite" }).returning();
      const commission = (referralId: string, creatorId: string, amount: number, currency = "INR", reversed = false) => ({ orderId: randomUUID(), referralId, creatorId, amount, currency, reversed, percentage: 5, paymentAmount: amount * 20 });
      await tx.insert(referralCommission).values([
        ...links.map((row, index) => commission(row.id, owner, (index + 1) * 100)),
        commission(links[0].id, owner, 100000, "INR", true),
        commission(links[0].id, owner, 700, "USD"),
        commission(foreign.id, other, 500000),
      ]);
      await tx.insert(referralPayout).values([
        { referralId: links[20].id, amount: 100, currency: "INR" },
        { referralId: links[0].id, amount: 100, currency: "USD" },
        { referralId: foreign.id, amount: 100000, currency: "INR" },
      ]);
      const totals = await getCreatorReferralTotals(owner, tx);
      assert.deepEqual(totals.find(row => row.currency === "INR"), { currency: "INR", earned: 23100, paid: 100, remaining: 23000 });
      assert.deepEqual(totals.find(row => row.currency === "USD"), { currency: "USD", earned: 700, paid: 100, remaining: 600 });
      assert.deepEqual(await getCreatorReferralTotals(randomUUID(), tx), []);
      console.info("Verified totals across 21 links, reversed commissions, creator isolation, separate currencies and empty history. Fixtures rolled back.");
      throw rollback;
    });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await client.end(); }
}
main().catch(() => { console.error("Creator summary verification failed."); process.exitCode = 1; });
