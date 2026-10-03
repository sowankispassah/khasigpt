import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import postgres from "postgres";
import ts from "typescript";
import { DatabaseOperationQueue } from "@/lib/db/operation-queue";
import * as featureAccess from "@/lib/feature-access";
import { fetchWithResponseTimeout, withTimeout } from "@/lib/utils/async";
import { restrictUnmeteredLiveAccess } from "@/lib/voice/launch-access";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));

function loadModule(file: string, mocks: Record<string, unknown>, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: (name: string) => name in mocks ? mocks[name] : requireModule(name),
    setTimeout, clearTimeout, console, AbortController, Headers, Response, URL, URLSearchParams,
    process: { env: {} }, ...globals,
  });
  return exports as Record<string, any>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("unmetered live settings and cold failures never admit a non-admin", async () => {
  const mocks = {
    "server-only": {},
    "@/lib/feature-access": featureAccess,
    "@/lib/voice/launch-access": { restrictUnmeteredLiveAccess },
    "@/lib/settings/feature-access-settings": {
      loadFeatureAccessSettingsByKeys: async () => ({ status: "unavailable" }),
      getFeatureAccessModeSettingValue: () => undefined,
    },
    "@/lib/settings/user-feature-access": {
      loadUserFeatureAccessOverride: async () => null,
    },
  };
  const voice = loadModule("lib/voice/config.ts", mocks);
  const translation = loadModule("lib/live-translation/config.ts", mocks);
  for (const parse of [voice.parseVoiceChatAccessModeSetting, translation.parseLiveTranslationAccessModeSetting]) {
    for (const value of ["enabled", true, "admin_only", "disabled", null]) {
      const mode = parse(value);
      for (const role of ["regular", "creator", null, undefined] as const) {
        expect(featureAccess.isFeatureEnabledForRole(mode, role)).toBe(false);
      }
      if (value === "disabled") expect(featureAccess.isFeatureEnabledForRole(mode, "admin")).toBe(false);
      if (value === "enabled") expect(featureAccess.isFeatureEnabledForRole(mode, "admin")).toBe(true);
    }
  }
  for (const platform of ["web", "android"]) {
    expect(await voice.getVoiceChatAccessModeForPlatform(platform)).toBe("admin_only");
    expect(await translation.getLiveTranslationAccessModeForPlatform(platform)).toBe("admin_only");
  }
});

test("legacy translation token route withholds live credentials from regular users", async () => {
  let tokensCreated = 0;
  const route = loadModule("app/api/translate/live-token/route.ts", {
    "@google/genai": { GoogleGenAI: class { constructor() { tokensCreated += 1; } } },
    "@/app/(auth)/auth": { auth: async () => ({ user: { id: "user", role: "regular" } }) },
    "@/lib/db/queries": {
      getLastKnownAppSetting: () => "enabled",
      getTranslationFeatureLanguageByCodeRaw: async () => ({ isActive: true, speechModelConfigId: "model" }),
      getModelConfigById: async () => ({ isEnabled: true }),
    },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "test" },
    "@/lib/settings/feature-access-settings": { loadFeatureAccessSettingsByKeys: async () => ({ status: "confirmed", values: new Map() }) },
    "@/lib/settings/user-feature-access": {
      isFeatureEnabledForUser: async ({ mode, role }: { mode: featureAccess.FeatureAccessMode; role: featureAccess.FeatureAccessRole }) =>
        featureAccess.isFeatureEnabledForRole(mode, role),
    },
    "@/lib/translate/config": { parseTranslateAccessModeSetting: () => "enabled" },
    "@/lib/translate/live": { isGoogleLiveTranslationModel: () => true },
  });
  const response = await route.POST(new Request("https://audit.invalid/api/translate/live-token", { method: "POST", body: JSON.stringify({ targetLanguageCode: "en" }) }));
  expect(await response.json()).toMatchObject({ liveSupported: false, reason: "live-api-unavailable" });
  expect(tokensCreated).toBe(0);
});

