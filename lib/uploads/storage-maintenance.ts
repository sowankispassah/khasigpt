import "server-only";

import { randomUUID } from "node:crypto";
import { BlobNotFoundError, del, head, list } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { privateStorageOptions } from "@/lib/uploads/private-documents";
import { privateFileOwner } from "@/lib/uploads/private-file-key";
import { cleanClaimedFiles, type StorageCleanupResult, selectCleanupFiles } from "@/lib/uploads/storage-lifecycle";
import { observeChatFiles } from "@/lib/uploads/storage-records";

export async function runChatStorageMaintenance({ dryRun = false } = {}) {
  const leaseId = randomUUID();
  const options = privateStorageOptions();
  const deadline = Date.now() + 210_000;
  const leased = await withAdminDatabase("storage.lease", db => db.execute<{ prefix: number; cursor: string | null; inventoryCompletedAt: string | null }>(sql`
    UPDATE "ChatStorageMaintenance" SET "leaseId" = ${leaseId}::uuid, "leaseUntil" = now() + interval '5 minutes'
    WHERE "id" = 1 AND ("leaseUntil" IS NULL OR "leaseUntil" < now()) RETURNING "prefix", "cursor", "inventoryCompletedAt"::text AS "inventoryCompletedAt"
  `), { retry: false });
  if (!leased[0]) return { skipped: true as const };
  const state = leased[0];
  const result: StorageCleanupResult = { ok: false, dryRun, scanned: 0, registered: 0, eligible: 0, deleted: 0, failed: 0, deferred: 0, inventoryComplete: !!state.inventoryCompletedAt };
  try {
    // Cursor is durable: a large store is reconciled over bounded daily runs.
    for (let page = 0; page < 2 && Date.now() < deadline; page++) {
      const blobs = await list({ ...options, prefix: state.prefix === 0 ? "uploads/" : "generated-images/", cursor: state.cursor ?? undefined, limit: 500, abortSignal: AbortSignal.timeout(20_000) });
      result.scanned += blobs.blobs.length;
      result.registered += await observeChatFiles(blobs.blobs);
      state.cursor = blobs.hasMore ? blobs.cursor ?? null : null;
      if (blobs.hasMore && !state.cursor) throw new Error("Storage inventory cursor unavailable.");
      if (!blobs.hasMore) {
        if (state.prefix === 1) { result.inventoryComplete = true; state.inventoryCompletedAt = new Date().toISOString(); }
        state.prefix = state.prefix === 0 ? 1 : 0;
      }
      await withAdminDatabase("storage.cursor", db => db.execute(sql`UPDATE "ChatStorageMaintenance" SET "prefix" = ${state.prefix}, "cursor" = ${state.cursor}, "inventoryCompletedAt" = ${state.inventoryCompletedAt}::timestamptz WHERE "id" = 1 AND "leaseId" = ${leaseId}::uuid`), { retry: false });
    }
    const files = await withAdminDatabase("storage.candidates", db => selectCleanupFiles(db, { dryRun }), { retry: false });
    result.eligible = files.length;
    if (!dryRun) Object.assign(result, await cleanClaimedFiles(files, {
      deadline,
      async remove(file) {
        // Only private, app-owned namespaces may reach the destructive adapter.
        if (!privateFileOwner(file.key)) throw new Error("Invalid cleanup target.");
        let metadata: Awaited<ReturnType<typeof head>>;
        try { metadata = await head(file.key, { ...options, abortSignal: AbortSignal.timeout(20_000) }); }
        catch (error) { if (error instanceof BlobNotFoundError) return; throw error; }
        if (metadata.pathname !== file.key || file.etag && metadata.etag !== file.etag) throw new Error("Storage object changed; review required.");
        await del(metadata.url, { ...options, ifMatch: metadata.etag, abortSignal: AbortSignal.timeout(20_000) });
      },
      async complete(key) {
        await withAdminDatabase("storage.deleted", db => db.execute(sql`UPDATE "ChatFile" SET "state" = 'deleted', "deletedAt" = now(), "retryAt" = NULL WHERE "key" = ${key} AND "state" = 'deleting'`), { retry: false });
      },
      async fail(key) {
        await withAdminDatabase("storage.retry", db => db.execute(sql`UPDATE "ChatFile" SET "failures" = "failures" + 1, "retryAt" = now() + interval '1 hour' WHERE "key" = ${key} AND "state" = 'deleting'`), { retry: false });
      },
    }));
    result.ok = result.failed === 0;
    return result;
  } finally {
    await withAdminDatabase("storage.finished", db => db.execute(sql`UPDATE "ChatStorageMaintenance" SET "leaseId" = NULL, "leaseUntil" = NULL, "lastRunAt" = now(), "lastResult" = ${JSON.stringify(result)}::jsonb WHERE "id" = 1 AND "leaseId" = ${leaseId}::uuid`), { retry: false });
  }
}
