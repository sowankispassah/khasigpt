import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { confirmVoiceHistory, VoiceHistoryReadError } from "@/lib/voice/confirmed-history";
import { appendDurationTranscript } from "@/lib/voice/duration-transcripts";

const requireModule = createRequire(path.join(process.cwd(), "package.json"));
const id = "11111111-1111-4111-8111-111111111111";
function journalHarness(foreign = false) {
  const saved = new Map<string, any>();
  const chatWrites: any[] = [];
  const chat = { id: "chat.id", userId: "chat.userId", deletedAt: "chat.deletedAt" };
  const message = { id: "message.id" };
  let inserted: any;
  const db: any = {
    insert: (table: any) => ({ values: (value: any) => {
      if (table === chat) inserted = value;
      return { onConflictDoNothing: () => ({ returning: async () => [{ id }] }), onConflictDoUpdate: async () => { saved.set(value.id, value); } };
    } }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id, userId: foreign ? "foreign" : id, deletedAt: null }] }) }) }),
    update: () => ({ set: (value: any) => ({ where: async () => { chatWrites.push(value); } }) }),
    transaction: async (fn: (tx: any) => unknown) => fn(db),
  };
  const mocks: Record<string, any> = {
    "server-only": {}, "drizzle-orm": { eq: () => ({}), and: () => ({}), isNull: () => ({}) },
    "@/lib/db/queries": { db }, "@/lib/db/schema": { chat, message },
    "@/lib/errors": { ChatSDKError: class extends Error {} },
    "@/lib/voice/duration-transcripts": { appendDurationTranscript },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("lib/voice/session-history.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => mocks[name] ?? requireModule(name), crypto: webcrypto, Date, console, setTimeout, clearTimeout });
  return { exports, saved, chatWrites, get inserted() { return inserted; } };
}

test("the server reserves history immediately and saves a greeting-first conversation without a client save", async () => {
  const h = journalHarness();
  const history = await h.exports.openVoiceSessionHistory(id, id);
  expect(h.inserted.id).toBe(id);
  history.append({ type: "session.output_transcript.delta", delta: "Hello!", start_ms: 0, end_ms: 100 }, id);
  history.append({ type: "session.input_transcript.delta", delta: "Calculate", start_ms: 200, end_ms: 500 }, id);
  history.append({ type: "session.input_transcript.delta", delta: " 28 times 47", start_ms: 500, end_ms: 600 }, id);
  history.append({ type: "session.output_transcript.delta", delta: "1316", start_ms: 700, end_ms: 1000 }, id);
  await history.finish();
  expect([...h.saved.values()].map(m => m.parts[0].text)).toEqual(["Hello!", "Calculate 28 times 47", "1316"]);
  expect(h.chatWrites.some(w => w.title === "Calculate 28 times 47")).toBe(true);
  expect(h.chatWrites.at(-1).status).toBe("completed");
  await history.finish();
  expect(h.saved.size).toBe(3);
});

test("closing or disconnecting retains partial speech and the last completed assistant reply", async () => {
  const h = journalHarness(); const history = await h.exports.openVoiceSessionHistory(id, id);
  history.append({ type: "session.input_transcript.delta", delta: "First question", start_ms: 0, end_ms: 200 }, id);
  history.append({ type: "session.output_transcript.delta", delta: "Answer", start_ms: 300, end_ms: 500 }, id);
  history.append({ type: "session.input_transcript.delta", delta: "Unfinished next question", start_ms: 3000, end_ms: 3300 }, id);
  await history.finish(true);
  expect(h.saved.size).toBe(3);
  expect(h.chatWrites.at(-1).status).toBe("failed");
});

test("checkpointing persists live captions before a terminal event arrives", async () => {
  const h = journalHarness(); const history = await h.exports.openVoiceSessionHistory(id, id);
  history.append({ type: "session.input_transcript.delta", delta: "Survives a lost browser", start_ms: 0, end_ms: 500 }, id);
  await expect.poll(() => h.saved.size).toBe(1);
  await history.finish(true);
});

test("a caller cannot attach server voice history to another account’s chat", async () => {
  const h = journalHarness(true);
  await expect(h.exports.openVoiceSessionHistory(id, id)).rejects.toThrow();
  expect(h.saved.size).toBe(0);
  expect(h.chatWrites).toHaveLength(0);
});


test("history reads enforce ownership, expose pending state, and never re-charge a completed session", async () => {
  let auth: any = { user: { id } };
  let owned: any = { status: "active", pricing: { historyChatId: id } };
  let readerUserId = id;
  const mocks: Record<string, any> = {
    "@/lib/api/auth": { getAuthenticatedUser: async () => auth },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/db/queries": { getChatById: async () => ({ id, userId: readerUserId, title: "Fixture", status: "completed" }), getMessagesByChatIdPage: async () => ({ messages: [{ id, role: "user", parts: [{type: "text", text: "Saved"}] }], hasMore: false }) },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: true }) },
    "@/lib/utils": { convertToUIMessages: (messages: any) => messages },
    "@/lib/utils/async": { withTimeout: (value: unknown) => value },
    "@/lib/voice/duration-session": { findOwnedVoiceSession: async () => owned },
  };
  const exports: any = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("lib/voice/session-history-route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name: string) => mocks[name] ?? requireModule(name), Request, Response, URL });
  const request = () => new Request(`https://fixture.test/api/chat/voice-history?sessionId=${id}`);
  expect((await exports.handleVoiceSessionHistory(request(), false)).status).toBe(202);
  owned.status = "completed";
  const done = await exports.handleVoiceSessionHistory(request(), true);
  expect(done.status).toBe(200);
  expect(done.headers.get("Cache-Control")).toBe("no-store");
  expect((await done.json()).messages).toHaveLength(1);
  readerUserId = "foreign";
  expect((await exports.handleVoiceSessionHistory(request(), false)).status).toBe(404);
  owned = null;
  expect((await exports.handleVoiceSessionHistory(request(), false)).status).toBe(404);
  auth = null;
  expect((await exports.handleVoiceSessionHistory(request(), false)).status).toBe(401);
});


test("a transient history read is retried once without starting another generation", async () => {
  let reads = 0;
  const saved = await confirmVoiceHistory(async () => {
    if (++reads === 1) throw new VoiceHistoryReadError("temporary", 503);
    return { pending: false, messages: ["saved"] };
  });
  expect(reads).toBe(2);
  expect(saved.messages).toEqual(["saved"]);
  for (const status of [401, 403, 404]) {
    let denied = 0;
    await expect(confirmVoiceHistory(async () => { denied++; throw new VoiceHistoryReadError("denied", status); })).rejects.toThrow("denied");
    expect(denied).toBe(1);
  }
  let failures = 0;
  await expect(confirmVoiceHistory(async () => { failures++; throw new Error("offline"); })).rejects.toThrow("offline");
  expect(failures).toBe(2);
});
