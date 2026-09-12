import { createHmac, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { config } from "dotenv";
import postgres from "postgres";

config({ path: ".env.local" });
config({ path: ".env", override: false });

test("new regular user hydrates all startup data and respects global restrictions", async ({ request, baseURL }) => {
  const origin = process.env.PROFILE_TEST_ORIGIN ?? baseURL;
  const url = process.env.POSTGRES_POOLER_URL || process.env.POSTGRES_URL;
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!origin || !url || !secret) throw new Error("Startup test requires database, auth and origin configuration");
  const db = postgres(url, { max: 1, prepare: false });
  const id = randomUUID();
  try {
    await db`insert into "User" (id,email,"firstName","lastName","dateOfBirth") values (${id},${`startup-${id.slice(0,8)}@example.invalid`},'Startup','Test','1986-07-16')`;
    const settings = await db`select key,value from "AppSetting" where key in ('calculator.enabled','chat.jobs.enabled','chat.studyMode.enabled')`;
    const expected = Object.fromEntries(settings.map((row) => [row.key, row.value === "enabled" || row.value === true]));
    const payload = Buffer.from(JSON.stringify({ sub: id, exp: Date.now() + 240_000 })).toString("base64url");
    const token = `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
    const headers = { Authorization: `Bearer ${token}` };
    const get = async (path: string) => {
      const started = Date.now();
      const response = await request.get(`${origin}${path}`, { headers, timeout: 30_000 });
      expect(response.status(), path).toBe(200);
      console.log(`${path}: ${Date.now() - started} ms`);
      return response.json();
    };
    const [startup, full, history, subscriptions, features, language] = await Promise.all([
      get("/api/mobile/bootstrap?phase=startup&lang=en"),
      get("/api/mobile/bootstrap?phase=full&lang=en"),
      get("/api/mobile/chat-history?limit=20"),
      get("/api/mobile/subscriptions"),
      get("/api/mobile/features"),
      get("/api/mobile/i18n?lang=en"),
    ]);
    expect(startup.featureAccess).toMatchObject({ study: false, jobs: false, calculator: false });
    expect(history).toMatchObject({ chats: [], hasMore: false });
    expect(history.degraded).not.toBe(true);
    expect(subscriptions.meta.degraded).toBe(false);
    expect(subscriptions.balance.plan).toBeNull();
    expect(subscriptions.sessions).toEqual([]);
    for (const result of [full, features]) {
      expect(result.featureAccess).toMatchObject({
        study: expected["chat.studyMode.enabled"] ?? false,
        jobs: expected["chat.jobs.enabled"] ?? false,
        calculator: expected["calculator.enabled"] ?? false,
      });
    }
    expect(features.meta.featureAccessStatus).toBe("confirmed");
    expect(features.meta.userFeatureAccessStatus).toBe("confirmed");
    expect(full.billing.balance).not.toBeNull();
    expect(full.meta.degradedSections).not.toContain("i18n");
    expect(full.meta.degradedSections).not.toContain("features");
    expect(full.meta.degradedSections).not.toContain("billing");
    console.log(`Full bootstrap degraded sections: ${JSON.stringify(full.meta.degradedSections)}`);
    expect(Object.keys(language.i18n.dictionary).length).toBeGreaterThan(100);
    expect(language.meta.degraded).toBe(false);
    const available = language.i18n.languages.find((entry: { code: string; isActive: boolean; syncUiLanguage: boolean }) => entry.code !== "en" && entry.isActive && entry.syncUiLanguage);
    if (available) {
      const translated = await get(`/api/mobile/i18n?lang=${encodeURIComponent(available.code)}`);
      expect(translated.i18n.activeLanguage.code).toBe(available.code);
      expect(translated.meta.degraded).toBe(false);
    }
  } finally {
    await db`delete from "AuditLog" where "actorId"=${id}`;
    await db`delete from "User" where id=${id}`;
    await db.end();
  }
});
