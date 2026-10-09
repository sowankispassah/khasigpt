import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const compile = (file: string) =>
  ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

const quietConsole = { info() {}, warn() {}, error() {} };

// Any app module the test does not provide fails loudly, so a route that
// starts keying limits by client IP again (request-helpers) cannot load.
function load(
  file: string,
  mocks: Record<string, unknown> = {},
  globals: Record<string, unknown> = {}
) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(compile(file), {
    exports,
    process: { env: { NODE_ENV: "production" } },
    Error,
    Response,
    console: quietConsole,
    ...globals,
    require: (name: string) => {
      if (name in mocks) {
        return mocks[name];
      }
      if (name.startsWith("@/")) {
        throw new Error(`Unexpected module ${name}`);
      }
      return requireModule(name);
    },
  });
  return exports;
}

type LimitCall = {
  key: string;
  limit: number;
  weight?: number;
  windowMs: number;
};

function fakeLimiter(deny: (key: string) => boolean = () => false) {
  const calls: LimitCall[] = [];
  return {
    calls,
    incrementRateLimit: async (
      key: string,
      options: Omit<LimitCall, "key">
    ) => {
      calls.push({ key, ...options });
      const allowed = !deny(key);
      return {
        allowed,
        remaining: allowed ? 1 : 0,
        resetAt: Date.now() + 90_000,
      };
    },
  };
}

type Limiter = Pick<ReturnType<typeof fakeLimiter>, "incrementRateLimit">;

// The production limiter in its in-memory mode (no Redis configured).
function localLimiter() {
  const timers = { setTimeout, clearTimeout, AbortController, URL };
  return load(
    "lib/security/rate-limit.ts",
    { "@/lib/utils/async": load("lib/utils/async.ts", {}, timers) },
    { ...timers, process: { env: { NODE_ENV: "test" } } }
  ) as Limiter;
}

const TRANSLATE_KEY = "translateAccessMode";
const PRIVATE_TEXT = "private user sentence";
const SECRET = "secret-provider-key";
const DAY_MS = 24 * 60 * 60 * 1000;

type SettingsSnapshot = { status: string; values: Map<string, unknown> };

function translateHarness({
  limiter = fakeLimiter() as Limiter,
  settings = {
    status: "confirmed",
    values: new Map([[TRANSLATE_KEY, "enabled"]]),
  } as SettingsSnapshot,
  lastKnown = null as unknown,
  translate = async (_input: { sourceText: string }) => ({
    translatedText: "translated",
  }),
} = {}) {
  const translations: Array<{ sourceText: string }> = [];
  const featureChecks: Array<{ mode: string }> = [];
  const logs: unknown[][] = [];
  const route = load(
    "app/api/translate/route.ts",
    {
      "@/lib/ai/error-diagnostics": load("lib/ai/error-diagnostics.ts"),
      "@/lib/constants": {
        TRANSLATE_FEATURE_FLAG_KEY: TRANSLATE_KEY,
        TRANSLATE_PROVIDER_MODE_SETTING_KEY: "translateProviderMode",
      },
      "@/lib/db/queries": {
        getAppSetting: async () => "ai",
        getLastKnownAppSetting: () => lastKnown,
      },
      "@/lib/mobile-auth-session": {
        getMobileSession: async () => ({
          user: { id: "user-1", role: "regular" },
        }),
      },
      "@/lib/security/rate-limit": limiter,
      "@/lib/settings/feature-access-settings": {
        loadFeatureAccessSettingsByKeys: async () => settings,
      },
      "@/lib/settings/user-feature-access": {
        isFeatureEnabledForUser: async (input: { mode: string }) => {
          featureChecks.push(input);
          return input.mode === "enabled";
        },
      },
      "@/lib/translate/config": {
        parseTranslateAccessModeSetting: (value: unknown) =>
          value === "enabled" ? "enabled" : "disabled",
        parseTranslateProviderModeSetting: () => "ai",
      },
      "@/lib/translate/service": {
        translateSourceText: async (input: { sourceText: string }) => {
          translations.push(input);
          return await translate(input);
        },
      },
      "@/lib/utils/async": {
        withTimeout: (promise: Promise<unknown>) => promise,
      },
    },
    {
      console: { ...quietConsole, error: (...args: unknown[]) => logs.push(args) },
    }
  );
  return { route, translations, featureChecks, logs };
}

