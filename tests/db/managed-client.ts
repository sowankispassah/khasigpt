import assert from "node:assert/strict";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getLiteAppSettingsByKeysUncached, getLiteAppSettingUncached } from "../../lib/db/app-settings-lite";
import { createManagedClient, createManagedPool } from "../../lib/db/managed-client";

config({ path: ".env.local" });
config({ path: ".env", override: false });

async function main() {
  const url = process.env.POSTGRES_POOLER_URL || process.env.POSTGRES_URL;
  assert.ok(url);
  let created = 0;
  const clients: ReturnType<typeof postgres>[] = [];
  const managed = createManagedClient(() => {
    const client = postgres(url, { max: 1, prepare: false, fetch_types: false });
    clients.push(client);
    created += 1;
    return client;
  });
  const db = drizzle(managed);
  const started = Date.now();
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => db.execute(sql`select ${index}::integer as value`)));
    results.forEach((rows, index) => { assert.equal(rows[0].value, index); });
    const rollback = new Error("test rollback");
    await assert.rejects(db.transaction(async (tx) => {
      await tx.execute(sql`create temporary table startup_probe (value integer) on commit drop`);
      await tx.execute(sql`insert into startup_probe values (1)`);
      await tx.transaction(async (nested) => {
        assert.equal((await nested.execute(sql`select count(*)::integer as count from startup_probe`))[0].count, 1);
      });
      throw rollback;
    }), (error) => error === rollback);
    // Simulate a connection no longer reusable after the function went idle.
    await clients[0].end({ timeout: 0 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal((await db.execute(sql`select 42::integer as value`))[0].value, 42);
    assert.equal(created, 2);
    console.log(`PASS: concurrent reads, transaction/savepoint rollback, idle connection replacement (${Date.now() - started} ms)`);
  } finally {
    await managed.end({ timeout: 0 });
  }
  const pool = createManagedPool(() => postgres(url, { max: 1, prepare: false }), 2);
  try {
    const pooledDb = drizzle(pool);
    const rows = await Promise.all(Array.from({ length: 4 }, () => pooledDb.execute(sql`select now() as instant`)));
    for (const result of rows) assert.equal(typeof result[0].instant, "string", "Drizzle parsers apply to every connection");
    console.log("PASS: configured parallel connections retain Drizzle serialization");
  } finally {
    await pool.end({ timeout: 0 });
  }
  const keys = ["chat.studyMode.enabled", "chat.jobs.enabled", "calculator.enabled", "test.nonexistent.startup-key"];
  try {
    const expected = new Map((await getLiteAppSettingsByKeysUncached(keys)).map((row) => [row.key, row.value]));
    const values = await Promise.all(keys.map((key) => getLiteAppSettingUncached(key)));
    values.forEach((value, index) => { assert.deepEqual(value, expected.get(keys[index]) ?? null); });
    console.log("PASS: batched scalar settings preserve global modes and missing values");
  } finally {
    await (globalThis as typeof globalThis & { __khasigptLitePostgresClient?: ReturnType<typeof postgres> }).__khasigptLitePostgresClient?.end({ timeout: 0 });
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
