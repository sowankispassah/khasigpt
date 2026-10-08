import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";

export const STORAGE_ALERT_BYTES = 1024 ** 3;
export const STORAGE_ORPHAN_HOURS = 24;
export const STORAGE_DELETED_CHAT_DAYS = 7;
type StorageDatabase = Pick<ReturnType<typeof drizzle>, "execute" | "transaction">;
export type CleanupFile = { key: string; etag: string | null };

export function cleanupEligibility(now = new Date()) {
  return sql`
    f."state" <> 'deleted' AND (f."confirmed" OR f."state" IN ('reserved','deleting'))
    AND NOT EXISTS (SELECT 1 FROM "ChatFileHold" h WHERE h."key" = f."key")
    AND ((f."state" IN ('ready','reserved') AND f."cleanupAfter" <= ${now.toISOString()}::timestamptz) OR (f."state" = 'deleting' AND COALESCE(f."retryAt", '-infinity'::timestamptz) <= ${now.toISOString()}::timestamptz))
    AND NOT EXISTS (SELECT 1 FROM "ChatFileReference" r JOIN "Chat" c ON c."id" = r."chatId" WHERE r."key" = f."key" AND c."deletedAt" IS NULL)
    AND (
      (f."state" = 'deleting' AND COALESCE(f."retryAt", '-infinity'::timestamptz) <= ${now.toISOString()}::timestamptz)
      OR (f."state" IN ('ready','reserved') AND (
        (EXISTS (SELECT 1 FROM "ChatFileReference" r WHERE r."key" = f."key")
          AND NOT EXISTS (SELECT 1 FROM "ChatFileReference" r JOIN "Chat" c ON c."id" = r."chatId" WHERE r."key" = f."key" AND c."deletedAt" AT TIME ZONE 'UTC' > ${now.toISOString()}::timestamptz - interval '7 days'))
        OR (NOT EXISTS (SELECT 1 FROM "ChatFileReference" r WHERE r."key" = f."key") AND (
          (f."firstAttachedAt" IS NULL AND f."createdAt" <= ${now.toISOString()}::timestamptz - interval '24 hours')
          OR (f."firstAttachedAt" IS NOT NULL AND f."unreferencedAt" <= ${now.toISOString()}::timestamptz - interval '7 days')
        ))
      ))
    )`;
}

export async function selectCleanupFiles(db: StorageDatabase, { now = new Date(), dryRun = false, limit = 250 } = {}): Promise<CleanupFile[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 250) throw new Error("Invalid cleanup batch size.");
  if (dryRun) return db.execute<CleanupFile>(sql`SELECT f."key", f."etag" FROM "ChatFile" f WHERE ${cleanupEligibility(now)} ORDER BY f."createdAt", f."key" LIMIT ${limit}`);
  return db.transaction(async tx => {
    const candidates = await tx.execute<CleanupFile>(sql`SELECT f."key", f."etag" FROM "ChatFile" f WHERE ${cleanupEligibility(now)} ORDER BY f."createdAt", f."key" LIMIT ${limit} FOR UPDATE OF f SKIP LOCKED`);
    if (candidates.length) await tx.execute(sql`UPDATE "ChatFile" SET "state" = 'deleting', "retryAt" = ${now.toISOString()}::timestamptz + interval '10 minutes' WHERE "key" IN (${sql.join(candidates.map(f => sql`${f.key}`), sql`, `)})`);
    return candidates;
  });
}

// Account deletion hands the account's private files to the next daily
// cleanup, which still checks ownership and the ETag before each delete. A
// file that a live chat of another account or a shared configuration (hold)
// still uses is kept; the normal rules release it once that use ends.
export async function claimAccountFilesForCleanup(db: Pick<StorageDatabase, "execute">, userId: string) {
  await db.execute(sql`
    UPDATE "ChatFile" f SET "state" = 'deleting', "retryAt" = now()
    WHERE f."userId" = ${userId}::uuid AND f."state" IN ('reserved','ready')
      AND NOT EXISTS (SELECT 1 FROM "ChatFileHold" h WHERE h."key" = f."key")
      AND NOT EXISTS (SELECT 1 FROM "ChatFileReference" r JOIN "Chat" c ON c."id" = r."chatId" WHERE r."key" = f."key" AND c."deletedAt" IS NULL)`);
}

export type StorageCleanupResult = { ok: boolean; dryRun: boolean; scanned: number; registered: number; eligible: number; deleted: number; failed: number; deferred: number; inventoryComplete: boolean };

// The claim transaction has already made new attachments/restores fail closed.
// A failed/uncertain object deletion retains the claim for an idempotent retry.
export async function cleanClaimedFiles(files: CleanupFile[], actions: {
  remove: (file: CleanupFile) => Promise<void>;
  complete: (key: string) => Promise<void>;
  fail: (key: string) => Promise<void>;
  deadline: number;
}) {
  let index = 0;
  const result = { deleted: 0, failed: 0, deferred: 0 };
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (index < files.length && Date.now() < actions.deadline) {
      const file = files[index++];
      try {
        await actions.remove(file);
        await actions.complete(file.key);
        result.deleted++;
      } catch {
        result.failed++;
        await actions.fail(file.key).catch(() => undefined);
      }
    }
  }));
  result.deferred = files.length - index;
  return result;
}
