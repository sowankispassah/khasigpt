import { readFileSync } from "node:fs";
import { encode } from "next-auth/jwt";
import postgres from "postgres";
import { expect, test } from "../fixtures";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires the disposable local database and production build.");

test("real Server Action rejects a stale admin cookie immediately after role revocation", async ({ adaContext, babbageContext, request }) => {
  const databaseUrl = process.env.POSTGRES_URL ?? "";
  const database = new URL(databaseUrl);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(database.hostname);
  expect(database.pathname).toMatch(/^\/khasigpt_audit_/);
  const sql = postgres(databaseUrl, { max: 1 });
  const actor = (await (await adaContext.request.get("/api/auth/session")).json()).user;
  const target = (await (await babbageContext.request.get("/api/auth/session")).json()).user;
  const manifest = JSON.parse(readFileSync(".next-isolated-tests/server/server-reference-manifest.json", "utf8"));
  const entry = Object.entries(manifest.node).find(([_id, value]) => (value as { exportedName: string }).exportedName === "setUserActiveStateAction");
  expect(entry).toBeDefined();
  const cookieName = "authjs.session-token";
  const now = Date.now();
  // A signed fixture cookie deliberately retains the original admin role.
  // Only the isolated harness's known test secret and disposable IDs are used.
  const token = await encode({ secret: "isolated-audit-test-secret", salt: cookieName, token: { ...actor, id: actor.id, role: "admin", imageVersion: null, dateOfBirth: "1990-01-01", roleRefreshedAt: now, dbRefreshedAt: now, allowPersonalKnowledge: false } });
  const headers = { Cookie: `${cookieName}=${token}`, "Next-Action": entry?.[0] ?? "", "Content-Type": "text/plain;charset=UTF-8", Origin: "http://localhost:3100" };
  const original = await sql`select id,role,"isActive" from "User" where id in ${sql([actor.id, target.id])}`;
  try {
    await sql`update "User" set role='admin',"isActive"=true where id=${actor.id}`;
    const allowed = await request.post("/admin/pricing", { headers, data: JSON.stringify([{ userId: target.id, isActive: false }]) });
    expect(allowed.status()).toBe(200);
    expect((await sql`select "isActive" from "User" where id=${target.id}`)[0].isActive).toBe(false);
    await sql`update "User" set role='regular' where id=${actor.id}`;
    const stale = await (await request.get("/api/auth/session", { headers: { Cookie: headers.Cookie } })).json();
    expect(stale.user.role).toBe("admin");
    const denied = await request.post("/admin/pricing", { headers, data: JSON.stringify([{ userId: target.id, isActive: true }]) });
    expect(denied.status()).toBeGreaterThanOrEqual(400);
    expect((await sql`select "isActive" from "User" where id=${target.id}`)[0].isActive).toBe(false);
    await sql`update "User" set role='admin',"isActive"=false where id=${actor.id}`;
    const inactive = await request.post("/admin/pricing", { headers, data: JSON.stringify([{ userId: target.id, isActive: true }]) });
    expect(inactive.status()).toBeGreaterThanOrEqual(400);
    expect((await sql`select "isActive" from "User" where id=${target.id}`)[0].isActive).toBe(false);
  } finally {
    for (const user of original) await sql`update "User" set role=${user.role},"isActive"=${user.isActive} where id=${user.id}`;
    await sql.end();
  }
});
