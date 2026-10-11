import { createHmac, randomUUID } from "node:crypto";
import { type APIRequestContext, request as client, expect, test } from "@playwright/test";
import { compare, hashSync } from "bcrypt-ts";
import postgres from "postgres";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Only runs against the disposable local audit database.");

function database() {
  const url = new URL(process.env.POSTGRES_URL ?? "");
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(url.hostname);
  expect(url.pathname).toMatch(/^\/khasigpt_audit_/);
  return postgres(url.toString(), { max: 2 });
}
const initial = "disposable-original-20261006";
const changed = "disposable-changed-20261006";
const alternative = "disposable-other-20261006";

async function fixture(sql: ReturnType<typeof postgres>, role = "regular") {
  const id = randomUUID(); const email = `${id}@example.test`;
  await sql`insert into "User" (id,email,password,role,"dateOfBirth","firstName","lastName")
    values (${id},${email},${hashSync(initial, 10)},${role},'1990-01-01','Session','Fixture')`;
  return { id, email };
}
async function webLogin(baseURL: string, email: string, password = initial) {
  const web = await client.newContext({ baseURL });
  const csrfToken = (await (await web.get("/api/auth/csrf")).json()).csrfToken;
  await web.post("/api/auth/callback/credentials", { form: { csrfToken, email, password, callbackUrl: `${baseURL}/chat` }, headers: { "X-Auth-Return-Redirect": "1" } });
  expect((await (await web.get("/api/auth/session")).json()).user?.id).toBeTruthy();
  return web;
}
async function mobileLogin(request: APIRequestContext, email: string, password = initial) {
  const response = await request.post("/api/mobile/auth/login", { data: { email, password } });
  expect(response.status()).toBe(200);
  return (await response.json()).token as string;
}
function bearer(token: string) { return { Authorization: `Bearer ${token}` }; }
function signed(payload: object) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", "isolated-audit-test-secret").update(body).digest("base64url")}`;
}
async function invalidWeb(web: APIRequestContext) {
  expect((await (await web.get("/api/auth/session")).json())?.user?.id).toBeFalsy();
  expect((await web.patch("/api/profile/password", { data: { currentPassword: initial, password: changed, confirmPassword: changed } })).status()).toBe(401);
}

test("password change revokes every old cookie and native token and blocks token exchange bypasses", async ({ request, baseURL }) => {
  const sql = database(); const user = await fixture(sql, "admin");
  const web = await webLogin(baseURL!, user.email); const secondWeb = await webLogin(baseURL!, user.email);
  const first = await mobileLogin(request, user.email); const second = await mobileLogin(request, user.email);
  const legacy = signed({ sub: user.id, exp: Date.now() + 60000 });
  const handoff = signed({ sub: user.id, exp: Date.now() + 60000, type: "mobile-oauth-handoff", sessionVersion: 0 });
  const cookies = (await web.storageState()).cookies.map(cookie => `${cookie.name}=${cookie.value}`).join("; ");
  try {
    expect((await request.get("/api/mobile/auth/session", { headers: bearer(legacy) })).status()).toBe(200);
    const input = { password: changed, confirmPassword: changed };
    expect((await web.patch("/api/profile/password", { data: input })).status()).toBe(400);
    const wrong = await web.patch("/api/profile/password", { data: { ...input, currentPassword: "wrong-fixture" } });
    expect(wrong.status()).toBe(400); expect((await wrong.json()).code).toBe("current_invalid");
    await sql`insert into "PasswordResetToken" ("userId", token, "expiresAt") values (${user.id},${randomUUID()},now()+interval '1 hour')`;
    const update = await request.patch("/api/profile/password", { headers: bearer(first), data: { ...input, currentPassword: initial } });
    expect(update.status()).toBe(200); expect(await update.json()).toMatchObject({ ok: true, signInRequired: true });
    expect((await sql`select "sessionVersion" from "User" where id=${user.id}`)[0].sessionVersion).toBe(1);
    expect(await sql`select id from "PasswordResetToken" where "userId"=${user.id}`).toHaveLength(0);
    for (const token of [first, second, legacy]) {
      expect((await request.get("/api/mobile/auth/session", { headers: bearer(token) })).status()).toBe(401);
      expect((await request.get("/api/mobile/auth/session-token", { headers: bearer(token) })).status()).toBe(401);
      const csrf = (await (await request.get("/api/auth/csrf")).json()).csrfToken;
      const login = await request.post("/api/auth/callback/mobile-token", { form: { csrfToken: csrf, token }, headers: { "X-Auth-Return-Redirect": "1" } });
      expect((await login.json()).url).toContain("error=");
    }
    await invalidWeb(web); await invalidWeb(secondWeb);
    const role = await request.get("/api/public/session-role?fresh=1", { headers: { Cookie: cookies } });
    expect(await role.json()).toMatchObject({ authenticated: false, role: null });
    expect((await request.get("/api/admin/activity", { headers: { Cookie: cookies } })).status()).toBe(403);
    const oauth = await request.get("/api/mobile/auth/oauth-complete", { headers: { Cookie: cookies }, maxRedirects: 0 });
    expect(oauth.headers().location).toContain("error=unauthorized");
    expect(oauth.headers().location).not.toContain("token=");
    const handoffResponse = await request.get(`/api/mobile/auth/google-complete?handoff=${handoff}`, { maxRedirects: 0 });
    expect(handoffResponse.headers().location).toContain("error=oauth_handoff_expired");
    expect((await request.post("/api/mobile/auth/login", { data: { email: user.email, password: initial } })).status()).toBe(401);
    const fresh = await mobileLogin(request, user.email, changed);
    expect((await (await request.get("/api/mobile/auth/session", { headers: bearer(fresh) })).json()).session.user.sessionVersion).toBe(1);
    const freshWeb = await webLogin(baseURL!, user.email, changed); await freshWeb.dispose();
  } finally { await web.dispose(); await secondWeb.dispose(); await sql.end(); }
});

