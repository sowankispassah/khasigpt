import { expect, test } from "@playwright/test";
import postgres from "postgres";

test("disabled production guest callbacks cannot create accounts or establish sessions", async ({ request, baseURL }) => {
  test.skip(process.env.ISOLATED_TEST_RUN !== "1" || process.env.ENABLE_GUEST_LOGIN !== "false", "Requires the isolated production server with guest login disabled");
  const databaseUrl = new URL(process.env.POSTGRES_URL ?? "http://invalid");
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(databaseUrl.hostname);
  expect(databaseUrl.pathname.startsWith("/khasigpt_audit_")).toBe(true);
  const sql = postgres(databaseUrl.toString(), { max: 1 });
  try {
    const countGuests = async () => Number((await sql`select count(*) as count from "User" where email like 'guest-%'`)[0].count);
    const before = await countGuests();
    const providers = await request.get("/api/auth/providers");
    expect(providers.status()).toBe(200);
    const providerData = await providers.json();
    expect(providerData.guest).toBeUndefined();
    expect(providerData.credentials).toBeDefined();
    expect(providerData["mobile-token"]).toBeDefined();

    const entry = await request.get("/api/auth/guest?redirectUrl=/chat");
    expect(entry.status()).toBe(403);
    const csrf = await request.get("/api/auth/csrf");
    const { csrfToken } = await csrf.json();
    expect(csrfToken).toBeTruthy();
    const callback = await request.post("/api/auth/callback/guest", {
      form: { csrfToken, callbackUrl: `${baseURL}/chat` },
      headers: { "X-Auth-Return-Redirect": "1" },
      maxRedirects: 0,
    });
    expect(callback.status()).toBeLessThan(500);
    const session = await request.get("/api/auth/session");
    expect((await session.json())?.user?.id).toBeUndefined();
    expect(await countGuests()).toBe(before);
  } finally {
    await sql.end();
  }
});
