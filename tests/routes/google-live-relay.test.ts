import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { VoiceRelaySocket } from "@/lib/voice/relay-socket";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const id = "11111111-1111-4111-8111-111111111111";
function harness() {
  const charges: any[] = [];
  const sends: any[] = [];
  const writes: any[] = [];
  const intervals: Array<() => void> = [];
  let releaseCount = 0;
  let balance = 999999;
  let socket: any;
  let finalizer: () => Promise<void>;
  class Socket extends EventEmitter {
    static OPEN = 1; static CONNECTING = 0;
    readyState = 1;
    constructor() { super(); socket = this; queueMicrotask(() => this.emit("open")); }
    send(raw: string) { sends.push(JSON.parse(raw)); }
    close() { if (this.readyState === 3) return; this.readyState = 3; this.emit("close"); }
    terminate() { this.close(); }
  }
  const chain: any = { values: () => chain, returning: async () => [{ id }], set: (v: any) => { writes.push(v); return chain; }, where: async () => [] };
  const redis: any = { isOpen: true, connect: async () => {}, destroy: () => {}, on: () => {}, set: async () => {}, del: async () => {}, xAdd: async () => {}, expire: async () => {}, duplicate: () => redis, xRead: () => new Promise(() => {}) };
  const mocks: Record<string, any> = {
    "server-only": {}, "drizzle-orm": { eq: () => ({}) }, "next/server": { after: (fn: () => Promise<void>) => { finalizer = fn; } }, ws: Socket,
    "@/lib/db/schema": { liveVoiceSession: { id } },
    "@/lib/db/queries": { db: { insert: () => chain, update: () => chain }, acquirePaidGenerationForUser: async () => ({ release: async () => { releaseCount++; } }),
      getCostPlusCreditQuote: async () => ({ creditUnits: 100, markupMultiplier: 3, usdToInr: 100, walletUnitsPerInr: 500, pricingReferencePlanId: id }),
      getUserBalanceSummary: async () => ({ tokensRemaining: balance }), recordTokenUsage: async (charge: any) => { charges.push(charge); } },
    "@/lib/rag/live-tool": { RAG_LIVE_SYSTEM_INSTRUCTION: "fixture", RAG_LIVE_TOOL: {}, RAG_LIVE_TOOL_NAME: "search_custom_knowledge" },
    "@/lib/rag/retrieval": { retrieveRagContext: async () => ({ context: "fixture" }) },
    "@/lib/rag/runtime-settings": { loadCustomKnowledgeEnabledCached: async () => false },
    "@/lib/voice/relay-redis": { getVoiceRelayRedis: async () => redis, relayOwnerKey: (id: string) => id, relayInputKey: (id: string) => id },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("lib/voice/google-relay-session.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require: (name: string) => mocks[name] ?? requireModule(name), process: { env: { GOOGLE_API_KEY: "fixture-secret" } }, Buffer, AbortSignal, ReadableStream, TextEncoder, console, Date,
      setTimeout: () => 1, setInterval: (fn: () => void) => { intervals.push(fn); return 1; }, clearTimeout: () => {}, clearInterval: () => {} });
  return { exports, sends, charges, writes, intervals, noCredits: () => { balance = 0; }, get socket() { return socket; }, get releaseCount() { return releaseCount; }, finish: () => finalizer() };
}
const model = { id, provider: "google", providerModelId: "gemini-fixture", voiceName: "Zephyr", systemInstruction: "fixture", inputProviderCostPerMillion: 3, outputProviderCostPerMillion: 12, markupMultiplier: 3 };

test("Google meters full provider prompt usage on every turn, pins prices, and releases its lease", async () => {
  const h = harness();
  await h.exports.createGoogleRelaySession(model, id, "web", new AbortController().signal);
  h.socket.emit("message", Buffer.from(JSON.stringify({ setupComplete: {} })));
  for (const promptTokenCount of [100, 250]) {
    h.socket.emit("message", Buffer.from(JSON.stringify({ usageMetadata: { promptTokenCount, responseTokenCount: 20 } })));
    h.socket.emit("message", Buffer.from(JSON.stringify({ usageMetadata: { promptTokenCount, responseTokenCount: 30 }, serverContent: { turnComplete: true } })));
  }
  h.socket.close(); await h.finish();
  expect(h.charges.map(c => [c.inputTokens, c.outputTokens])).toEqual([[100, 30], [250, 30]]);
  expect(h.charges.every(c => c.generationPricing.inputCostPerMillionUsd === 3 && c.generationPricing.markupMultiplier === 3)).toBe(true);
  expect(h.charges[0].requestKey).not.toBe(h.charges[1].requestKey);
  expect(h.releaseCount).toBe(1);
  expect(h.writes.some(w => w.status === "completed")).toBe(true);
  expect(h.sends[0].setup.model).toBe("models/gemini-fixture");
});

test("Google balance exhaustion stops the server-owned transport", async () => {
  const h = harness();
  await h.exports.createGoogleRelaySession(model, id, "native", new AbortController().signal);
  h.noCredits(); h.intervals[0]();
  await expect.poll(() => h.socket.readyState).toBe(3);
  await h.finish();
  expect(h.releaseCount).toBe(1);
});

