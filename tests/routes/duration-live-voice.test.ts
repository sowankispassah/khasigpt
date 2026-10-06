import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { calculateCostPlusPreview } from "@/lib/billing/cost-plus";
import { appendDurationTranscript, groupDurationVoicePairs } from "@/lib/voice/duration-transcripts";
import { DEFAULT_DURATION_VOICE_PRICING, hasLiveVoicePricing, readDurationVoicePricing, unbilledVoiceSeconds } from "@/lib/voice/pricing";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const modelId = "11111111-1111-4111-8111-111111111111";
function sessionHarness() {
  const charges: any[] = [];
  const sent: any[] = [];
  const writes: any[] = [];
  const row = { id: modelId };
  let released = 0;
  let finalizer: (() => Promise<void>) | undefined;
  let socket: FakeSocket | undefined;
  class FakeSocket extends EventEmitter {
    static OPEN = 1;
    readyState = 1;
    constructor() { super(); socket = this; queueMicrotask(() => this.emit("open")); }
    send(value: string) { sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; this.emit("close"); }
    terminate() { this.close(); }
  }
  const chain: any = { values: () => chain, returning: async () => [row], set: (v: any) => { writes.push(v); return chain; }, where: async () => [] };
  const mocks: Record<string, any> = {
    "server-only": {}, "drizzle-orm": { eq: () => ({}), and: () => ({}) }, "next/server": { after: (fn: () => Promise<void>) => { finalizer = fn; } }, ws: FakeSocket,
    "@/lib/db/schema": { liveVoiceSession: { id: "id", userId: "userId" } },
    "@/lib/db/queries": { db: { insert: () => chain, update: () => chain }, acquirePaidGenerationForUser: async () => ({ release: async () => { released++; } }),
      getCostPlusCreditQuote: async () => ({ creditUnits: 100, markupMultiplier: 3, usdToInr: 100, walletUnitsPerInr: 500, pricingReferencePlanId: modelId }),
      getUserBalanceSummary: async () => ({ tokensRemaining: 999999 }), recordTokenUsage: async (charge: any) => { charges.push(charge); } },
    "@/lib/rag/retrieval": { retrieveRagContext: async () => ({ context: "fixture" }) },
    "@/lib/rag/runtime-settings": { loadCustomKnowledgeEnabledCached: async () => false },
    "@/lib/rag/live-tool": { RAG_LIVE_SYSTEM_INSTRUCTION: "fixture" },
    "@/lib/voice/pricing": { unbilledVoiceSeconds },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("lib/voice/duration-session.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText,
    { exports, require: (name: string) => mocks[name] ?? requireModule(name), process: { env: { OPENAI_API_KEY: "fixture-secret" } }, Buffer, AbortSignal, console, Date,
      setTimeout: () => 1, setInterval: () => 1, clearTimeout: () => {}, clearInterval: () => {},
      fetch: async (url: string) => ({ ok: true, json: async () => url.endsWith("/responses") ? { usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 40 }, output_tokens: 50 }, output: [{ content: [{ type: "output_text", text: "1316" }] }] } : { session: { id: "live_fixture" }, transport: { sdp: "fixture-answer" } } }) });
  return { exports, charges, writes, sent, get released() { return released; }, get socket() { if (!socket) throw new Error("Session socket not created"); return socket; }, finish: async () => { if (!finalizer) throw new Error("Session finalizer not registered"); await finalizer(); } };
}

test("duration pricing requires explicit complete prices and a 1–20x customer rate", () => {
  expect(readDurationVoicePricing(null)).toBeNull();
  expect(readDurationVoicePricing({ durationPricing: DEFAULT_DURATION_VOICE_PRICING })).toEqual(DEFAULT_DURATION_VOICE_PRICING);
  for (const customerChargePerMinuteUsd of [0, 0.01, 2, Number.NaN]) expect(readDurationVoicePricing({ durationPricing: { ...DEFAULT_DURATION_VOICE_PRICING, customerChargePerMinuteUsd } })).toBeNull();
  expect(hasLiveVoicePricing({ provider: "openai", providerModelId: "gpt-live-1", inputProviderCostPerMillion: 1, outputProviderCostPerMillion: 1, config: null })).toBe(false);
});

test("90 seconds including silence costs $0.075 and 3x converts through the recharge credit price", () => {
  const preview = calculateCostPlusPreview({ providerCostUsd: 90 / 60 * 0.05, markupMultiplier: 3, usdToInr: 100, walletUnitsPerInr: 500, walletUnitsPerCredit: 100 });
  expect(preview?.customerChargeInr).toBeCloseTo(22.5);
  expect(preview?.credits).toBeCloseTo(112.5);
  expect(unbilledVoiceSeconds(15, 12)).toBe(3);
  expect(unbilledVoiceSeconds(12, 15)).toBe(0);
  expect(unbilledVoiceSeconds(Number.NaN, 15)).toBe(0);
});

