import "server-only";

import { sql } from "drizzle-orm";
import type { drizzle } from "drizzle-orm/postgres-js";
import { withAdminDatabase } from "@/lib/db/admin-database";

type NotificationDatabase = Pick<ReturnType<typeof drizzle>, "execute">;

// The timestamp range uses User_createdAt_idx; each admin has a separate checkpoint.
export async function readNewUserCount(
	adminId: string,
	db: NotificationDatabase,
): Promise<number> {
	const rows = await db.execute<{ count: number }>(sql`
    SELECT (SELECT count(*)::integer FROM "User" u
      WHERE u."createdAt" > s."viewedThrough") AS "count"
    FROM "AdminUsersViewState" s WHERE s."adminId" = ${adminId}::uuid
  `);
	if (rows[0]) return rows[0].count;

	// Newly created/promoted admins start tracking on their first console visit.
	// DO NOTHING preserves a checkpoint created concurrently by another tab.
	await db.execute(sql`
    INSERT INTO "AdminUsersViewState" ("adminId") VALUES (${adminId}::uuid)
    ON CONFLICT ("adminId") DO NOTHING
  `);
	return readNewUserCount(adminId, db);
}

export async function acknowledgeNewUsers(
	adminId: string,
	checkedThrough: Date,
	db: NotificationDatabase,
) {
	await db.execute(sql`
    INSERT INTO "AdminUsersViewState" ("adminId", "viewedThrough")
    VALUES (${adminId}::uuid, LEAST(${checkedThrough.toISOString()}::timestamp, statement_timestamp()::timestamp))
    ON CONFLICT ("adminId") DO UPDATE SET "viewedThrough" =
      GREATEST("AdminUsersViewState"."viewedThrough", EXCLUDED."viewedThrough")
  `);
	return readNewUserCount(adminId, db);
}

export function getNewUserCount(adminId: string) {
	return withAdminDatabase("users.unviewed-count", (db) =>
		readNewUserCount(adminId, db),
	);
}

export function markNewUsersViewed(adminId: string, checkedThrough: Date) {
	return withAdminDatabase("users.mark-viewed", (db) =>
		acknowledgeNewUsers(adminId, checkedThrough, db),
	);
}