test("relay adapter ignores client setup/usage, preserves audio ordering and closes once", async () => {
  const uploads: any[] = [];
  let deliver: ((line: string) => void) | undefined;
  let end: (() => void) | undefined;
  const socket = new VoiceRelaySocket({ stream: async (_body, line) => { deliver = line; await new Promise<void>(resolve => { end = resolve; }); }, upload: async body => { uploads.push(body); } });
  await expect.poll(() => Boolean(deliver)).toBe(true);
  if (!deliver) throw new Error("Relay stream did not start");
  deliver(JSON.stringify({ relayStarted: { sessionId: id } }));
  socket.send(JSON.stringify({ setup: { model: "untrusted" } }));
  socket.send(JSON.stringify({ usageMetadata: { promptTokenCount: 1 } }));
  socket.send(JSON.stringify({ realtimeInput: { audio: { data: "AAAA", mimeType: "audio/pcm;rate=16000" } } }));
  socket.send(JSON.stringify({ realtimeInput: { audioStreamEnd: true } }));
  await expect.poll(() => uploads.length).toBe(1);
  expect(uploads[0].messages).toHaveLength(2);
  expect(uploads[0].messages[1].realtimeInput.audioStreamEnd).toBe(true);
  socket.close(); socket.close(); if (!end) throw new Error("Relay stream did not start"); end();
  expect(uploads.filter(u => u.close)).toHaveLength(1);
});


test("the HTTP relay delivers uncompressed readiness and rejects client-controlled configuration", async () => {
  const uploaded: any[] = [];
  const mocks: Record<string, any> = {
    "server-only": {},
    "@/lib/api/auth": { getAuthenticatedUser: async () => ({ user: { id, role: "regular" } }) },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/constants": { VOICE_CHAT_WEB_FEATURE_FLAG_KEY: "voice.web", VOICE_CHAT_ANDROID_FEATURE_FLAG_KEY: "voice.android" },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
    "@/lib/settings/user-feature-access": { isFeatureEnabledForUser: async () => true },
    "@/lib/voice/config": { getVoiceChatAccessModeForPlatform: async () => "enabled" },
    "@/lib/voice/live-models": { resolveLiveVoiceModelConfig: async () => model },
    "@/lib/voice/live-session-access": { enforceLiveSessionLaunchAccess: async () => null },
    "@/lib/voice/google-relay-session": { createGoogleRelaySession: async () => new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{"setupComplete":{}}\\n')); controller.close(); } }) },
    "@/lib/voice/relay-redis": { getVoiceRelayRedis: async () => ({ get: async () => id, xAdd: async (_key: string, _marker: string, payload: any) => uploaded.push(JSON.parse(payload.body)) }), relayOwnerKey: (value: string) => value, relayInputKey: (value: string) => value },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("lib/voice/relay-route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => mocks[name] ?? requireModule(name), Request, Response, Headers, ReadableStream, TextEncoder, console });
  const request = (body: object) => new Request("https://fixture.test/api/chat/voice-relay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const response = await exports.handleVoiceRelay(request({}), "web");
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Encoding")).toBe("identity");
  expect(response.headers.get("Cache-Control")).toContain("no-transform");
  expect(await response.text()).toContain("setupComplete");
  expect((await exports.handleVoiceRelay(request({ sessionId: id, messages: [{ setup: { model: "expensive-client-model" } }] }), "web")).status).toBe(400);
  expect(uploaded).toHaveLength(0);
  expect((await exports.handleVoiceRelay(request({ sessionId: id, messages: [{ realtimeInput: { audio: { data: "AAAA", mimeType: "audio/pcm;rate=16000" } } }] }), "web")).status).toBe(200);
  expect(uploaded).toHaveLength(1);
});


test("relay batches enough audio to sustain a connection whose RTT exceeds eight chunk durations", async () => {
  const uploads: any[] = [];
  let deliver: ((line: string) => void) | undefined;
  let finishStream: (() => void) | undefined;
  let finishUpload: (() => void) | undefined;
  const socket = new VoiceRelaySocket({
    stream: async (_body, line) => { deliver = line; await new Promise<void>(resolve => { finishStream = resolve; }); },
    upload: async body => { uploads.push(body); if (!(body as any).close) await new Promise<void>(resolve => { finishUpload = resolve; }); },
  });
  await expect.poll(() => Boolean(deliver)).toBe(true);
  if (!deliver) throw new Error("Stream not ready");
  deliver(JSON.stringify({ relayStarted: { sessionId: id } }));
  const chunk = JSON.stringify({ realtimeInput: { audio: { data: "AAAA", mimeType: "audio/pcm;rate=16000" } } });
  socket.send(chunk);
  await expect.poll(() => uploads.length).toBe(1);
  for (let i = 0; i < 24; i++) socket.send(chunk);
  if (!finishUpload) throw new Error("Upload not ready");
  finishUpload();
  await expect.poll(() => uploads.length).toBe(2);
  expect(uploads[1].messages).toHaveLength(24);
  socket.close();
  if (finishUpload) finishUpload();
  if (finishStream) finishStream();
});
