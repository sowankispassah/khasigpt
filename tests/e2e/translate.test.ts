import { randomUUID } from "node:crypto";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";
import {
  TRANSLATE_FEATURE_FLAG_KEY,
  TRANSLATE_PROVIDER_MODE_SETTING_KEY,
  TRANSLATE_TARGET_LANGUAGE_COOKIE_NAME,
} from "@/lib/constants";
import { expect, test } from "../fixtures";

loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const postgresUrl = process.env.POSTGRES_URL;
if (!postgresUrl) {
  throw new Error("POSTGRES_URL is required for translate e2e tests");
}

const sql = postgres(postgresUrl, {
  max: 1,
});

const baseUrl = `http://localhost:${process.env.PORT || 3000}`;
const previousSettings = new Map<string, unknown>();
const hadSettings = new Set<string>();
const overriddenSettings = new Map<string, unknown>([
  [TRANSLATE_FEATURE_FLAG_KEY, "enabled"],
  [TRANSLATE_PROVIDER_MODE_SETTING_KEY, "ai"],
]);

const testId = randomUUID().slice(0, 8).toLowerCase();
const speechLanguageCode = `sp-${testId}`;

test.describe.serial("/translate", () => {
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

    await sql`
      insert into "TranslationFeatureLanguage" ("code", "name", "isDefault", "isActive")
      values (${speechLanguageCode}, 'Speech Fallback Language', false, true)
    `;
  });

  test.afterAll(async () => {
    await sql`
      delete from "TranslationFeatureLanguage"
      where "code" = ${speechLanguageCode}
    `;

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

  test("falls back to browser speech recognition when live startup is unavailable", async ({
    adaContext,
  }) => {
    test.fixme(
      true,
      "Headless Chromium does not reliably simulate SpeechRecognition fallback in this environment."
    );

    const { page } = adaContext;

    await page.addInitScript(() => {
      class FakeSpeechRecognition {
        continuous = true;
        interimResults = true;
        lang = "en-US";
        onend: (() => void) | null = null;
        onerror: ((event: { error?: string }) => void) | null = null;
        onresult:
          | ((event: { resultIndex: number; results: Array<unknown> }) => void)
          | null = null;
        stopped = false;

        start() {
          this.stopped = false;
          window.setTimeout(() => {
            if (this.stopped) {
              return;
            }

            if (typeof this.onresult === "function") {
              this.onresult({
                resultIndex: 0,
                results: [
                  {
                    0: { transcript: "hello from fake mic" },
                    isFinal: true,
                    length: 1,
                  },
                ],
              });
            }
          }, 50);
        }

        stop() {
          this.stopped = true;
          if (typeof this.onend === "function") {
            this.onend();
          }
        }
      }

      const recognitionCtor = FakeSpeechRecognition as any;
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: recognitionCtor,
        writable: true,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: recognitionCtor,
        writable: true,
      });
    });

    await page.route("**/api/translate/live-token", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          liveSupported: false,
          reason: "speech-model-missing",
          message: "No live speech model is configured for this language.",
        }),
      });
    });

    await page.route("**/api/translate", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          translatedText: "bonjour from mock",
        }),
      });
    });

    await page.context().addCookies([
      {
        name: TRANSLATE_TARGET_LANGUAGE_COOKIE_NAME,
        value: encodeURIComponent(speechLanguageCode),
        url: baseUrl,
      },
    ]);

    await page.goto("/translate");
    await page.evaluate(() => {
      class FakeSpeechRecognition {
        continuous = true;
        interimResults = true;
        lang = "en-US";
        onend: (() => void) | null = null;
        onerror: ((event: { error?: string }) => void) | null = null;
        onresult:
          | ((event: { resultIndex: number; results: Array<unknown> }) => void)
          | null = null;
        stopped = false;

        start() {
          this.stopped = false;
          window.setTimeout(() => {
            if (this.stopped || typeof this.onresult !== "function") {
              return;
            }

            this.onresult({
              resultIndex: 0,
              results: [
                {
                  0: { transcript: "hello from fake mic" },
                  isFinal: true,
                  length: 1,
                },
              ],
            });
          }, 50);
        }

        stop() {
          this.stopped = true;
          if (typeof this.onend === "function") {
            this.onend();
          }
        }
      }

      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: FakeSpeechRecognition,
        writable: true,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: FakeSpeechRecognition,
        writable: true,
      });
    });
    await page.getByTestId("translate-mic-button").click();

    await expect(page.getByTestId("translate-speech-engine")).toContainText(
      "Fallback"
    );
  });
});
