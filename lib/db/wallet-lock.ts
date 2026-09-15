import { type SQL, sql } from "drizzle-orm";

/** Serialize wallet writers across web, native, admin, and server instances.
 * Must run inside the same transaction as the balance read and writes. A
 * transaction lock also covers the first credit grant, before a wallet exists.
 * It releases automatically on commit/rollback and does not lock user reads.
 */
export async function lockUserWallet(
  transaction: { execute: (query: SQL) => PromiseLike<unknown> },
  userId: string
) {
  await transaction.execute(
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`khasigpt:wallet:${userId}`}, 0))`
  );
}
