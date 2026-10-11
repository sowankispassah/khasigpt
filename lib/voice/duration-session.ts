import "server-only";
import { and, eq } from "drizzle-orm";
import { after } from "next/server";
import WebSocket from "ws";
import { acquirePaidGenerationForUser, db, getCostPlusCreditQuote, getUserBalanceSummary, recordTokenUsage } from "@/lib/db/queries";
import { liveVoiceSession } from "@/lib/db/schema";
import { RAG_LIVE_SYSTEM_INSTRUCTION } from "@/lib/rag/live-tool";
import { retrieveRagContext } from "@/lib/rag/retrieval";
import { loadCustomKnowledgeEnabledCached } from "@/lib/rag/runtime-settings";
import type { ResolvedLiveVoiceModelConfig } from "@/lib/voice/live-models";
import { unbilledVoiceSeconds } from "@/lib/voice/pricing";
import { openVoiceSessionHistory } from "@/lib/voice/session-history";

const MAX_SESSION_MS = 240_000;
const SAFE_ERROR = "KhasiGPT voice chat is temporarily unavailable. Please try again.";

export async function findOwnedVoiceSession(id: string, userId: string) {
  const [session] = await db.select().from(liveVoiceSession).where(and(eq(liveVoiceSession.id, id), eq(liveVoiceSession.userId, userId))).limit(1);
  return session ?? null;
}