const translateRequest = (sourceText = "Khublei", ip = "203.0.113.7") =>
  new Request("https://example.test/api/translate", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "x-real-ip": ip,
      "x-vercel-forwarded-for": ip,
    },
    body: JSON.stringify({ sourceText, targetLanguageCode: "kha" }),
  });

test("translate limits are keyed by user only and charge source characters to a daily budget", async () => {
  const limiter = fakeLimiter();
  const harness = translateHarness({ limiter });

  expect((await harness.route.POST(translateRequest("a".repeat(4321)))).status).toBe(200);
  expect((await harness.route.POST(translateRequest("b".repeat(10), "198.51.100.9"))).status).toBe(200);

  // A second network uses the same counters as the first.
  const keys = limiter.calls.map((call) => call.key);
  expect(keys).toEqual([
    "translate:user-1",
    "translate:daily-requests:user-1",
    "translate:daily-characters:user-1",
    "translate:user-1",
    "translate:daily-requests:user-1",
    "translate:daily-characters:user-1",
  ]);
  expect(keys.join(" ")).not.toMatch(/203\.0\.113\.7|198\.51\.100\.9/);

  const [minute, dailyRequests, dailyCharacters] = limiter.calls;
  expect(minute.limit).toBeLessThanOrEqual(60);
  expect(minute.windowMs).toBe(60_000);
  expect(dailyRequests).toMatchObject({ windowMs: DAY_MS });
  expect(dailyRequests.limit).toBeLessThanOrEqual(1000);
  expect(dailyCharacters).toMatchObject({ weight: 4321, windowMs: DAY_MS });
  expect(dailyCharacters.limit).toBeLessThanOrEqual(150_000);
  expect(limiter.calls[5].weight).toBe(10);
});

test("the daily character budget stops translation even when every request comes from a new network", async () => {
  const harness = translateHarness({ limiter: localLimiter() });
  const fullText = "k".repeat(12_000);
  const responses: Response[] = [];

  // Fewer requests than the per-minute limit, so only the daily budget applies.
  for (let index = 0; index < 50; index += 1) {
    const response: Response = await harness.route.POST(
      translateRequest(fullText, `192.0.2.${index + 1}`)
    );
    responses.push(response);
    if (response.status !== 200) {
      break;
    }
  }

  const refused = responses.at(-1) as Response;
  expect(refused.status).toBe(429);
  expect(Number(refused.headers.get("Retry-After"))).toBeGreaterThan(60 * 60);
  expect(refused.headers.get("Cache-Control")).toBe("no-store");
  expect((await refused.json()).message).toBe(
    "You have reached today's translation limit. Please try again later."
  );
  expect(harness.translations.length).toBeGreaterThan(0);
  expect(harness.translations.length * fullText.length).toBeLessThanOrEqual(150_000);
  expect(responses).toHaveLength(harness.translations.length + 1);
});

test("translate refuses over-limit requests before reading settings or calling a provider", async () => {
  const daily = translateHarness({
    limiter: fakeLimiter((key) => key.startsWith("translate:daily-requests:")),
  });
  const dailyResponse: Response = await daily.route.POST(translateRequest());
  expect(dailyResponse.status).toBe(429);
  expect(dailyResponse.headers.get("Retry-After")).toBe("90");
  expect((await dailyResponse.json()).message).toContain("today's translation limit");
  expect(daily.translations).toHaveLength(0);

  const minute = translateHarness({
    limiter: fakeLimiter((key) => key === "translate:user-1"),
  });
  const minuteResponse: Response = await minute.route.POST(translateRequest());
  expect(minuteResponse.status).toBe(429);
  expect(minuteResponse.headers.get("Retry-After")).toBe("90");
  expect((await minuteResponse.json()).message).toBe(
    "Too many translation requests. Please try again shortly."
  );
  expect(minute.featureChecks).toHaveLength(0);
  expect(minute.translations).toHaveLength(0);
});

