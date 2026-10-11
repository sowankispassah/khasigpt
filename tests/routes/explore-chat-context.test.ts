import { readFileSync } from "node:fs";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import { z } from "zod";
import { exploreLocationSchema } from "@/lib/explore/validation";

function harness() {
  const state = { user: { id: "user-a", role: "admin" }, enabled: true, allowed: true, chat: null as any, failure: false, writes: [] as any[] };
  const mocks: Record<string, unknown> = {
    "next/server": { NextResponse: { json: Response.json } }, zod: { z },
    "@/lib/api/auth": { getAuthenticatedUser: async () => state.user ? { user: state.user } : null },
    "@/lib/api/cache": { noStoreHeaders: () => ({ "Cache-Control": "no-store" }) },
    "@/lib/explore/config": { isExploreMeghalayaEnabledForRole: async () => state.enabled },
    "@/lib/explore/validation": { exploreLocationSchema },
    "@/lib/security/rate-limit": { incrementRateLimit: async () => ({ allowed: state.allowed }) },
    "@/lib/utils": { generateUUID: () => "message-id" },
    "@/lib/db/queries": {
      getChatById: async () => state.chat,
      saveChatAndMessagesWithTimestamps: async (input: any) => { if (state.failure) throw new Error("db unavailable"); state.writes.push(input); state.chat = { id: input.chatInput?.id, userId: state.user.id }; },
    },
  };
  const exports: any = {};
  const code = ts.transpileModule(readFileSync("app/api/explore/context/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, console: { error() {} }, require: (name: string) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  const input = { chatId: "3c3c3c3c-3333-4333-8333-333333333333", create: true, location: null, radiusKm: 10, query: "Nearby places", selectedResult: null, results: [] };
  return { state, input, post: (body: unknown = input) => exports.POST(new Request("https://test/api/explore/context", { method: "POST", body: JSON.stringify(body) })) as Promise<Response> };
}

test("popup context is authenticated, feature-gated, validated and rate limited", async () => {
  for (const [change, status] of [[{user:null},401],[{enabled:false},404],[{allowed:false},429],[{chat:{userId:"someone-else"}},403]] as const) {
    const h = harness(); Object.assign(h.state,change);
    const response = await h.post(); expect(response.status).toBe(status); expect(response.headers.get("Cache-Control")).toBe("no-store"); expect(h.state.writes).toHaveLength(0);
  }
  const h = harness(); expect((await h.post({...h.input, radiusKm:500})).status).toBe(400);
  expect((await h.post({...h.input, create:false})).status).toBe(403);
});

test("general and selected place contexts create private normal chats atomically and retries preserve history", async () => {
  const h = harness(); expect((await h.post()).status).toBe(200);
  expect(h.state.writes[0].chatInput).toMatchObject({ userId:"user-a", visibility:"private", mode:"default" });
  expect(h.state.writes[0].messages[0].parts[0]).toEqual({type:"data-exploreContext",data:{hidden:true}});
  expect(h.state.writes[0].messages[0].parts[1].text).toContain("general Explore conversation");
  expect((await h.post()).status).toBe(200); expect(h.state.writes).toHaveLength(1);
  const place = harness();
  expect((await place.post({...place.input, selectedResult:{name:"Langbang Cafe",address:"Shangpung",sourceUrl:"https://example.com",phone:"123",rating:4.5}})).status).toBe(200);
  const text = place.state.writes[0].messages[0].parts[1].text;
  expect(text).toContain("Primarily answer questions about this place"); expect(text).toContain('"phone":"123"'); expect(text).toContain("Do not invent missing menus");
});

test("failed persistence returns a recoverable error, never a success with missing context", async () => {
  const h = harness(); h.state.failure = true;
  const response = await h.post(); expect(response.status).toBe(503); expect(await response.json()).toEqual({error:"context_unavailable"}); expect(h.state.writes).toHaveLength(0);
});
