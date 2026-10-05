import { createHmac } from "node:crypto";
import postgres from "postgres";
import { expect, test } from "../fixtures";

test.skip(process.env.ISOLATED_TEST_RUN !== "1", "Requires a disposable local database.");

test("real web and native sessions cannot bypass launch restrictions with explicit grants", async ({ adaContext, request }) => {
  const databaseUrl = process.env.POSTGRES_URL ?? "";
  const parsed = new URL(databaseUrl);
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(parsed.hostname);
  expect(parsed.pathname).toMatch(/^\/khasigpt_audit_/);
  const sql = postgres(databaseUrl, { max: 1 });
  const user = (await (await adaContext.request.get("/api/auth/session")).json()).user;
  expect(user.role).toBe("regular");
  const keys = ["chat.voice.web.enabled", "chat.voice.android.enabled", "chat.liveTranslation.web.enabled", "chat.liveTranslation.android.enabled"];
  const original = await sql`select key, value from "AppSetting" where key in ${sql(keys)}`;
  const encoded = Buffer.from(JSON.stringify({ sub: user.id, exp: Date.now() + 120_000 })).toString("base64url");
  const bearer = `${encoded}.${createHmac("sha256", "isolated-audit-test-secret").update(encoded).digest("base64url")}`;
  const paths = ["/api/chat/voice-token", "/api/chat/voice-turn", "/api/live-translation/token", "/api/live-translation/session"];
  try {
    for (const key of keys) {
      await sql`insert into "AppSetting" (key,value,"updatedAt") values (${key},'"enabled"'::json,now()) on conflict (key) do update set value=excluded.value,"updatedAt"=excluded."updatedAt"`;
      await sql`insert into "UserFeatureAccessOverride" ("userId","featureKey",enabled) values (${user.id},${key},true) on conflict ("userId","featureKey") do update set enabled=true`;
    }
    for (const path of paths) {
      expect((await request.post(path, { data: {} })).status(), `${path}:anonymous`).toBe(401);
      const web = await adaContext.request.post(path, { data: {} });
      const native = await request.post(path.replace("/api/", "/api/mobile/"), { data: {}, headers: { Authorization: `Bearer ${bearer}` } });
      for (const response of [web, native]) {
        expect(response.status(), path).toBe(404);
        expect(response.headers()["cache-control"]).toContain("no-store");
        expect(await response.json()).toMatchObject({ liveSupported: false, reason: "feature-disabled" });
      }
    }
    const webFeatures = await (await adaContext.request.get("/api/web/features")).json();
    const nativeFeatures = await (await request.get("/api/mobile/features", { headers: { Authorization: `Bearer ${bearer}` } })).json();
    expect(webFeatures.featureAccess).toMatchObject({ liveTranslation: false, voiceChat: false });
    expect(nativeFeatures.featureAccess).toMatchObject({ liveTranslation: false, liveTranslationAndroid: false, liveTranslationWeb: false, voiceChat: false, voiceChatAndroid: false, voiceChatWeb: false });
    // Streaming Next pages may already have committed HTTP 200 before notFound.
    // Verify the rendered denial, in addition to the strict API status above.
    await adaContext.page.goto("/live-translation");
    await expect(adaContext.page.getByRole("heading", { name: "404", exact: true })).toBeVisible();
  } finally {
    await sql`delete from "UserFeatureAccessOverride" where "userId"=${user.id} and "featureKey" in ${sql(keys)}`;
    for (const key of keys) {
      const previous = original.find(row => row.key === key);
      if (previous) await sql`update "AppSetting" set value=${JSON.stringify(previous.value)}::json,"updatedAt"=now() where key=${key}`;
      else await sql`delete from "AppSetting" where key=${key}`;
    }
    await sql.end();
  }
});
