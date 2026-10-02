// All fixtures and notification changes are rolled back, including on failure.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env" });

async function main() {
	if (!process.env.POSTGRES_URL) throw new Error("POSTGRES_URL is required.");
	const client = postgres(process.env.POSTGRES_URL, {
		max: 1,
		prepare: false,
		connect_timeout: 10,
	});
	const database = drizzle(client);
	const { user, adminUsersViewState } = await import("../lib/db/schema");
	const { acknowledgeNewUsers, readNewUserCount } = await import(
		"../lib/admin/user-notifications"
	);
	const rollback = new Error("verification_rollback");
	try {
		await database.transaction(async (db) => {
			const admins = [randomUUID(), randomUUID(), randomUUID()];
			const now = Date.now();
			const earlier = new Date(now - 30_000);
			const cutoff = new Date(now - 15_000);
			await db
				.insert(user)
				.values(
					admins.map((id) => ({
						id,
						email: `badge-${id.slice(0, 8)}@example.invalid`,
						role: "admin" as const,
						createdAt: new Date(now - 60_000),
					})),
				);
			await db.insert(adminUsersViewState).values([
				{ adminId: admins[0], viewedThrough: earlier },
				{ adminId: admins[1], viewedThrough: cutoff },
			]);
			const beforeA = await readNewUserCount(admins[0], db);
			const beforeB = await readNewUserCount(admins[1], db);
			const ids = [randomUUID(), randomUUID(), randomUUID()];
			await db
				.insert(user)
				.values(
					ids.map((id, index) => ({
						id,
						email: `badge-${id.slice(0, 8)}@example.invalid`,
						createdAt: new Date(now - [60_000, 20_000, 10_000][index]),
					})),
				);
			assert.equal(await readNewUserCount(admins[0], db), beforeA + 2);
			assert.equal(await readNewUserCount(admins[1], db), beforeB + 1);
			// Signup after the captured page cutoff stays unseen, and other admins are unaffected.
			assert.equal(
				await acknowledgeNewUsers(admins[0], cutoff, db),
				beforeB + 1,
			);
			assert.equal(await readNewUserCount(admins[1], db), beforeB + 1);
			assert.equal(
				await acknowledgeNewUsers(admins[0], earlier, db),
				beforeB + 1,
			);
			await db.delete(user).where(eq(user.id, ids[2]));
			assert.equal(await readNewUserCount(admins[0], db), beforeB);
			await acknowledgeNewUsers(
				admins[0],
				new Date("2100-01-01T00:00:00Z"),
				db,
			);
			const [state] = await db
				.select()
				.from(adminUsersViewState)
				.where(eq(adminUsersViewState.adminId, admins[0]));
			const [clock] = await db.execute<{ epoch: string }>(
				sql`SELECT extract(epoch FROM statement_timestamp()) AS epoch`,
			);
			assert.ok(state.viewedThrough.getTime() <= Number(clock.epoch) * 1000);
			// A new admin gets a durable baseline, rather than all historical accounts.
			assert.equal(await readNewUserCount(admins[2], db), 0);
			assert.equal(await readNewUserCount(admins[2], db), 0);
			console.info(
				"Verified admin isolation, signup cutoff, monotonic acknowledgement, future bound, deletion, and first-visit baseline. Fixtures rolled back.",
			);
			throw rollback;
		});
	} catch (error) {
		if (error !== rollback) throw error;
	} finally {
		await client.end();
	}
}
main().catch((error) => {
	console.error(
		"Admin user notification verification failed.",
		error instanceof assert.AssertionError
			? {
					actual: error.actual,
					expected: error.expected,
					operator: error.operator,
					stack: error.stack,
				}
			: {
					name: error?.name,
					code: error?.code,
					message: error?.message?.replace(
						/postgres(?:ql)?:\/\/\S+/g,
						"[redacted]",
					),
				},
	);
	process.exitCode = 1;
});
