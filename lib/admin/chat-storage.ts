import "server-only";

import { sql } from "drizzle-orm";
import { withAdminDatabase } from "@/lib/db/admin-database";
import { STORAGE_ALERT_BYTES } from "@/lib/uploads/storage-lifecycle";

export function getStorageAlertCount() {
  return withAdminDatabase("storage.alert-count", async db => {
    const rows = await db.execute<{ count: number }>(sql`SELECT count(*)::integer AS count FROM "ChatStorageAccount" WHERE "bytes" >= ${STORAGE_ALERT_BYTES}`);
    return rows[0]?.count ?? 0;
  });
}

export function getChatStorageSummary(page = 1) {
  return withAdminDatabase("storage.summary", async db => {
    const [totals, accounts, maintenance, pending] = await Promise.all([
      db.execute<{ bytes: string; files: string; alerts: number }>(sql`SELECT COALESCE(sum("bytes"),0)::text AS bytes, COALESCE(sum("files"),0)::text AS files, count(*) FILTER (WHERE "bytes" >= ${STORAGE_ALERT_BYTES})::integer AS alerts FROM "ChatStorageAccount"`),
      db.execute<{ userId: string; bytes: string; files: number }>(sql`SELECT "userId", "bytes"::text AS bytes, "files" FROM "ChatStorageAccount" WHERE "files" > 0 ORDER BY "bytes" DESC, "userId" LIMIT 51 OFFSET ${(page - 1) * 50}`),
      db.execute<{ lastRunAt: Date | null; lastResult: unknown; inventoryCompletedAt: Date | null }>(sql`SELECT "lastRunAt", "lastResult", "inventoryCompletedAt" FROM "ChatStorageMaintenance" WHERE "id" = 1`),
      db.execute<{ pending: number; failed: number; unknown: number }>(sql`SELECT count(*) FILTER (WHERE "state" = 'deleting')::integer AS pending, count(*) FILTER (WHERE "state" = 'deleting' AND "failures" > 0)::integer AS failed, count(*) FILTER (WHERE NOT "confirmed" AND "state" <> 'deleted')::integer AS unknown FROM "ChatFile"`),
    ]);
    return { totals: totals[0], accounts: accounts.slice(0, 50), hasNext: accounts.length > 50, maintenance: maintenance[0], pending: pending[0] };
  });
}
