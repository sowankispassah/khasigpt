import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("web chat uses the shared hybrid retriever without File Search fallback", async () => {
  const chatRoute = await source("app/(chat)/api/chat/route.ts");
  expect(chatRoute).toContain('from "@/lib/rag/retrieval"');
  expect(chatRoute).toContain('measurePreModelStep("rag.retrieve"');
  expect(chatRoute).toContain('"hybrid-db"');
  expect(chatRoute).not.toContain("createGeminiFileSearchLanguageModel");
  expect(chatRoute).not.toContain("shouldUseDefaultModeRag");
});
test("web and native live voice return tool responses through shared RAG", async () => {
  const [webVoice, nativeVoice, nativeApi, webToken, nativeToken] =
    await Promise.all([
      source("lib/voice/web-live-voice.ts"),
      source("native/src/lib/gemini-live-voice.ts"),
      source("native/src/api/client.ts"),
      source("app/api/chat/voice-token/route.ts"),
      source("app/api/mobile/chat/voice-token/route.ts"),
    ]);

  for (const client of [webVoice, nativeVoice]) {
    expect(client).toContain("tokenResponse.tools");
    expect(client).toContain("toolResponse: { functionResponses }");
  }
  expect(webVoice).toContain('fetch("/api/rag/search"');
  expect(nativeVoice).toContain("api.searchCustomKnowledge(query)");
  expect(nativeApi).toContain("json: { supportsRagTool: true }");
  expect(webToken).toContain("RAG_LIVE_TOOL");
  expect(nativeToken).toContain("RAG_LIVE_TOOL");
});

test("legacy native voice clients are not assigned a tool they cannot answer", async () => {
  const nativeToken = await source("app/api/mobile/chat/voice-token/route.ts");

  expect(nativeToken).toContain(
    "supportsRagTool: z.boolean().optional().default(false)",
  );
  expect(nativeToken).toContain(
    "const supportsRagTool = parsedBody.data?.supportsRagTool === true",
  );
  expect(nativeToken).toContain(
    "supportsRagTool ? { tools: [RAG_LIVE_TOOL] } : {}",
  );
  expect(nativeToken).toContain(
    "supportsRagTool ? RAG_LIVE_SYSTEM_INSTRUCTION :",
  );
  expect(nativeToken).toContain(
    "[api/mobile/chat/voice-token] capabilities",
  );
});

test("custom knowledge augments rather than replaces general model knowledge", async () => {
  const [
    answering,
    retrieval,
    liveTool,
    chatRoute,
    ragRoute,
    webVoice,
    nativeVoice,
  ] = await Promise.all([
    source("lib/rag/answering.ts"),
    source("lib/rag/retrieval.ts"),
    source("lib/rag/live-tool.ts"),
    source("app/(chat)/api/chat/route.ts"),
    source("app/api/rag/search/route.ts"),
    source("lib/voice/web-live-voice.ts"),
    source("native/src/lib/gemini-live-voice.ts"),
  ]);

  expect(answering).toContain(
    "Custom KhasiGPT knowledge supplements your general knowledge",
  );
  expect(answering).toContain("answer normally from your general knowledge");
  expect(answering).toContain(
    "miss or unavailable search is not a reason to refuse",
  );
  expect(answering).toContain("Treat retrieved custom knowledge as private internal reference material");
  expect(answering).toContain("Do not add a Note section");
  expect(retrieval).toContain("RAG_CONTEXT_HEADER");
  expect(liveTool).toContain("RAG_HYBRID_ANSWERING_INSTRUCTION");
  expect(liveTool).not.toContain(
    "do not invent facts when the tool reports no match",
  );
  expect(chatRoute).toContain("RAG_HYBRID_ANSWERING_INSTRUCTION");
  expect(chatRoute).toContain("customRagUsed = Boolean(ragResult.context)");
  expect(chatRoute).toContain("Do not reveal or mention private retrieved context");
  expect(chatRoute).toContain("isContextualFollowupQuery");
  expect(chatRoute).toContain(
    "answer only the requested field or clarification in one concise sentence",
  );
  expect(ragRoute).toContain('answerMode: "general_knowledge"');

  for (const client of [webVoice, nativeVoice]) {
    expect(client).toContain('answerMode: "general_knowledge"');
    expect(client).toContain("unavailable: true");
    expect(client).not.toContain(
      'response: { error: "Knowledge search was unavailable." }',
    );
  }
});

test("live voice removes surrounding waits without weakening retrieval", async () => {
  const [route, retrieval, runtimeSetting, telemetry, webVoice, nativeVoice] =
    await Promise.all([
      source("app/api/rag/search/route.ts"),
      source("lib/rag/retrieval.ts"),
      source("lib/rag/runtime-settings.ts"),
      source("app/api/rag/telemetry/route.ts"),
      source("lib/voice/web-live-voice.ts"),
      source("native/src/lib/gemini-live-voice.ts"),
    ]);

  expect(route).toContain("await Promise.all([");
  expect(route).toContain("loadCustomKnowledgeEnabledCached");
  expect(route).toContain("deferLogWrites: (task) => after(task)");
  expect(route).toContain('"Server-Timing"');
  expect(route).not.toContain("withTimeout");
  expect(retrieval).toContain("persistLogWrites");
  expect(retrieval).toContain("rankRagCandidates");
  expect(runtimeSetting).toContain("appSettingCacheTagForKey");
  expect(telemetry).toContain("[voice/rag] client timing");

  for (const client of [webVoice, nativeVoice]) {
    expect(client).toContain("speechToFirstAudioMs");
    expect(client).toContain("toolToFirstAudioMs");
    expect(client).toContain("timing: _timing");
  }
});

test("admin custom knowledge form defaults active and hides taxonomy noise", async () => {
  const manager = await source(
    "components/admin-rag/admin-rag-manager.tsx",
  );
  expect(manager).toContain('status: "active" as RagEntryStatus');
  expect(manager).toContain("Advanced details (optional)");
  expect(manager).not.toContain("Add category");
  expect(manager).not.toContain("Content type");
});