test("HTTP deadline includes a body stalled after successful headers", async () => {
  const originalFetch = globalThis.fetch;
  let signal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_input, init) => {
    signal = init?.signal;
    return { json: () => new Promise(() => {}) } as unknown as Response;
  }) as typeof fetch;
  try {
    await expect(fetchWithResponseTimeout("https://example.test", undefined, 25, (response) => response.json())).rejects.toThrow("timeout");
    expect(signal?.aborted).toBe(true);
    globalThis.fetch = async () => Response.json({ healthy: true });
    expect(await fetchWithResponseTimeout("https://example.test/other", undefined, 100, (response) => response.json())).toEqual({ healthy: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("expired queued database work never runs after the first operation finishes", async () => {
  const queue = new DatabaseOperationQueue();
  const first = deferred<void>();
  const busy = queue.run(() => first.promise, 1000);
  let unwantedWrites = 0;
  await expect(queue.run(async () => { unwantedWrites += 1; }, 20)).rejects.toThrow("queue wait expired");
  first.resolve();
  await busy;
  expect(await queue.run(async () => "healthy", 1000)).toBe("healthy");
  expect(unwantedWrites).toBe(0);
});

test("admin connection recovery cannot terminate a concurrent unrelated operation", async () => {
  const clients: Array<{ closed: boolean; end: () => Promise<void> }> = [];
  const module = loadModule("lib/db/admin-database.ts", {
    "server-only": {},
    "postgres": () => {
      const client = { closed: false, end: async () => { client.closed = true; } };
      clients.push(client);
      return client;
    },
    "drizzle-orm/postgres-js": { drizzle: (client: unknown) => client },
    "@/lib/db/operation-queue": { DatabaseOperationQueue },
    "@/lib/utils/async": { withTimeout },
    "@/lib/errors": { ChatSDKError: Error },
  }, {
    Error,
    process: { env: { POSTGRES_URL: "postgres://localhost/audit", POSTGRES_ADMIN_OPERATION_TIMEOUT_MS: "25" } },
  });
  const stuck = module.withAdminDatabase("pricing", () => new Promise(() => {}), { retry: false });
  const failure = expect(stuck).rejects.toThrow("timeout");
  const healthy = module.withAdminDatabase("users", async (client: { closed: boolean }) => {
    await new Promise((done) => setTimeout(done, 5));
    expect(client.closed).toBe(false);
    return "users loaded";
  });
  await failure;
  expect(await healthy).toBe("users loaded");
  expect(clients).toHaveLength(2);
});

test("real Postgres driver receives the application statement deadlines", async () => {
  for (const file of ["lib/db/queries.ts", "lib/db/app-settings-lite.ts"]) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    let initializer = "";
    const visit = (node: ts.Node) => {
      if (ts.isVariableDeclaration(node) && node.name.getText(source) === "poolConfig") initializer = node.initializer?.getText(source) ?? "";
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(initializer).not.toBe("");
    const code = ts.transpileModule(`globalThis.result = ${initializer}`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const context: Record<string, any> = {
      process: { env: { POSTGRES_STATEMENT_TIMEOUT: "3210" } },
      parseOr: (value: string, fallback: number) => Number(value) || fallback,
      defaultPoolSize: 1, defaultConnectTimeout: 3, defaultStatementTimeout: 20000,
      usesSupabasePooler: true, usesPooler: true,
    };
    vm.runInNewContext(code, context);
    const client = postgres("postgres://localhost/audit", context.result);
    expect(client.options.connection.statement_timeout).toBe(3210);
    expect(client.options.connection.application_name).toContain("ai-chatbot");
    await client.end();
  }
});

test("native cancellation cannot retry or return stale cached success", async () => {
  let calls = 0;
  const module = loadModule("native/src/api/client.ts", {
    "react-native": { Platform: { OS: "android" } },
    "@/api/client-source": { applyClientSourceHeader: () => {} },
    "@/api/config": { API_BASE_URL: "https://example.test", getBaseUrlCandidates: () => ["https://one.test", "https://two.test"] },
    "@/auth/native-auth-service": { getNativeAuthHeaders: async () => ({ Authorization: "Bearer test" }) },
    "@/lib/persistent-cache": { readPersistentCache: async () => ({ value: { stale: true } }), writePersistentCache: async () => {} },
  }, {
    __DEV__: false, Error, DOMException,
    fetch: async (_input: unknown, init: RequestInit) => {
      calls += 1;
      if (init.signal?.aborted) throw Object.assign(new Error("cancelled"), { name: "AbortError" });
      throw new TypeError("network unavailable");
    },
  });
  const controller = new AbortController();
  controller.abort();
  await expect(module.apiFetch("/api/mobile/features", { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
  calls = 0;
  await expect(module.apiFetch("/api/mobile/action", { method: "POST" })).rejects.toThrow("network unavailable");
  expect(calls).toBe(1);
  // The XHR global is deliberately absent: cancellation after auth resolution
  // must reject before constructing or sending any streaming request.
  await expect(module.streamChatResponse({ body: "{}", onChunk: () => {}, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});

test("native fallback retains a healthy snapshot when a degraded response arrives", async () => {
  let mode = "healthy";
  let persistentWrites = 0;
  const module = loadModule("native/src/api/client.ts", {
    "react-native": { Platform: { OS: "android" } },
    "@/api/client-source": { applyClientSourceHeader: () => {} },
    "@/api/config": { API_BASE_URL: "https://example.test", getBaseUrlCandidates: () => ["https://example.test"] },
    "@/auth/native-auth-service": { getNativeAuthHeaders: async () => ({}) },
    "@/lib/persistent-cache": { readPersistentCache: async () => null, writePersistentCache: async () => { persistentWrites += 1; } },
  }, {
    __DEV__: false, Error, TypeError,
    fetch: async () => {
      if (mode === "offline") throw new TypeError("offline");
      return Response.json(mode === "healthy" ? { models: ["configured"] } : { models: [], meta: { degradedSections: ["modelConfig"] } });
    },
  });
  await module.apiFetch("/api/mobile/bootstrap", { retries: 0 });
  mode = "degraded";
  await module.apiFetch("/api/mobile/bootstrap", { retries: 0 });
  mode = "offline";
  expect(await module.apiFetch("/api/mobile/bootstrap", { retries: 0 })).toEqual({ models: ["configured"] });
  expect(persistentWrites).toBe(1);
});

test("web voice token deadline covers stalled response bodies before opening a socket", async () => {
  const originalFetch = globalThis.fetch;
  const module = loadModule("lib/voice/web-live-voice.ts", {
    "@/lib/utils/async": { fetchWithResponseTimeout: (input: RequestInfo, init: RequestInit, _timeout: number, read: (response: Response) => unknown) => fetchWithResponseTimeout(input, init, 25, read) },
    "@/lib/voice/live": {},
  }, { navigator: { mediaDevices: { getUserMedia: () => { throw new Error("unexpected microphone access"); } } } });
  globalThis.fetch = async () => ({ json: () => new Promise(() => {}) }) as unknown as Response;
  try {
    await expect(module.startWebGeminiVoiceTurn({})).rejects.toThrow("timeout");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wallet writes acquire the same per-user transaction lock before idempotency reads", () => {
  const source = readFileSync("lib/db/queries.ts", "utf8");
  for (const name of ["recordTokenUsage", "deductImageCredits"]) {
    const start = source.indexOf(`export async function ${name}(`);
    const next = source.indexOf("\nexport async function ", start + 1);
    const body = source.slice(start, next);
    expect(body.indexOf("getActiveSubscriptionInternal(tx, userId, now)")).toBeLessThan(body.indexOf("if (requestKey)"));
  }
  const internal = source.slice(source.indexOf("async function getActiveSubscriptionInternal("));
  expect(internal.indexOf("await lockUserWallet(executor, userId)")).toBeLessThan(internal.indexOf(".update(userSubscription)"));
});

test("model failures are explicitly unconfirmed and never invent a configured model", async () => {
  let healthy = false;
  const configured = { id: "saved-model", isDefault: true };
  const module = loadModule("lib/ai/models.ts", {
    "server-only": {},
    "@/lib/db/queries": { listModelConfigs: async () => { throw new Error("database unavailable"); } },
    "@/lib/utils/async": { withTimeout },
    "./model-registry": {
      MODEL_REGISTRY_CACHE_TAG: "models",
      mapToModelSummary: (value: unknown) => value,
      getModelRegistry: async () => {
        if (!healthy) throw new Error("database unavailable");
        return { configs: [configured], defaultConfig: configured };
      },
    },
  }, { Error });
  expect(await module.loadChatModels()).toMatchObject({ degraded: true, models: [], defaultModel: null });
  healthy = true;
  expect((await module.loadChatModels()).models[0].id).toBe("saved-model");
  healthy = false;
  expect(await module.loadChatModels()).toMatchObject({ degraded: true, models: [{ id: "saved-model" }] });
});

test("bootstrap feature reads do not invoke image credits and full feature reads expose partial failure", async () => {
  const source = ts.createSourceFile("read-models.ts", readFileSync("lib/api/read-models.ts", "utf8"), ts.ScriptTarget.Latest, true);
  const fn = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "loadFeatureAccessReadModel");
  if (!fn) throw new Error("Feature read model declaration is missing");
  let imageCalls = 0;
  const context: Record<string, any> = {
    exports: {}, console, Boolean,
    READ_TIMEOUT_MS: 50,
    withTimeout,
    safeAppSetting: async () => "true",
    parseBooleanSetting: (value: string) => value === "true",
    getImageGenerationAccess: async () => { imageCalls += 1; throw new Error("credits unavailable"); },
    loadFeatureAccessSettingsByKeys: async () => ({ status: "confirmed", missingKeys: [], values: new Map() }),
    loadUserFeatureAccessOverrides: async () => ({ status: "confirmed", values: new Map() }),
    getFeatureAccessModeSettingValue: () => "enabled",
    isFeatureEnabledForRole: (value: string) => value === "enabled",
    resolvePlatformVoiceChatSetting: () => ({ android: "enabled", web: "enabled" }),
  };
  for (const match of fn.getText(source).matchAll(/\b[A-Z][A-Z_]+\b/g)) context[match[0]] ??= match[0];
  for (const match of fn.getText(source).matchAll(/\bparse\w+/g)) context[match[0]] ??= (value: unknown) => value;
  vm.runInNewContext(ts.transpileModule(fn.getText(source), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const load = context.exports.loadFeatureAccessReadModel;
  const flags = await load({ userId: "user", role: "regular", includeImageAccess: false });
  expect(imageCalls).toBe(0);
  expect(flags.meta.degraded).toBe(false);
  const full = await load({ userId: "user", role: "regular" });
  expect(imageCalls).toBe(1);
  expect(full.calculator).toBe(true);
  expect(full.meta).toMatchObject({ featureAccessStatus: "confirmed", imageGenerationDegraded: true, degraded: true });
});