test("simultaneous recovery consumes a reset link once and revokes cookies, tokens and other recovery links", async ({ request, baseURL }) => {
  const sql = database(); const user = await fixture(sql); const web = await webLogin(baseURL!, user.email);
  const token = await mobileLogin(request, user.email); const reset = randomUUID(); const expired = randomUUID();
  try {
    await sql`insert into "PasswordResetToken" ("userId",token,"expiresAt") values
      (${user.id},${reset},now()+interval '1 hour'),(${user.id},${randomUUID()},now()+interval '1 hour'),(${user.id},${expired},now()-interval '1 minute')`;
    const resetInput = (proof: string, password: string) => ({ token: proof, password, confirmPassword: password });
    expect((await request.post("/api/mobile/auth/password-reset/confirm", { data: resetInput(expired, changed) })).status()).toBe(400);
    const responses = await Promise.all([changed, alternative].map(password => request.post("/api/mobile/auth/password-reset/confirm", { data: resetInput(reset, password) })));
    expect(responses.map(response => response.status()).sort()).toEqual([200, 400]);
    const winner = responses[0].status() === 200 ? changed : alternative;
    const record = (await sql`select password,"sessionVersion" from "User" where id=${user.id}`)[0];
    expect(record.sessionVersion).toBe(1); expect(await compare(winner, record.password)).toBe(true);
    expect(await sql`select id from "PasswordResetToken" where "userId"=${user.id}`).toHaveLength(0);
    expect((await request.post("/api/mobile/auth/password-reset/confirm", { data: resetInput(reset, initial) })).status()).toBe(400);
    await invalidWeb(web);
    expect((await request.get("/api/mobile/auth/session", { headers: bearer(token) })).status()).toBe(401);
    const fresh = await mobileLogin(request, user.email, winner);
    expect((await request.get("/api/mobile/auth/session", { headers: bearer(fresh) })).status()).toBe(200);
  } finally { await web.dispose(); await sql.end(); }
});

test("concurrent password changes cannot overwrite the winning password using stale current-password proof", async ({ request }) => {
  const sql = database(); const user = await fixture(sql); const token = await mobileLogin(request, user.email);
  try {
    const responses = await Promise.all([changed, alternative].map(password => request.patch("/api/profile/password", { headers: bearer(token), data: { currentPassword: initial, password, confirmPassword: password } })));
    expect(responses.filter(response => response.status() === 200)).toHaveLength(1);
    expect(responses.filter(response => response.status() === 401)).toHaveLength(1);
    const winner = responses[0].status() === 200 ? changed : alternative;
    const record = (await sql`select password,"sessionVersion" from "User" where id=${user.id}`)[0];
    expect(record.sessionVersion).toBe(1); expect(await compare(winner, record.password)).toBe(true);
  } finally { await sql.end(); }
});

test("temporary database failure returns 503 and leaves cookies and native tokens usable after recovery", async ({ request, baseURL }) => {
  const sql = database(); const user = await fixture(sql); const web = await webLogin(baseURL!, user.email);
  const token = await mobileLogin(request, user.email);
  const original = (await web.storageState()).cookies.find(cookie => cookie.name === "authjs.session-token")?.value;
  try {
    await sql.begin(async (tx) => {
      await tx`lock table "User" in access exclusive mode`;
      const responses = await Promise.all([web.get("/api/auth/session"), request.get("/api/mobile/auth/session", { headers: bearer(token) })]);
      for (const response of responses) expect(response.status()).toBe(503);
      expect(responses[0].headers()["set-cookie"]).toBeUndefined();
    });
    expect((await web.storageState()).cookies.find(cookie => cookie.name === "authjs.session-token")?.value).toBe(original);
    expect((await (await web.get("/api/auth/session")).json()).user.id).toBe(user.id);
    expect((await request.get("/api/mobile/auth/session", { headers: bearer(token) })).status()).toBe(200);
  } finally { await web.dispose(); await sql.end(); }
});