test("server charges cumulative duration once, including silence, and finalizes its pinned ledger", async () => {
  const h = sessionHarness();
  await h.exports.createDurationVoiceSession({ model: { id: modelId, providerModelId: "gpt-live-1", voiceName: "marin", systemInstruction: "fixture", durationPricing: DEFAULT_DURATION_VOICE_PRICING }, userId: modelId, platform: "web", sdp: "v=0 fixture offer" });
  h.socket.emit("message", Buffer.from(JSON.stringify({ type: "session.usage.updated", usage: { seconds: 20 } })));
  h.socket.emit("message", Buffer.from(JSON.stringify({ type: "session.usage.updated", usage: { seconds: 20 } })));
  h.socket.emit("message", Buffer.from(JSON.stringify({ type: "session.usage.updated", usage: { seconds: 18 } })));
  h.socket.emit("message", Buffer.from(JSON.stringify({ type: "session.closed", usage: { seconds: 21.5 } })));
  await h.finish();
  expect(h.charges.map(c => c.additionalCharges[0].unitCount)).toEqual([15, 5, 1.5]);
  expect(h.charges.every(c => c.billTokenUsage === false && c.generationPricing.usdToInr === 100 && Math.abs(c.additionalCharges[0].markupMultiplier - 3) < 0.000001)).toBe(true);
  expect(h.writes.some(w => w.status === "completed")).toBe(true);
  expect(h.released).toBe(1);
});

test("a transport loss retains confirmed usage and marks finalization unconfirmed", async () => {
  const h = sessionHarness();
  await h.exports.createDurationVoiceSession({ model: { id: modelId, providerModelId: "gpt-live-1", voiceName: "marin", systemInstruction: "fixture", durationPricing: DEFAULT_DURATION_VOICE_PRICING }, userId: modelId, platform: "native", sdp: "v=0 fixture offer" });
  h.socket.close(); await h.finish();
  expect(h.charges.map(c => c.additionalCharges[0].unitCount)).toEqual([15]);
  expect(h.writes.some(w => w.status === "unconfirmed")).toBe(true);
  expect(h.released).toBe(1);
});

test("backend usage prices cached input separately, deduplicates delegation, and returns a spoken result", async () => {
  const h = sessionHarness();
  await h.exports.createDurationVoiceSession({ model: { id: modelId, providerModelId: "gpt-live-1", voiceName: "marin", systemInstruction: "fixture", durationPricing: DEFAULT_DURATION_VOICE_PRICING }, userId: modelId, platform: "web", sdp: "v=0 fixture offer" });
  h.socket.emit("message", Buffer.from(JSON.stringify({ type: "session.input_transcript.delta", delta: "Calculate 28 times 47" })));
  const event = Buffer.from(JSON.stringify({ type: "session.delegation.created", delegation: { id: "delegation_fixture", target: "client" } }));
  h.socket.emit("message", event); h.socket.emit("message", event);
  await expect.poll(() => h.sent.some(e => e.type === "session.commentary.append" && e.content === "1316")).toBe(true);
  h.socket.emit("message", Buffer.from(JSON.stringify({ type: "session.closed", usage: { seconds: 15 } })));
  await h.finish();
  const backend = h.charges.filter(c => c.requestKey.includes(":backend:"));
  expect(backend).toHaveLength(1);
  expect(backend[0].additionalCharges[0].providerCostPerUnitUsd).toBeCloseTo(0.0000728, 8);
  expect(backend[0].additionalCharges[0].metadata.cachedInputTokens).toBe(40);
});

test("full-duplex captions preserve each speaker and exact fragment spaces", () => {
  let messages = appendDurationTranscript([], { type: "session.input_transcript.delta", delta: "Hello", start_ms: 0, end_ms: 500 }, modelId);
  messages = appendDurationTranscript(messages, { type: "session.output_transcript.delta", delta: "Hi", start_ms: 200, end_ms: 600 }, modelId);
  messages = appendDurationTranscript(messages, { type: "session.input_transcript.delta", delta: " there", start_ms: 500, end_ms: 800 }, modelId);
  expect(messages.map(m => m.text)).toEqual(["Hello there", "Hi"]);
  messages = appendDurationTranscript(messages, { type: "session.input_transcript.delta", delta: "Another question", start_ms: 5000, end_ms: 5500 }, modelId);
  expect(messages).toHaveLength(3);
});

test("transcript persistence includes a greeting and the later answer in one caller turn", () => {
  const messages = [
    { id: "user", role: "user" as const, text: "Calculate 28 times 47", voiceSessionId: modelId },
    { id: "greeting", role: "assistant" as const, text: "Hello!", voiceSessionId: modelId },
    { id: "answer", role: "assistant" as const, text: "The answer is 1316.", voiceSessionId: modelId },
  ];
  expect(groupDurationVoicePairs(messages)).toEqual([{ userText: "Calculate 28 times 47", assistantText: "Hello! The answer is 1316.", userSourceId: "user", assistantSourceId: "answer", voiceSessionId: modelId }]);
});
