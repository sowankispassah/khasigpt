import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const tokenRoutes = ["app/api/chat/voice-token/route.ts", "app/api/mobile/chat/voice-token/route.ts", "app/api/live-translation/token/route.ts", "app/api/mobile/live-translation/token/route.ts"];
const saveRoutes = ["app/api/chat/voice-turn/route.ts", "app/api/mobile/chat/voice-turn/route.ts", "app/api/live-translation/session/route.ts", "app/api/mobile/live-translation/session/route.ts"];
const userId = "11111111-1111-4111-8111-111111111111";

function harness() {
  let context: any = { user: { id: userId, role: "admin" } };
  const current: any = { id: userId, role: "admin", isActive: true };
  let lookupFails = false;
  let mode = "enabled";
  let override = true;
  let settingFails = false;
  let credits = true;
  const calls = { lookup: 0, provider: 0, model: 0, credits: 0, writes: 0, override: 0 };
  const modules = new Map<string, any>();
  const model: any = { provider: "google", id: userId, providerModelId: "fixture", displayName: "fixture", voiceName: "fixture", mediaResolution: "MEDIA_RESOLUTION_MEDIUM", systemInstruction: "fixture" };
  const mocks: Record<string, any> = {
    "@/lib/voice/duration-session": { findOwnedVoiceSession: async () => null },
    "@/lib/utils": { generateUUID: () => userId },
    "@/lib/api/auth": { getAuthenticatedUser: async () => context },
    "@/lib/db/auth-queries": { getAuthUserById: async () => { calls.lookup++; if (lookupFails) throw new Error("fixture failure"); return current; } },
    "@/lib/db/queries": {
      getUserFeatureAccessOverrides: async (_id: string, keys: string[]) => { calls.override++; return new Map(keys.map(key => [key, override])); },
      getAppSetting: async () => true,
      recordTokenUsage: async () => { calls.writes++; },
      saveMessages: async () => { calls.writes++; },
    },
    "@/lib/api/observability": { withApiTiming: (_name: string, fn: () => unknown) => fn() },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
    "@/lib/security/request-helpers": { getClientKeyFromHeaders: () => "fixture-ip" },
    "@/lib/voice/config": { getVoiceChatAccessModeForPlatform: async () => { if (settingFails) throw new Error("fixture failure"); return mode; } },
    "@/lib/voice/live-models": {
      resolveLiveVoiceModelConfig: async () => { calls.model++; return model; },
      hasEnoughCreditsForLiveVoice: async () => { calls.credits++; return credits; },
    },
    "@/lib/live-translation/settings-read": { loadLiveTranslationSettingsValues: async () => ({ languagesValue: undefined }) },
    "@/lib/settings/feature-access-settings": { loadFeatureAccessSettingsByKeys: async () => ({status:"confirmed"}), getFeatureAccessModeSettingValue: () => mode },
    "@/lib/rag/live-tool": { RAG_LIVE_TOOL: {}, RAG_LIVE_SYSTEM_INSTRUCTION: "fixture" },
    "@/lib/voice/transcript-normalization": { normalizeKhasiVoiceTranscript: async () => { calls.provider++; return "fixture"; } },
    "@google/genai": {
      GoogleGenAI: class { authTokens = { create: async () => { calls.provider++; return {name:"disposable-fixture-token"}; } }; },
      Modality: { AUDIO: "AUDIO" }, ActivityHandling: {}, EndSensitivity: {}, StartSensitivity: {}, TurnCoverage: {},
    },
  };
  function load(file: string): any {
    if (modules.has(file)) return modules.get(file);
    const exports: Record<string, any> = {};
    modules.set(file, exports);
    vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
      { exports, process: {env:{PLAYWRIGHT:"true",GOOGLE_API_KEY:"disposable-fixture-key"}}, Buffer, URL, Request, Response, Headers, AbortSignal, console, Date, setTimeout, clearTimeout,
        require: (name: string) => name === "server-only" ? {} : name in mocks ? mocks[name] : name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : requireModule(name) });
    return exports;
  }
  const policy = load("lib/voice/launch-access.ts");
  const featureAccess = load("lib/settings/user-feature-access.ts");
  const request = (file: string) => new Request(`https://app.example.test/${file}`, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(file.includes("live-translation") ? { languageACode:"en", languageBCode:"kha" } : file.includes("voice-turn") ? { chatId: userId, userText: "Fixture question", assistantText: "Fixture answer" } : { supportsDurationVoice: true, supportsRelayVoice: true }) });
  return { calls, policy, featureAccess, load, request,
    anonymous: () => { context = null; }, regular: () => { context.user.role = "regular"; current.role = "regular"; },
    revoked: () => { current.role = "regular"; mode = "admin_only"; }, deactivate: () => { current.isActive = false; },
    noCredits: () => { credits = false; }, adminOnly: () => { mode = "admin_only"; }, gpt: () => { model.provider = "openai"; model.durationPricing = {}; }, failLookup: () => { lookupFails = true; }, disable: () => { mode = "disabled"; }, block: () => { override = false; }, failSettings: () => { settingFails = true; },
  };
}

