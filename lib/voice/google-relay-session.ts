import "server-only";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import WebSocket from "ws";
import { acquirePaidGenerationForUser, db, getCostPlusCreditQuote, getUserBalanceSummary, recordTokenUsage } from "@/lib/db/queries";
import { liveVoiceSession } from "@/lib/db/schema";
import { RAG_LIVE_SYSTEM_INSTRUCTION, RAG_LIVE_TOOL, RAG_LIVE_TOOL_NAME } from "@/lib/rag/live-tool";
import { retrieveRagContext } from "@/lib/rag/retrieval";
import { loadCustomKnowledgeEnabledCached } from "@/lib/rag/runtime-settings";
import type { ResolvedLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { getVoiceRelayRedis, relayInputKey, relayOwnerKey } from "@/lib/voice/relay-redis";

// A bounded HTTP response carries provider events; a Redis stream carries
// validated audio to the one server-owned Google connection across instances.
export async function createGoogleRelaySession(model: ResolvedLiveVoiceModelConfig, userId: string, platform: "web" | "native", signal: AbortSignal) {
  const apiKey = process.env.GOOGLE_API_KEY?.trim();
  if (model.provider !== "google" || !model.id || !apiKey) throw new Error("Voice unavailable");
  const inputRate = model.inputProviderCostPerMillion;
  const outputRate = model.outputProviderCostPerMillion;
  const reserveCost = (4096 * inputRate + 2048 * outputRate) / 1_000_000;
  const quote = await getCostPlusCreditQuote({ providerCostUsd: reserveCost, markupMultiplier: model.markupMultiplier });
  if (!quote) throw new Error("Voice pricing unavailable");
  const redis = await getVoiceRelayRedis();
  const admission = await acquirePaidGenerationForUser(userId, quote.creditUnits);
  let row: typeof liveVoiceSession.$inferSelect | undefined;
  let ws: WebSocket | undefined;
  let subscriber: ReturnType<typeof redis.duplicate> | undefined;
  try {
    [row] = await db.insert(liveVoiceSession).values({ userId, modelConfigId: model.id, platform,
      pricing: { providerKey: "google", inputCostPerMillionUsd: inputRate, outputCostPerMillionUsd: outputRate, ...quote } }).returning();
    if (!row) throw new Error("Voice persistence unavailable");
    const session = row;
    await redis.set(relayOwnerKey(session.id), userId, { EX: 300 });
    // A starting entry avoids '$' races before the first audio upload.
    await redis.xAdd(relayInputKey(session.id), "*", { body: "{}" });
    await redis.expire(relayInputKey(session.id), 300);
    subscriber = redis.duplicate();
    subscriber.on("error", () => console.warn("[voice-relay] Audio transport interrupted."));
    await subscriber.connect();
    const reader = subscriber;
    const knowledgeEnabled = await loadCustomKnowledgeEnabledCached().catch(() => false);
    ws = new WebSocket(`wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(apiKey)}`, { handshakeTimeout: 10000 });
    const socket = ws;
    let ended = false;
    let billingFailed = false;
    let providerReady = false;
    let stopping = false;
    let pendingInput = 0;
    let pendingOutput = 0;
    let lastPromptTokens = 0;
    let turn = 0;
    let queue = Promise.resolve();
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const encoder = new TextEncoder();
    const emit = (value: unknown) => { if (!ended) controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`)); };
    const send = (value: unknown) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); };
    const stop = () => { if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close(); };
    const finishBill = () => {
      const input = pendingInput; const output = pendingOutput;
      pendingInput = 0; pendingOutput = 0;
      if (!input && !output) return;
      const key = ++turn;
      queue = queue.then(() => recordTokenUsage({ userId, chatId: null, modelConfigId: null, liveVoiceModelConfigId: model.id,
        inputTokens: input, outputTokens: output, requestKey: `live:${session.id}:google:${key}`,
        generationPricing: { providerKey: "google", inputCostPerMillionUsd: inputRate, outputCostPerMillionUsd: outputRate, ...quote }
      })).then(() => undefined).catch(() => { billingFailed = true; stop(); });
    };
    const stream = new ReadableStream<Uint8Array>({ start(c) { controller = c; emit({ relayStarted: { sessionId: session.id } }); }, cancel() { stop(); } });
    let resolveFinished = () => {};
    const finished = new Promise<void>(resolve => { resolveFinished = resolve; });
    const started = Date.now();
    let audioBytes = 0;
    let lastActivity = started;
    const deadline = setTimeout(stop, 240000);
    const hardDeadline = setTimeout(() => socket.terminate(), 260000);
    const watchdog = setInterval(() => {
      if (Date.now() - lastActivity > 20000) stop();
      queue = queue.then(async () => {
        const balance = await getUserBalanceSummary(userId);
        const pendingCost = ((Math.max(lastPromptTokens, pendingInput) + 4096) * inputRate + (pendingOutput + 2048) * outputRate) / 1_000_000;
        if (balance.tokensRemaining < Math.ceil(pendingCost * quote.markupMultiplier * quote.usdToInr * quote.walletUnitsPerInr)) stop();
      }).catch(() => stop());
    }, 5000);
    signal.addEventListener("abort", stop, { once: true });
    socket.on("open", () => send({ setup: { model: `models/${model.providerModelId}`,
      generationConfig: { responseModalities: ["AUDIO"], maxOutputTokens: 2048, speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: model.voiceName } } } },
      systemInstruction: { parts: [{ text: `${model.systemInstruction}${knowledgeEnabled ? `\n${RAG_LIVE_SYSTEM_INSTRUCTION}` : ""}` }] },
      inputAudioTranscription: {}, outputAudioTranscription: {}, ...(knowledgeEnabled ? { tools: [RAG_LIVE_TOOL] } : {}),
      realtimeInputConfig: { automaticActivityDetection: { prefixPaddingMs: 180, silenceDurationMs: 1200 }, turnCoverage: "TURN_INCLUDES_ONLY_ACTIVITY" },
    } }));
    socket.on("message", raw => {
      let event: Record<string, any>;
      try { event = JSON.parse(raw.toString()); } catch { return; }
      if (event.error) { stop(); return; }
      if (event.setupComplete) {
        providerReady = true;
        void db.update(liveVoiceSession).set({ providerSessionId: `google:${session.id}`, status: "active", updatedAt: new Date() }).where(eq(liveVoiceSession.id, session.id)).catch(() => stop());
      }
      const usage = event.usageMetadata;
      if (usage) {
        pendingInput = Math.max(pendingInput, Number(usage.promptTokenCount) || 0);
        lastPromptTokens = pendingInput;
        pendingOutput = Math.max(pendingOutput, Number(usage.responseTokenCount) || 0);
      }
      if (event.serverContent?.turnComplete) { finishBill(); if (stopping) setTimeout(stop, 1000); }
      if (event.toolCall?.functionCalls) {
        queue = queue.then(async () => {
          const responses = [];
          for (const call of event.toolCall.functionCalls.slice(0, 4)) {
            if (call.name !== RAG_LIVE_TOOL_NAME) continue;
            const query = typeof call.args?.query === "string" ? call.args.query.slice(0, 2000) : "";
            const result = query ? await retrieveRagContext({ query, scope: "default", userId, modelKey: model.providerModelId }).catch(() => null) : null;
            responses.push({ id: call.id, name: call.name, response: { output: { context: result?.context.slice(0, 12000) ?? "", found: Boolean(result?.context), answerMode: result?.context ? "hybrid" : "general_knowledge" } } });
          }
          send({ toolResponse: { functionResponses: responses } });
        }).catch(() => stop());
      } else emit(event);
    });
    socket.on("error", () => stop());
    socket.once("close", () => {
      finishBill();
      ended = true;
      clearTimeout(deadline); clearTimeout(hardDeadline); clearInterval(watchdog);
      signal.removeEventListener("abort", stop);
      void queue.then(async () => {
        await db.update(liveVoiceSession).set({ status: billingFailed ? "billing_failed" : providerReady ? "completed" : "failed", observedSeconds: (Date.now() - started) / 1000, updatedAt: new Date() }).where(eq(liveVoiceSession.id, session.id));
        // CreditCharge owns the confirmed token totals; this row owns transport.
      }).catch(() => console.warn("[voice-relay] Session finalization failed.")).finally(async () => {
        await Promise.allSettled([redis.del([relayOwnerKey(session.id), relayInputKey(session.id)]), admission.release()]);
        if (reader.isOpen) reader.destroy();
        try { controller.close(); } catch { /* Client already disconnected. */ }
        resolveFinished();
      });
    });
    // Never depend on an in-memory session map: uploads may reach another instance.
    void (async () => {
      let cursor = "0-0";
      while (!ended) {
        const streams = await reader.xRead([{ key: relayInputKey(session.id), id: cursor }], { BLOCK: 1000, COUNT: 20 }) as Array<{ messages: Array<{ id: string; message: Record<string, string> }> }> | null;
        for (const entry of streams?.[0]?.messages ?? []) {
          cursor = entry.id;
          const payload = JSON.parse(entry.message.body);
          if (payload.sessionId) lastActivity = Date.now();
          if (payload.close) { stop(); break; }
          if (!providerReady) continue;
          for (const message of payload.messages ?? []) {
            lastActivity = Date.now();
            if (message.realtimeInput?.audio) {
              audioBytes += Buffer.byteLength(message.realtimeInput.audio.data, "base64");
              if (audioBytes > ((Date.now() - started) / 1000 + 2) * 32000) { stop(); break; }
            }
            if (message.realtimeInput?.audioStreamEnd) { stopping = true; setTimeout(stop, 10000); }
            send(message);
          }
        }
      }
    })().catch(() => stop());
    after(() => finished);
    return stream;
  } catch (error) {
    ws?.terminate();
    if (subscriber?.isOpen) subscriber.destroy();
    if (row) {
      await Promise.allSettled([redis.del([relayOwnerKey(row.id), relayInputKey(row.id)]), db.update(liveVoiceSession).set({ status: "failed", updatedAt: new Date() }).where(eq(liveVoiceSession.id, row.id))]);
    }
    await admission.release();
    throw error;
  }
}