test("translate fails closed when its access setting cannot be read", async () => {
  const limiter = fakeLimiter();
  const unavailable = translateHarness({
    limiter,
    settings: { status: "unavailable", values: new Map() },
  });
  const response: Response = await unavailable.route.POST(translateRequest());
  expect(response.status).toBe(503);
  expect((await response.json()).message).toBe(
    "Translation is temporarily unavailable. Please try again shortly."
  );
  expect(unavailable.featureChecks).toHaveLength(0);
  expect(unavailable.translations).toHaveLength(0);
  // No daily budget is spent on a refused request.
  expect(limiter.calls.map((call) => call.key)).toEqual(["translate:user-1"]);

  const lastKnown = translateHarness({
    settings: { status: "unavailable", values: new Map() },
    lastKnown: "enabled",
  });
  expect((await lastKnown.route.POST(translateRequest())).status).toBe(200);
  expect(lastKnown.featureChecks).toMatchObject([{ mode: "enabled" }]);

  const disabled = translateHarness({
    settings: {
      status: "confirmed",
      values: new Map([[TRANSLATE_KEY, "disabled"]]),
    },
  });
  expect((await disabled.route.POST(translateRequest())).status).toBe(404);
  expect(disabled.translations).toHaveLength(0);
});

test("translate failures return generic text and log no secrets or user text", async () => {
  const providerFailure = translateHarness({
    translate: async () => {
      throw Object.assign(
        new Error(`GOOGLE_TRANSLATE_API_KEY is not configured. ${SECRET}`),
        { requestBodyValues: { prompt: PRIVATE_TEXT }, statusCode: 401 }
      );
    },
  });
  const response: Response = await providerFailure.route.POST(
    translateRequest(PRIVATE_TEXT)
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ message: "Translation failed." });
  const logged = JSON.stringify(providerFailure.logs);
  expect(providerFailure.logs.length).toBeGreaterThan(0);
  for (const hidden of [SECRET, PRIVATE_TEXT, "GOOGLE_TRANSLATE_API_KEY"]) {
    expect(logged).not.toContain(hidden);
  }

  const validation = translateHarness({
    translate: async () => {
      throw new Error("No model is configured for the selected target language.");
    },
  });
  const validationResponse: Response = await validation.route.POST(translateRequest());
  expect(validationResponse.status).toBe(400);
  expect(await validationResponse.json()).toEqual({
    message: "No model is configured for the selected target language.",
  });
});

function livePreviewHarness({
  apiKey = "fixture-google-key",
  generate = async () => ({
    text: JSON.stringify({ transcript: "khublei", translation: "thank you" }),
  }),
  limiter = fakeLimiter(),
  settings = {
    status: "confirmed",
    values: new Map([[TRANSLATE_KEY, "enabled"]]),
  } as SettingsSnapshot,
} = {}) {
  const generations: Array<{ config: Record<string, unknown> }> = [];
  const logs: unknown[][] = [];
  const route = load(
    "app/api/translate/live-preview/route.ts",
    {
      "@google/genai": {
        GoogleGenAI: class {
          models = {
            generateContent: async (input: { config: Record<string, unknown> }) => {
              generations.push(input);
              return await generate();
            },
          };
        },
      },
      "@/app/(auth)/auth": {
        auth: async () => ({ user: { id: "user-1", role: "regular" } }),
      },
      "@/lib/ai/error-diagnostics": load("lib/ai/error-diagnostics.ts"),
      "@/lib/constants": { TRANSLATE_FEATURE_FLAG_KEY: TRANSLATE_KEY },
      "@/lib/db/queries": {
        getLastKnownAppSetting: () => null,
        getTranslationFeatureLanguageByCodeRaw: async (code: string) => ({
          code,
          isActive: true,
          name: "Khasi",
          systemPrompt: null,
        }),
      },
      "@/lib/security/rate-limit": limiter,
      "@/lib/settings/feature-access-settings": {
        loadFeatureAccessSettingsByKeys: async () => settings,
      },
      "@/lib/settings/user-feature-access": {
        isFeatureEnabledForUser: async ({ mode }: { mode: string }) =>
          mode === "enabled",
      },
      "@/lib/translate/config": {
        parseTranslateAccessModeSetting: (value: unknown) =>
          value === "enabled" ? "enabled" : "disabled",
      },
      "@/lib/translate/live": {
        buildLiveTranscriptAndTranslationPrompt: () => "system",
        GEMINI_LIVE_TRANSLATION_MODEL_ID: "fixture-model",
      },
      "@/lib/utils/async": {
        withTimeout: (promise: Promise<unknown>) => promise,
      },
    },
    {
      console: { ...quietConsole, error: (...args: unknown[]) => logs.push(args) },
      process: { env: { NODE_ENV: "production", GOOGLE_API_KEY: apiKey } },
    }
  );
  return { route, generations, logs };
}

