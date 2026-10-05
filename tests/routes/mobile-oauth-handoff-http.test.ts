import { spawn } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { once } from "node:events";
import { request as client, expect, test } from "@playwright/test";
import postgres from "postgres";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires a disposable loopback database.");

function database() {
  const url = new URL(process.env.POSTGRES_URL ?? "");
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
  expect(url.pathname).toMatch(/^\/khasigpt_audit_/);
  return postgres(url.toString(), { max: 3 });
}
function handoff(userId: string, overrides: Record<string, unknown> = {}) {
  const body = Buffer.from(JSON.stringify({ sub: userId, type: "mobile-oauth-handoff", sessionVersion: 0,
    exp: Date.now() + 600_000, nonce: randomUUID(), ...overrides })).toString("base64url");
  return `${body}.${createHmac("sha256", "isolated-audit-test-secret").update(body).digest("base64url")}`;
}
const digest = (token: string) => createHash("sha256").update(token).digest("hex");
async function fixture(sql: ReturnType<typeof postgres>) {
  const id = randomUUID();
  await sql`insert into "User" (id,email,"firstName","dateOfBirth") values (${id},${`${id}@example.test`},'Handoff','1990-01-01')`;
  return id;
}

test("a handoff can mint exactly one native session across concurrent server instances", async ({ request }) => {
  const sql = database(); const id = await fixture(sql); const proof = handoff(id);
  const port = String(Number(process.env.PORT) + 1);
  const child = spawn(process.execPath, ["tests/support/production-server.cjs"], {
    env: { ...process.env, PORT: port, AUTH_URL: `http://localhost:${port}`, NEXTAUTH_URL: `http://localhost:${port}` },
    stdio: "ignore", windowsHide: true,
  });
  const second = await client.newContext({ baseURL: `http://localhost:${port}` });
  try {
    await expect.poll(async () => {
      try { return (await second.get("/api/auth/providers", { timeout: 1000 })).status(); } catch { return 0; }
    }, { timeout: 20_000 }).toBe(200);
    const responses = await Promise.all(Array.from({ length: 8 }, (_, i) => (i % 2 ? second : request)
      .get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 })));
    const urls = responses.map(response => new URL(response.headers().location));
    expect(urls.filter(url => url.searchParams.has("token"))).toHaveLength(1);
    expect(urls.filter(url => url.searchParams.get("error") === "oauth_handoff_expired")).toHaveLength(7);
    for (const response of responses) expect(response.headers()["cache-control"]).toContain("no-store");
    const access = urls.find(url => url.searchParams.has("token"))?.searchParams.get("token");
    expect(access).toBeTruthy();
    expect((await request.get("/api/mobile/auth/session", { headers: { Authorization: `Bearer ${access}` } })).status()).toBe(200);
    expect((await request.get("/api/mobile/auth/session", { headers: { Authorization: `Bearer ${proof}` } })).status()).toBe(401);
    for (const instance of [request, second]) {
      const replay = await instance.get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 });
      expect(replay.headers().location).not.toContain("token=");
    }
    expect(await sql`select * from "MobileOAuthHandoffReceipt" where "tokenHash"=${digest(proof)}`).toHaveLength(1);
    // Pre-deploy signed handoffs without a nonce are also consumed exactly once.
    const legacy = handoff(id, { nonce: undefined });
    const first = await request.get(`/api/mobile/auth/google-complete?handoff=${legacy}`, { maxRedirects: 0 });
    expect(first.headers().location).toContain("token=");
    expect((await second.get(`/api/mobile/auth/google-complete?handoff=${legacy}`, { maxRedirects: 0 })).headers().location).toContain("error=oauth_handoff_expired");
  } finally {
    await second.dispose();
    if (child.exitCode === null) { const exited = once(child, "exit"); child.kill(); await exited; }
    await sql.end();
  }
});

test("invalid, expired, revoked, disabled and deleted proofs do not create receipts or access", async ({ request }) => {
  const sql = database(); const id = await fixture(sql);
  try {
    const proofs = [handoff(id, { exp: Date.now() - 1 }), handoff(id, { exp: Date.now() + 700_000 }),
      handoff(id, { sessionVersion: 1 }), handoff(id, { type: "mobile-access" }), `${handoff(id)}.extra`,
      handoff(randomUUID())];
    for (const proof of proofs) {
      const result = await request.get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 });
      expect(result.headers().location).toContain("error=oauth_handoff_expired");
      expect(await sql`select * from "MobileOAuthHandoffReceipt" where "tokenHash"=${digest(proof)}`).toHaveLength(0);
    }
    const proof = handoff(id);
    await sql`update "User" set "isActive"=false where id=${id}`;
    expect((await request.get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 })).headers().location).toContain("error=oauth_handoff_expired");
    await sql`update "User" set "isActive"=true,"sessionVersion"=1 where id=${id}`;
    expect((await request.get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 })).headers().location).not.toContain("token=");
  } finally { await sql.end(); }
});

test("unavailable receipt storage never issues an access token and new sign-in recovers", async ({ request }) => {
  const sql = database(); const id = await fixture(sql);
  let release!: () => void; let locked!: () => void;
  const ready = new Promise<void>(resolve => { locked = resolve; });
  const hold = new Promise<void>(resolve => { release = resolve; });
  const lock = sql.begin(async tx => { await tx`lock table "MobileOAuthHandoffReceipt" in access exclusive mode`; locked(); await hold; });
  try {
    await ready;
    const result = await request.get(`/api/mobile/auth/google-complete?handoff=${handoff(id)}`, { maxRedirects: 0 });
    expect(result.headers().location).toContain("error=oauth_handoff_unavailable");
    expect(result.headers().location).not.toContain("token=");
    release(); await lock;
    expect((await request.get(`/api/mobile/auth/google-complete?handoff=${handoff(id)}`, { maxRedirects: 0 })).headers().location).toContain("token=");
  } finally { release(); await lock; await sql.end(); }
});

test("bounded indexed cleanup removes old receipts while retaining every live replay marker", async ({ request }) => {
  const sql = database(); const id = await fixture(sql);
  const old = Array.from({ length: 101 }, () => digest(randomUUID())); const recent = digest(randomUUID());
  try {
    await sql`insert into "MobileOAuthHandoffReceipt" ${sql(old.map(tokenHash => ({ tokenHash, expiresAt: new Date(Date.now() - 2 * 86400_000) })))}`;
    await sql`insert into "MobileOAuthHandoffReceipt" ("tokenHash","expiresAt") values (${recent},now()-interval '1 hour')`;
    const proof = handoff(id);
    expect((await request.get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 })).headers().location).toContain("token=");
    expect(await sql`select * from "MobileOAuthHandoffReceipt" where "tokenHash" in ${sql(old)}`).toHaveLength(1);
    expect(await sql`select * from "MobileOAuthHandoffReceipt" where "tokenHash"=${recent}`).toHaveLength(1);
    expect((await request.get(`/api/mobile/auth/google-complete?handoff=${proof}`, { maxRedirects: 0 })).headers().location).toContain("error=oauth_handoff_expired");
  } finally { await sql.end(); }
});