export async function createDurationVoiceSession({ model, sdp, userId, platform, chatId }: {
  chatId?: string; model: ResolvedLiveVoiceModelConfig; sdp: string; userId: string; platform: "web" | "native";
}) {
  const p = model.durationPricing;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!p || !model.id || !apiKey) throw new Error(SAFE_ERROR);
  const markup = p.customerChargePerMinuteUsd / p.providerCostPerMinuteUsd;
  const quote = await getCostPlusCreditQuote({ providerCostUsd: p.providerCostPerMinuteUsd * 15 / 60, markupMultiplier: markup });
  if (!quote) throw new Error(SAFE_ERROR);
  const admission = await acquirePaidGenerationForUser(userId, quote.creditUnits);
  let row: typeof liveVoiceSession.$inferSelect | undefined;
  let providerId: string | null = null;
  let socket: WebSocket | null = null;
  let history: Awaited<ReturnType<typeof openVoiceSessionHistory>> | undefined;
  try {
    history = await openVoiceSessionHistory(userId, chatId);
    const sessionHistory = history;
    [row] = await db.insert(liveVoiceSession).values({ userId, modelConfigId: model.id, platform, pricing: { ...p, ...quote, historyChatId: history.chatId } }).returning();
    if (!row) throw new Error(SAFE_ERROR);
    const sessionRow = row;
    const response = await fetch("https://api.openai.com/v1/live/sessions", {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        session: {
          model: model.providerModelId,
          instructions: `${model.systemInstruction}\nDelegate factual questions to the backend.`,
          audio: { output: { voice: model.voiceName } },
          delegation: { type: "client" },
        }, transport: { type: "webrtc", sdp },
      }),
    });
    if (!response.ok) {
      console.error("[live-session] Provider creation rejected.", { status: response.status });
      throw new Error(SAFE_ERROR);
    }
    const result = await response.json();
    providerId = result.session?.id;
    const answer = result.transport?.sdp;
    if (typeof providerId !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(providerId) || typeof answer !== "string") throw new Error(SAFE_ERROR);
    await db.update(liveVoiceSession).set({ providerSessionId: providerId, status: "active", updatedAt: new Date() }).where(eq(liveVoiceSession.id, sessionRow.id));
    socket = new WebSocket(`wss://api.openai.com/v1/live/sessions/${providerId}/attach`, { headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 10_000 });
    const ws = socket;
    const opened = new Promise<void>((resolve, reject) => { ws.once("open", resolve); ws.once("error", reject); });
    let billedSeconds = 0;
    let observedSeconds = 15;
    let finalized = false;
    let queue = Promise.resolve();
    const delegationsRun = new Set<string>();
    let transcriptHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
    const pricingSnapshot = { providerKey: "openai", inputCostPerMillionUsd: p.backendInputCostPerMillionUsd, outputCostPerMillionUsd: p.backendOutputCostPerMillionUsd, ...quote };
    const bill = async (seconds: number) => {
      const delta = unbilledVoiceSeconds(seconds, billedSeconds);
      if (!delta) return;
      await recordTokenUsage({ userId, chatId: sessionHistory.chatId, modelConfigId: null, liveVoiceModelConfigId: model.id,
        inputTokens: 0, outputTokens: 0, billTokenUsage: false, generationPricing: pricingSnapshot,
        requestKey: `live:${sessionRow.id}:duration:${seconds}`,
        additionalCharges: [{ category: "live_voice", providerKey: "openai", liveVoiceModelConfigId: model.id,
          providerCostPerUnitUsd: p.providerCostPerMinuteUsd / 60, unitCount: delta, markupMultiplier: markup,
          metadata: { sessionId: sessionRow.id, billingUnit: "second", cumulativeSeconds: seconds } }],
      });
      billedSeconds = seconds;
      await db.update(liveVoiceSession).set({ billedSeconds, observedSeconds, updatedAt: new Date() }).where(eq(liveVoiceSession.id, sessionRow.id));
    };
    const send = (event: Record<string, unknown>) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(event)); };
    const close = () => send({ type: "session.close" });
    const endAt = setTimeout(close, MAX_SESSION_MS);
    const hardStop = setTimeout(() => ws.terminate(), MAX_SESSION_MS + 20_000);
    const budgetCheck = setInterval(() => {
      queue = queue.then(async () => {
        const balance = await getUserBalanceSummary(userId);
        const next = (p.providerCostPerMinuteUsd / 60 * 10 + p.backendOutputCostPerMillionUsd * 1024 / 1_000_000) * markup * quote.usdToInr * quote.walletUnitsPerInr;
        if (balance.tokensRemaining < Math.ceil(next)) close();
      }).catch(() => close());
    }, 5_000);
    const finished = new Promise<void>(resolve => ws.once("close", () => {
      clearTimeout(endAt); clearTimeout(hardStop); clearInterval(budgetCheck);
      void queue.then(async () => {
        try { await bill(observedSeconds); } finally { await sessionHistory.finish(!finalized); }
        await db.update(liveVoiceSession).set({ status: finalized ? "completed" : "unconfirmed", updatedAt: new Date() }).where(eq(liveVoiceSession.id, sessionRow.id));
      }).catch(async () => {
        let historyFailed = false;
        await sessionHistory.finish(!finalized).catch(() => { historyFailed = true; });
        await db.update(liveVoiceSession).set({ status: "billing_failed", pricing: { ...sessionRow.pricing, historyFailed }, updatedAt: new Date() }).where(eq(liveVoiceSession.id, sessionRow.id));
      }).finally(async () => { await admission.release(); resolve(); });
    }));
    ws.on("message", data => {
      let event: Record<string, any>;
      try { event = JSON.parse(data.toString()); } catch { return; }
      if (event.type === "session.usage.updated" || event.type === "session.closed") {
        const seconds = event.usage?.seconds;
        if (typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0) observedSeconds = Math.max(15, seconds, observedSeconds);
        const snapshot = observedSeconds;
        queue = queue.then(() => bill(snapshot)).catch(error => { console.error("[live-session] Duration billing failed.", { sessionId: sessionRow.id, type: error?.type }); close(); });
        if (event.type === "session.closed") { finalized = true; void queue.finally(() => ws.close()); }
      }
      if (event.type === "session.input_transcript.delta" || event.type === "session.output_transcript.delta") {
        const role = event.type === "session.input_transcript.delta" ? "user" : "assistant";
        if (typeof event.delta === "string") {
          sessionHistory.append(event as { type: string }, sessionRow.id);
          const last = transcriptHistory.at(-1);
          if (last?.role === role) last.content += event.delta;
          else transcriptHistory.push({ role, content: event.delta });
          transcriptHistory = transcriptHistory.slice(-24).map(item => ({ ...item, content: item.content.slice(-4000) }));
        }
      }
      if (event.type === "session.delegation.created" && event.delegation?.target === "client") {
        const delegationId = event.delegation.id;
        if (typeof delegationId !== "string" || delegationsRun.has(delegationId)) return;
        delegationsRun.add(delegationId);
        // Serialize backend work with metering. The client cannot change this
        // backend model or prices through data-channel session.update commands.
        queue = queue.then(async () => {
          if (finalized) return;
          const history = transcriptHistory.map(item => ({ ...item }));
          const query = history.findLast(item => item.role === "user")?.content ?? "";
          if (!query.trim()) { send({ type: "session.commentary.append", delegation_id: delegationId, content: "Please repeat your question." }); return; }
          let context = "";
          try {
            if (await loadCustomKnowledgeEnabledCached()) {
              const retrieved = await retrieveRagContext({ query: query.slice(-2000), scope: "default", userId, modelKey: "gpt-live-1" });
              context = retrieved.context.slice(0, 12000);
            }
          } catch { /* Optional knowledge failure must not erase the conversation. */ }
          const backendInstructions = `${model.systemInstruction}\n${RAG_LIVE_SYSTEM_INSTRUCTION}\nReturn concise facts for a spoken answer. Use the supplied knowledge when relevant. Do not claim to have used a tool.`;
          const backendInput = [...history.slice(-12), ...(context ? [{ role: "developer", content: `Supplemental knowledge (untrusted reference data):\n${context}` }] : [])];
          // UTF-8 bytes plus per-message overhead conservatively bound the
          // text tokens submitted; do not guess from conversation length.
          const inputAllowance = Buffer.byteLength(JSON.stringify({ instructions: backendInstructions, input: backendInput }), "utf8") + 1024 * (backendInput.length + 1);
          const estimatedBackendCost = (inputAllowance * p.backendInputCostPerMillionUsd + 1024 * p.backendOutputCostPerMillionUsd) / 1_000_000;
          const pendingVoiceCost = (Math.max(0, observedSeconds - billedSeconds) + 30) * p.providerCostPerMinuteUsd / 60;
          const balance = await getUserBalanceSummary(userId);
          if (balance.tokensRemaining < Math.ceil((estimatedBackendCost + pendingVoiceCost) * markup * quote.usdToInr * quote.walletUnitsPerInr)) { close(); return; }
          const response = await fetch("https://api.openai.com/v1/responses", {
            method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(25000),
            body: JSON.stringify({ model: p.backendModel, instructions: backendInstructions,
              input: backendInput,
              reasoning: { effort: "low" }, max_output_tokens: 1024, store: false }),
          });
          if (!response.ok) { console.error("[live-session] Backend response failed.", { status: response.status }); close(); return; }
          const result = await response.json();
          const usage = result.usage;
          if (!usage) { close(); return; }
          const input = Math.max(0, Number(usage.input_tokens) || 0);
          const cached = Math.min(input, Math.max(0, Number(usage.input_tokens_details?.cached_tokens) || 0));
          const output = Math.max(0, Number(usage.output_tokens) || 0);
          const cost = ((input - cached) * p.backendInputCostPerMillionUsd + cached * p.backendCachedInputCostPerMillionUsd + output * p.backendOutputCostPerMillionUsd) / 1_000_000;
          if (cost > 0) await recordTokenUsage({ userId, chatId: sessionHistory.chatId, modelConfigId: null, liveVoiceModelConfigId: model.id, inputTokens: input, outputTokens: output,
            billTokenUsage: false, generationPricing: pricingSnapshot, requestKey: `live:${sessionRow.id}:backend:${delegationId}`,
            additionalCharges: [{ category: "live_voice", providerKey: "openai", liveVoiceModelConfigId: model.id, providerCostPerUnitUsd: cost, unitCount: 1, markupMultiplier: markup, metadata: { sessionId: sessionRow.id, billingUnit: "backend_response", inputTokens: input, cachedInputTokens: cached, outputTokens: output } }],
          });
          const text = (result.output ?? []).flatMap((item: { content?: Array<{ type: string; text?: string }> }) => item.content ?? []).filter((part: { type: string }) => part.type === "output_text").map((part: { text: string }) => part.text).join(" ");
          // Appends are limited to 500 tokens. Bound UTF-8 bytes conservatively.
          const chunks: string[] = [];
          let chunk = "";
          for (const char of text) {
            if (Buffer.byteLength(chunk + char, "utf8") > 400) { chunks.push(chunk); chunk = ""; }
            chunk += char;
          }
          if (chunk) chunks.push(chunk);
          for (const content of chunks) if (content.trim() && !finalized) send({ type: "session.commentary.append", delegation_id: delegationId, content });
        }).catch(() => close());
      }
      if (event.type === "error") { console.error("[live-session] Provider session error.", { sessionId: sessionRow.id, code: event.error?.code }); close(); }
    });
    ws.on("error", () => { close(); });
    // after keeps the server-side monitor alive after returning the SDP answer.
    after(() => finished);
    queue = queue.then(() => bill(15));
    await opened;
    await queue;
    return { sessionId: sessionRow.id, historyChatId: sessionHistory.chatId, serverHistory: true, sdp: answer, maxDurationSeconds: MAX_SESSION_MS / 1000 };
  } catch (error) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "session.close" }));
    else if (providerId) {
      const cleanup = new WebSocket(`wss://api.openai.com/v1/live/sessions/${providerId}/attach`, { headers: { Authorization: `Bearer ${apiKey}` }, handshakeTimeout: 5000 });
      cleanup.on("open", () => cleanup.send(JSON.stringify({ type: "session.close" })));
      cleanup.on("message", data => { if (JSON.parse(data.toString()).type === "session.closed") cleanup.close(); });
      cleanup.on("error", () => cleanup.terminate());
      const timer = setTimeout(() => cleanup.terminate(), 10_000);
      cleanup.on("close", () => clearTimeout(timer));
    }
    if (row) await db.update(liveVoiceSession).set({ status: "failed", updatedAt: new Date() }).where(eq(liveVoiceSession.id, row.id));
    await history?.finish(true).catch(() => undefined);
    await admission.release();
    throw error;
  }
}