const livePreviewRequest = ({
  audioBase64 = "AAAA",
  mimeType = "audio/pcm;rate=16000",
} = {}) =>
  new Request("https://example.test/api/translate/live-preview", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({ audioBase64, mimeType, targetLanguageCode: "en" }),
  });

test("live preview is limited per user per day and caps audio input and model output", async () => {
  const limiter = fakeLimiter();
  const harness = livePreviewHarness({ limiter });
  const response: Response = await harness.route.POST(livePreviewRequest());
  expect(response.status).toBe(200);
  expect(limiter.calls.map((call) => call.key)).toEqual([
    "translate-live-preview:user-1",
    "translate-live-preview:daily:user-1",
  ]);
  expect(limiter.calls[0].limit).toBeLessThanOrEqual(10);
  expect(limiter.calls[1]).toMatchObject({ windowMs: DAY_MS });
  expect(limiter.calls[1].limit).toBeLessThanOrEqual(200);
  const maxOutputTokens = harness.generations[0].config.maxOutputTokens;
  expect(maxOutputTokens).toBeGreaterThan(0);
  expect(maxOutputTokens).toBeLessThanOrEqual(1024);

  for (const body of [
    { audioBase64: "A".repeat(640_001) },
    { mimeType: "application/pdf" },
    { mimeType: "video/mp4" },
  ]) {
    expect((await harness.route.POST(livePreviewRequest(body))).status).toBe(400);
  }
  expect(harness.generations).toHaveLength(1);

  const daily = livePreviewHarness({
    limiter: fakeLimiter((key) => key.includes(":daily:")),
  });
  const refused: Response = await daily.route.POST(livePreviewRequest());
  expect(refused.status).toBe(429);
  expect(refused.headers.get("Retry-After")).toBe("90");
  expect((await refused.json()).message).toContain("today's live preview limit");
  expect(daily.generations).toHaveLength(0);
});

test("live preview fails closed and hides configuration and provider errors", async () => {
  const unavailable = livePreviewHarness({
    settings: { status: "unavailable", values: new Map() },
  });
  expect((await unavailable.route.POST(livePreviewRequest())).status).toBe(503);
  expect(unavailable.generations).toHaveLength(0);

  const missingKey = livePreviewHarness({ apiKey: "" });
  const missingKeyResponse: Response = await missingKey.route.POST(livePreviewRequest());
  expect(missingKeyResponse.status).toBe(500);
  expect(await missingKeyResponse.json()).toEqual({
    message: "Live preview is unavailable.",
  });

  const providerFailure = livePreviewHarness({
    generate: async () => {
      throw Object.assign(new Error(`upstream rejected ${SECRET}`), {
        requestBodyValues: { audio: PRIVATE_TEXT },
      });
    },
  });
  const failed: Response = await providerFailure.route.POST(livePreviewRequest());
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ message: "Live preview failed." });
  const logged = JSON.stringify(providerFailure.logs);
  expect(logged).not.toContain(SECRET);
  expect(logged).not.toContain(PRIVATE_TEXT);
});

