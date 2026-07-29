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
  const [webVoice, nativeVoice, webToken, nativeToken] = await Promise.all([
    source("lib/voice/web-live-voice.ts"),
    source("native/src/lib/gemini-live-voice.ts"),
    source("app/api/chat/voice-token/route.ts"),
    source("app/api/mobile/chat/voice-token/route.ts"),
  ]);

  for (const client of [webVoice, nativeVoice]) {
    expect(client).toContain("tokenResponse.tools");
    expect(client).toContain("toolResponse: { functionResponses }");
  }
  expect(webVoice).toContain('fetch("/api/rag/search"');
  expect(nativeVoice).toContain("api.searchCustomKnowledge(query)");
  expect(webToken).toContain("RAG_LIVE_TOOL");
  expect(nativeToken).toContain("RAG_LIVE_TOOL");
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