test("all web and native live endpoints deny regular users before settings, providers or writes", async () => {
  for (const file of [...tokenRoutes, ...saveRoutes].filter(file => file.includes("live-translation"))) {
    const h = harness(); h.regular();
    const response = await h.load(file).POST(h.request(file));
    expect(response.status, file).toBe(404);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(h.calls).toMatchObject({ lookup:0, provider:0, model:0, credits:0, writes:0, override:0 });
  }
});

test("revoked admins, disabled accounts and failed fresh lookups cannot issue tokens or save turns", async () => {
  for (const file of [...tokenRoutes, ...saveRoutes]) {
    for (const change of ["revoked", "deactivate", "failLookup"] as const) {
      const h = harness(); h[change]();
      const response = await h.load(file).POST(h.request(file));
      expect(response.status, `${file}:${change}`).toBe(change === "failLookup" ? 503 : 404);
      expect(h.calls.provider).toBe(0);
      expect(h.calls.writes).toBe(0);
    }
  }
});

test("active admins retain token access while disabled settings and explicit blocks still stop it", async () => {
  for (const file of tokenRoutes) {
    const h = harness();
    const response = await h.load(file).POST(h.request(file));
    expect(response.status, file).toBe(200);
    expect((await response.json()).liveSupported).toBe(true);
    expect(h.calls.provider).toBe(file.includes("live-translation") ? 1 : 0);
    for (const change of ["disable", "block"] as const) {
      const denied = harness(); denied[change]();
      expect((await denied.load(file).POST(denied.request(file))).status, `${file}:${change}`).toBe(404);
      expect(denied.calls.provider).toBe(0);
    }
  }
});

test("voice feature-setting exceptions fail closed rather than enabling token creation", async () => {
  for (const file of tokenRoutes.filter(file => file.includes("/chat/"))) {
    const h = harness(); h.failSettings();
    expect((await h.load(file).POST(h.request(file))).status).toBe(503);
    expect(h.calls.provider).toBe(0);
  }
});

test("live grants cannot bypass launch policy; unrelated feature grants retain their behavior", async () => {
  const h = harness();
  const keys = ["chat.liveTranslation.web.enabled", "chat.liveTranslation.android.enabled"];
  for (const featureKey of keys) {
    expect(h.policy.isUnmeteredLiveFeatureKey(featureKey), featureKey).toBe(true);
    for (const mode of ["enabled", "admin_only", "disabled"])
      expect(await h.featureAccess.isFeatureEnabledForUser({featureKey,mode,role:"regular",userId,source:"fixture"})).toBe(false);
  }
  expect(h.calls.override).toBe(0);
  expect(await h.featureAccess.isFeatureEnabledForUser({featureKey:"calculator.enabled",mode:"disabled",role:"regular",userId,source:"fixture"})).toBe(true);
  for (const role of [null, undefined, "guest", "regular"])
    expect(h.policy.isUnmeteredLiveEnabledForRole("enabled",role,true)).toBe(false);
  expect(h.policy.isUnmeteredLiveEnabledForRole("disabled","admin",true)).toBe(false);
});


test("both admin-selected voice transports allow credited regular users only when enabled", async () => {
  for (const file of tokenRoutes.filter(file => file.includes("/chat/"))) {
    for (const gpt of [false, true]) {
      const h = harness(); h.regular(); if (gpt) h.gpt();
      const response = await h.load(file).POST(h.request(file));
      expect(response.status).toBe(200);
      expect((await response.json()).transport).toBe(gpt ? "webrtc" : "relay");
      expect(h.calls.lookup).toBe(1);
      expect(h.calls.provider).toBe(0);
      for (const change of ["disable", "adminOnly", "block"] as const) {
        const denied = harness(); denied.regular(); denied[change]();
        expect((await denied.load(file).POST(denied.request(file))).status).toBe(404);
      }
    }
  }
});

test("per-user grants cannot open disabled or admin-only metered voice to ordinary users", async () => {
  const h = harness();
  for (const featureKey of ["chat.voice.web.enabled", "chat.voice.android.enabled"]) {
    for (const mode of ["disabled", "admin_only"])
      expect(await h.featureAccess.isFeatureEnabledForUser({featureKey,mode,role:"regular",userId,source:"fixture"})).toBe(false);
    expect(await h.featureAccess.isFeatureEnabledForUser({featureKey,mode:"enabled",role:"regular",userId,source:"fixture"})).toBe(true);
  }
});


test("neither live transport can start when the credited balance cannot be confirmed", async () => {
  for (const file of tokenRoutes.filter(file => file.includes("/chat/"))) {
    for (const gpt of [false, true]) {
      const h = harness(); h.regular(); h.noCredits(); if (gpt) h.gpt();
      expect((await h.load(file).POST(h.request(file))).status).toBe(402);
      expect(h.calls.provider).toBe(0);
      expect(h.calls.writes).toBe(0);
    }
  }
});