function imageIntentHarness(limiter = fakeLimiter()) {
  let classifications = 0;
  const route = load(
    "app/(chat)/api/images/intent/route.ts",
    {
      "@/lib/ai/image-intent-token": { createImageIntentToken: () => "image-token" },
      "@/lib/ai/tool-intent-classifier": {
        classifyToolIntent: async () => {
          classifications += 1;
          return { intent: "normal_chat", webSearch: null };
        },
      },
      "@/lib/ai/web-search-intent-token": { createToolIntentToken: () => "tool-token" },
      "@/lib/errors": load("lib/errors.ts"),
      "@/lib/image-intent": { shouldClassifyImageIntent: () => true },
      "@/lib/mobile-auth-session": {
        getMobileSession: async () => ({ user: { id: "user-1", role: "regular" } }),
      },
      "@/lib/security/rate-limit": limiter,
      "@/lib/security/request-body": {
        RequestBodyLimitError: class RequestBodyLimitError extends Error {},
        readBoundedJson: (request: Request) => request.json(),
        requestLimitResponse: () => new Response(null, { status: 413 }),
      },
    },
    { performance }
  );
  return { route, classifications: () => classifications };
}

const intentRequest = () =>
  new Request("https://example.test/api/images/intent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" },
    body: JSON.stringify({
      message: "Who is Jessie Lyngdoh?",
      imageHintSelected: false,
      hasImageAttachment: false,
      hasPriorGeneratedImage: false,
      recentMessages: [],
    }),
  });

test("image intent classification is limited per user per minute and per day", async () => {
  const limiter = fakeLimiter();
  const harness = imageIntentHarness(limiter);
  expect((await harness.route.POST(intentRequest())).status).toBe(200);
  expect(harness.classifications()).toBe(1);
  expect(limiter.calls.map((call) => call.key)).toEqual([
    "api:image-intent:user-1",
    "api:image-intent:daily:user-1",
  ]);
  expect(limiter.calls[0].limit).toBeLessThanOrEqual(30);
  expect(limiter.calls[1]).toMatchObject({ windowMs: DAY_MS });
  expect(limiter.calls[1].limit).toBeLessThanOrEqual(500);

  const daily = imageIntentHarness(fakeLimiter((key) => key.includes(":daily:")));
  const refused: Response = await daily.route.POST(intentRequest());
  expect(refused.status).toBe(429);
  expect(refused.headers.get("Retry-After")).toBe("90");
  expect(await refused.json()).toEqual({
    code: "rate_limit:api",
    message: "Too many requests.",
  });
  expect(daily.classifications()).toBe(0);
});

test("the shared limiter charges an optional weight and keeps single-unit calls unchanged", async () => {
  const limiter = localLimiter();
  const policy = { limit: 100, windowMs: 60_000 };
  expect(await limiter.incrementRateLimit("budget", { ...policy, weight: 60 })).toMatchObject({ allowed: true, remaining: 40 });
  expect(await limiter.incrementRateLimit("budget", { ...policy, weight: 41 })).toMatchObject({ allowed: false });
  expect(await limiter.incrementRateLimit("budget", { ...policy, weight: 40 })).toMatchObject({ allowed: true, remaining: 0 });
  expect(await limiter.incrementRateLimit("single", { limit: 1, windowMs: 60_000 })).toMatchObject({ allowed: true });
  expect(await limiter.incrementRateLimit("single", { limit: 1, windowMs: 60_000 })).toMatchObject({ allowed: false });
  for (const weight of [0, -1, 1.5]) {
    await expect(limiter.incrementRateLimit("budget", { ...policy, weight })).rejects.toThrow("Invalid rate-limit policy");
  }

  const commands: unknown[][] = [];
  const timers = { setTimeout, clearTimeout, AbortController, URL };
  const env = {
    NODE_ENV: "production",
    UPSTASH_REDIS_REST_URL: "https://redis.example.test",
    UPSTASH_REDIS_REST_TOKEN: "fixture-token",
  };
  const fetcher = async (_url: unknown, init?: RequestInit) => {
    commands.push(JSON.parse(String(init?.body)));
    return Response.json({ result: [1, 1000] });
  };
  const remote = load(
    "lib/security/rate-limit.ts",
    { "@/lib/utils/async": load("lib/utils/async.ts", {}, { ...timers, fetch: fetcher }) },
    { ...timers, fetch: fetcher, process: { env } }
  );
  await remote.incrementRateLimit("plain", { limit: 2, windowMs: 1000 });
  await remote.incrementRateLimit("weighted", { limit: 2000, windowMs: 1000, weight: 750 });
  expect(String(commands[0][1])).toContain("INCRBY");
  expect(commands.map((command) => command.slice(4))).toEqual([[1000, 1], [1000, 750]]);
});
