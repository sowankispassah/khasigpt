import "server-only";

import { sql } from "drizzle-orm";
import { z } from "zod";
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
    // One snapshot avoids queuing four concurrent unprepared statements on the
    // production client's single pipeline. It also keeps totals/rows coherent.
    const rows = await db.execute<{ snapshot: string }>(sql`
      SELECT jsonb_build_object(
        'totals', (SELECT jsonb_build_object('bytes',COALESCE(sum("bytes"),0)::text,'files',COALESCE(sum("files"),0)::text,'alerts',count(*) FILTER (WHERE "bytes" >= ${STORAGE_ALERT_BYTES})) FROM "ChatStorageAccount"),
        'accounts', COALESCE((SELECT jsonb_agg(to_jsonb(a)) FROM (SELECT s."userId",s."bytes"::text AS bytes,s."files" FROM "ChatStorageAccount" s WHERE s."files" > 0 ORDER BY s."bytes" DESC,s."userId" LIMIT 51 OFFSET ${(page - 1) * 50}) a),'[]'::jsonb),
        'maintenance', (SELECT jsonb_build_object('lastRunAt',"lastRunAt",'lastResult',"lastResult",'inventoryCompletedAt',"inventoryCompletedAt") FROM "ChatStorageMaintenance" WHERE id=1),
        'pending', (SELECT jsonb_build_object('pending',count(*) FILTER (WHERE state='deleting'),'failed',count(*) FILTER (WHERE state='deleting' AND failures>0),'unknown',count(*) FILTER (WHERE NOT confirmed AND state<>'deleted')) FROM "ChatFile")
      )::text AS snapshot
    `);
    if (!rows[0]?.snapshot) throw new Error("Storage snapshot unavailable.");
    const integer = z.number().int().nonnegative();
    const snapshot = z.object({
      totals: z.object({ bytes: z.string().regex(/^\d+$/), files: z.string().regex(/^\d+$/), alerts: integer }),
      accounts: z.array(z.object({ userId: z.string().uuid(), bytes: z.string().regex(/^\d+$/), files: integer })),
      maintenance: z.object({ lastRunAt: z.string().nullable(), lastResult: z.unknown(), inventoryCompletedAt: z.string().nullable() }).nullable(),
      pending: z.object({ pending: integer, failed: integer, unknown: integer }),
    }).parse(JSON.parse(rows[0].snapshot));
    return { ...snapshot, accounts: snapshot.accounts.slice(0, 50), hasNext: snapshot.accounts.length > 50 };
  });
}
