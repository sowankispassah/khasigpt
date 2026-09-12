import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

// Run with: node --conditions=react-server --import tsx tests/db/profile-completion.ts
// All fixtures and mutations are rolled back, including on assertion failure.
async function main() {
  const url = process.env.POSTGRES_POOLER_URL ?? process.env.POSTGRES_URL;
  assert.ok(url, "POSTGRES_URL is required");
  const client = postgres(
    url,
    { max: 1, prepare: false }
  );
  const rollback = new Error("fixture_rollback");
  const state = globalThis as typeof globalThis & {
    __khasigptAuthPostgresClient?: typeof client;
    __khasigptAuthDrizzleDb?: ReturnType<typeof drizzle>;
  };
  try {
    await drizzle(client).transaction(async (transaction) => {
      state.__khasigptAuthPostgresClient = client;
      state.__khasigptAuthDrizzleDb = transaction as unknown as ReturnType<typeof drizzle>;
      const { updateAuthUserProfileFields } = await import("../../lib/db/auth-queries");
      const id = randomUUID();
      await transaction.execute(sql`insert into "User" (id,email) values (${id},${`profile-${id.slice(0,8)}@example.invalid`})`);
      const input = { id, firstName: " Signup ", lastName: " Test ", dateOfBirth: "1986-07-16" };
      const started = Date.now();
      const saved = await updateAuthUserProfileFields(input);
      assert.ok(saved);
      assert.equal(saved?.dateOfBirth, input.dateOfBirth);
      assert.equal(saved?.firstName, "Signup");
      assert.equal(saved?.lastName, "Test");
      assert.equal("password" in saved, false);
      console.log(`First signup profile saved in ${Date.now()-started} ms`);
      assert.ok(await updateAuthUserProfileFields(input), "identical retry succeeds");
      assert.equal(await updateAuthUserProfileFields({ ...input, dateOfBirth: "1987-01-01" }), null, "DOB cannot change after save");
      const nameOnly = await updateAuthUserProfileFields({ id, firstName: "Updated" });
      assert.equal(nameOnly?.dateOfBirth, input.dateOfBirth);
      assert.equal(nameOnly?.lastName, "Test");
      assert.equal(await updateAuthUserProfileFields({ ...input, id: randomUUID() }), null);
      assert.equal(await updateAuthUserProfileFields({ ...input, id: "invalid" }), null);
      console.log("PASS: first save, retry, DOB lock, partial update, missing user, invalid ID, minimal response");
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    delete state.__khasigptAuthDrizzleDb;
    delete state.__khasigptAuthPostgresClient;
    await client.end();
  }
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
