import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { lockUserWallet } from "../lib/db/wallet-lock";

// Read-only verification: no application rows, schema, or settings are changed.
// Locks use fresh random identifiers, so they cannot conflict with real users.
config({ path: ".env.local" });
config({ path: ".env" });

async function main() {
  const url = process.env.POSTGRES_POOLER_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error("A database URL is required");
  const sql = postgres(url, {
    max: 2, prepare: false, fetch_types: false, connect_timeout: 5,
    connection: { application_name: "khasigpt-read-only-audit", statement_timeout: 5000 },
  });
  try {
    const settings = await sql`select current_setting('statement_timeout') as timeout`;
    console.info("Configured SQL deadline:", settings[0].timeout);
    assert.equal(settings[0].timeout, "5s");
    const userId = randomUUID();
    let releaseFirst!: () => void;
    let firstLocked!: () => void;
    const acquired = new Promise<void>((resolve) => { firstLocked = resolve; });
    const release = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = drizzle(sql).transaction(async (transaction) => {
      await lockUserWallet(transaction, userId);
      firstLocked();
      await release;
    });
    await Promise.race([acquired, first]);
    try {
      const [probe] = await sql.begin(async (transaction) => {
        const rows = await transaction`
          select
            pg_try_advisory_xact_lock(hashtextextended(${`khasigpt:wallet:${userId}`}, 0)) as same_user,
            pg_try_advisory_xact_lock(hashtextextended(${`khasigpt:wallet:${randomUUID()}`}, 0)) as other_user`;
        return rows;
      });
      assert.equal(probe.same_user, false);
      assert.equal(probe.other_user, true);
      console.info("Concurrent probes: same wallet excluded; unrelated wallet available.");
    } finally {
      releaseFirst();
      await first;
    }
    const [released] = await sql.begin(async (transaction) => transaction`
      select pg_try_advisory_xact_lock(hashtextextended(${`khasigpt:wallet:${userId}`}, 0)) as available`);
    assert.equal(released.available, true);
    const started = Date.now();
    await assert.rejects(sql.begin(async (transaction) => {
      await transaction`set local statement_timeout = '100ms'`;
      await transaction`select pg_sleep(1)`;
    }), (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "57014"));
    assert.equal((await sql`select 1 as healthy`)[0].healthy, 1);
    console.info("Statement cancellation and subsequent query passed in", Date.now() - started, "ms");
  } finally {
    await sql.end({ timeout: 1 });
  }
}

main().catch((error) => {
  console.error("Database guardrail verification failed:", error instanceof Error ? error.message : "unknown error");
  process.exitCode = 1;
});
