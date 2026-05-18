import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
} from "@/lib/constants";
import { expect, test } from "../fixtures";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is required for translate route tests");
}

const sql = postgres(postgresUrl, {
  max: 1,
});

const previousSettings = new Map<string, unknown>();
const hadSettings = new Set<string>();
const overriddenSettings = new Map<string, unknown>([
  [TRANSLATE_FEATURE_FLAG_KEY, "enabled"],
  [TRANSLATE_PROVIDER_MODE_SETTING_KEY, "ai"],
]);

const testId = randomUUID().slice(0, 8).toLowerCase();
const unsupportedLanguageCode = `lv-${testId}`;
const textOnlyLanguageCode = `tx-${testId}`;
const unsupportedModelKey = `pw-live-${testId}`;
let unsupportedSpeechModelId: string | null = null;

test.describe.serial("/api/translate", () => {
  test.beforeAll(async () => {
    const existingSettingRows = await sql<{ key: string; value: unknown }[]>`
      select "key", "value"
      from "AppSetting"
      where "key" in ${sql([...overriddenSettings.keys()])}
    `;

    for (const setting of existingSettingRows) {
      hadSettings.add(setting.key);
      previousSettings.set(setting.key, setting.value);
    }

    for (const [key, value] of overriddenSettings) {
      await sql`
        insert into "AppSetting" ("key", "value", "updatedAt")
        values (${key}, ${JSON.stringify(value)}::jsonb, now())
        on conflict ("key")
        do update set
          "value" = excluded."value",
          "updatedAt" = excluded."updatedAt"
      `;
    }

    const [modelRow] = await sql<{ id: string }[]>`
      insert into "ModelConfig" ("key", "provider", "providerModelId", "displayName")
      values (
        ${unsupportedModelKey},
        'google',
        'gemini-2.5-flash',
        'Playwright Unsupported Live Model'
      )
      returning id
    `;

    unsupportedSpeechModelId = modelRow?.id ?? null;

    if (!unsupportedSpeechModelId) {
      throw new Error("Failed to create unsupported speech model fixture");
    }

    await sql`
      insert into "TranslationFeatureLanguage" (
        "code",
        "name",
        "isDefault",
        "isActive",
        "speechModelConfigId"
      )
      values (
        ${unsupportedLanguageCode},
        'Unsupported Live Language',
        false,
        true,
        ${unsupportedSpeechModelId}
      )
    `;

    await sql`
      insert into "TranslationFeatureLanguage" (
        "code",
        "name",
        "isDefault",
        "isActive"
      )
      values (
        ${textOnlyLanguageCode},
        'No Model Language',
        false,
        true
      )
    `;
  });

  test.afterAll(async () => {
    await sql`
      delete from "TranslationFeatureLanguage"
      where "code" in ${sql([unsupportedLanguageCode, textOnlyLanguageCode])}
    `;

    if (unsupportedSpeechModelId) {
      await sql`
        delete from "ModelConfig"
        where id = ${unsupportedSpeechModelId}
      `;
    }

    for (const [key] of overriddenSettings) {
      if (hadSettings.has(key)) {
        await sql`
          update "AppSetting"
          set
            "value" = ${JSON.stringify(previousSettings.get(key))}::jsonb,
            "updatedAt" = now()
          where "key" = ${key}
        `;
      } else {
        await sql`
          delete from "AppSetting"
          where "key" = ${key}
        `;
      }
    }

    await sql.end({ timeout: 5 });
  });

  test("rejects unauthenticated live-token access", async ({ request }) => {
    const response = await request.post("/api/translate/live-token", {
      data: {
        targetLanguageCode: "en",
      },
    });

    expect(response.status()).toBe(401);
    const payload = await response.json();
    expect(payload).toMatchObject({
      message: "Unauthorized",
    });
  });

  test("returns 400 for an unavailable live target language", async ({
    adaContext,
  }) => {
    const response = await adaContext.request.post("/api/translate/live-token", {
      data: {
        targetLanguageCode: "missing-live",
      },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      message: "Target language is unavailable for live translation.",
    });
  });

  test("returns structured browser-fallback metadata for unsupported speech models", async ({
    adaContext,
  }) => {
    const response = await adaContext.request.post("/api/translate/live-token", {
      data: {
        targetLanguageCode: unsupportedLanguageCode,
      },
    });

    expect(response.status()).toBe(200);
    const payload = await response.json();
    expect(payload).toMatchObject({
      liveSupported: false,
      reason: "speech-model-unsupported",
    });
  });

  test("keeps typed translation validation unchanged when no text model is configured", async ({
    adaContext,
  }) => {
    const response = await adaContext.request.post("/api/translate", {
      data: {
        mode: "text",
        sourceText: "hello there",
        targetLanguageCode: textOnlyLanguageCode,
      },
    });

    expect(response.status()).toBe(400);
    const payload = await response.json();
    expect(payload).toMatchObject({
      message: "No model is configured for the selected target language.",
    });
  });

  test("returns 404 when the translate feature is disabled", async ({
    adaContext,
  }) => {
    await sql`
      update "AppSetting"
      set
        "value" = ${JSON.stringify("disabled")}::jsonb,
        "updatedAt" = now()
      where "key" = ${TRANSLATE_FEATURE_FLAG_KEY}
    `;

    const response = await adaContext.request.post("/api/translate/live-token", {
      data: {
        targetLanguageCode: unsupportedLanguageCode,
      },
    });

    expect(response.status()).toBe(404);

    await sql`
      update "AppSetting"
      set
        "value" = ${JSON.stringify("enabled")}::jsonb,
        "updatedAt" = now()
      where "key" = ${TRANSLATE_FEATURE_FLAG_KEY}
    `;
  });
});
