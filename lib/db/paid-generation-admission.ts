import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { ChatSDKError } from "@/lib/errors";
import { paidGenerationLease } from "./schema";

// Longer than the longest server-mediated generation route (300s). Expiration
// recovers a crashed function; normal completion releases ownership promptly.
export const PAID_GENERATION_LEASE_SECONDS = 360;

export async function claimPaidGeneration(executor: Pick<PostgresJsDatabase, "insert">, userId: string) {
  const ownerId = randomUUID();
  const [claim] = await executor.insert(paidGenerationLease).values({
    userId,
    ownerId,
    expiresAt: sql`clock_timestamp() + ${PAID_GENERATION_LEASE_SECONDS} * interval '1 second'`,
  }).onConflictDoUpdate({
    target: paidGenerationLease.userId,
    set: { ownerId, expiresAt: sql`clock_timestamp() + ${PAID_GENERATION_LEASE_SECONDS} * interval '1 second'` },
    setWhere: sql`${paidGenerationLease.expiresAt} <= clock_timestamp()`,
  }).returning({ ownerId: paidGenerationLease.ownerId });
  if (!claim) throw new ChatSDKError("rate_limit:chat");
  return claim;
}

export async function releasePaidGeneration(executor: Pick<PostgresJsDatabase, "delete">, userId: string, ownerId: string) {
  // An old callback must never release a replacement lease after expiry.
  await executor.delete(paidGenerationLease).where(and(
    eq(paidGenerationLease.userId, userId), eq(paidGenerationLease.ownerId, ownerId)
  ));
}
