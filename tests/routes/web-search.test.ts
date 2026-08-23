import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import type { ChatMessage } from "@/lib/types";
import {
  detectCurrentInfoNeed,
  detectWebSearchNeed,
  resolveCurrentInfoDecision,
  resolveWebSearchQuery,
} from "@/lib/web-search/detection";
import { clearTransientWebSearchMessages } from "@/lib/web-search/status";
import { getYouTubeVideoId } from "@/lib/web-search/youtube";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("web search grounding", () => {
  test("detects live time and weather questions before RAG or web search", () => {
    expect(detectCurrentInfoNeed("Katno baje mynta?")).toMatchObject({
      intent: "time",
      locationQuery: null,
    });
    expect(detectCurrentInfoNeed("Katno baje mynta ha Shillong?")).toMatchObject({
      intent: "time",
      locationQuery: "Shillong",
    });
    expect(detectCurrentInfoNeed("What time is it in London?")).toMatchObject({
      intent: "time",
      locationQuery: "London",
    });
    expect(detectCurrentInfoNeed("What is the current weather in Shillong?")).toMatchObject({
      intent: "weather",
      locationQuery: "Shillong",
    });
    expect(detectWebSearchNeed("Katno baje mynta?")).toMatchObject({
      currentInfoIntent: "time",
      shouldSearch: false,
    });
    expect(detectWebSearchNeed("What is the current weather in Shillong?")).toMatchObject({
      currentInfoIntent: "weather",
      shouldSearch: false,
    });
    expect(detectWebSearchNeed("What will the weather be tomorrow in Shillong?")).toMatchObject({
      currentInfoIntent: null,
      shouldSearch: true,
    });
    expect(detectWebSearchNeed("Search the web for the current weather in Shillong")).toMatchObject({
      currentInfoIntent: "weather",
      hasExplicitWebIntent: true,
      shouldSearch: true,
    });
    expect(
      resolveCurrentInfoDecision({
        currentText: "Shillong",
        previousUserMessages: ["What is the current temperature?"],
      }),
    ).toMatchObject({
      intent: "weather",
      locationQuery: "Shillong",
    });
    expect(
      resolveCurrentInfoDecision({
        currentText: "I'm currently in Bengaluru",
        previousUserMessages: ["What is the weather?"],
      }),
    ).toMatchObject({
      intent: "weather",
      locationQuery: "Bengaluru",
    });
    expect(
      resolveCurrentInfoDecision({
        currentText: "Why do you need it?",
        previousUserMessages: ["What is the temperature?"],
      }).intent,
    ).toBeNull();
  });

  test("detects current-information prompts without searching every message", () => {
    expect(detectWebSearchNeed("What is the latest KhasiGPT release?").shouldSearch).toBe(true);
    expect(detectWebSearchNeed("Explain photosynthesis in simple terms.").shouldSearch).toBe(false);
    expect(detectWebSearchNeed("Who is Jeimon Sumer?")).toMatchObject({
      hasCurrentIntent: true,
      shouldSearch: true,
    });
    expect(detectWebSearchNeed("Browse the net")).toMatchObject({
      hasExplicitWebIntent: true,
      shouldSearch: true,
    });
    expect(detectWebSearchNeed("Find me YouTube videos about phone repair")).toMatchObject({
      hasVideoIntent: true,
      shouldSearch: true,
    });
    expect(
      resolveWebSearchQuery({
        currentText: "browse the net",
        previousUserMessages: ["who is Jeimon Sumer"],
      })
    ).toBe("who is Jeimon Sumer");
    expect(getYouTubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(
      "dQw4w9WgXcQ"
    );
    expect(getYouTubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(detectWebSearchNeed("What is the current price and our message limit?")).toMatchObject({
      hasCurrentIntent: true,
      hasCustomKnowledgeIntent: true,
      shouldSearch: true,
    });
  });

  test("removes temporary status messages after the answer arrives", () => {
    const messages = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Find today's news" }],
      },
      {
        id: "placeholder-1",
        role: "assistant",
        parts: [
          {
            type: "data-webSearchStatus",
            data: { status: "searching", usedWebSearch: true },
          },
        ],
      },
      {
        id: "stream-status-1",
        role: "assistant",
        parts: [
          {
            type: "data-webSearchStatus",
            data: { status: "generating", usedWebSearch: true },
          },
        ],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Here are today's updates." }],
      },
    ] as ChatMessage[];

    const result = clearTransientWebSearchMessages(messages, {
      placeholderId: "placeholder-1",
      userMessageId: "user-1",
    });

    expect(result.map((message) => message.id)).toEqual([
      "user-1",
      "assistant-1",
    ]);
  });

  test("keeps grounding provider, admin controls, source streaming, and safe fallback wired", async () => {
    const [
      service,
      route,
      adminRoute,
      migration,
      chat,
      message,
      sources,
      nativeChat,
      nativeTypes,
    ] = await Promise.all([
      readWorkspaceFile("lib/web-search/service.ts"),
      readWorkspaceFile("app/(chat)/api/chat/route.ts"),
      readWorkspaceFile("app/api/admin/settings/web-search/route.ts"),
      readWorkspaceFile("lib/db/migrations/0088_web_search_usage.sql"),
      readWorkspaceFile("components/chat.tsx"),
      readWorkspaceFile("components/message.tsx"),
      readWorkspaceFile("components/web-search-sources.tsx"),
      readWorkspaceFile("native/src/screens/ChatScreen.tsx"),
      readWorkspaceFile("native/src/api/types.ts"),
    ]);

    expect(service).toContain('tools: [{ googleSearch: {} }]');
    expect(service).toContain("groundingSupports");
    expect(service).toContain("webSearchQueries");
    expect(service).toContain('case "openai_web_search"');
    expect(route).toContain("retrieveRagContext");
    expect(route).toContain("webSearchService.answerWithSearch");
    expect(route).toContain("resolveWebSearchQuery");
    expect(route).toContain("includeVideos: webSearchDecision.hasVideoIntent");
    expect(service).toContain("Prioritize relevant YouTube video results");
    expect(route).toContain('type: "data-webSources"');
    expect(route).toContain('type: "data-webSearchStatus"');
    expect(route).toContain("webSearchFinalStatusPart");
    expect(route).toContain("Falling back to normal model answer");
    expect(chat).toContain("sendMessageWithWebSearchStatus");
    expect(chat).toContain("clearTransientWebSearchMessages");
    expect(chat).not.toContain("isSearchingWeb");
    expect(message).toContain("WebSearchStatus");
    expect(message).toContain("isWebSearchStatusOnly");
    expect(message).toContain("WebSearchSources");
    expect(sources).toContain('data-testid="web-search-status"');
    expect(sources).toContain('data-testid="web-search-sources"');
    expect(sources).toContain("getProviderOpaqueSourceDomain");
    expect(sources).not.toContain("Google Search");
    expect(sources).not.toContain("getProviderCopy");
    expect(sources).not.toContain('data-testid="web-search-sources"\n      open');
    expect(message).not.toContain("provider={webSearchData.provider}");
    expect(route).not.toContain("provider: webSearchAnswer.provider");
    expect(nativeChat).toContain("WebSearchProgress");
    expect(nativeChat).toContain("getWebSearchCitationsFromMessage");
    expect(nativeChat).toContain("WebSearchVideoResults");
    expect(nativeChat).toContain("getWebSearchVideosFromMessage");
    expect(nativeChat).toContain("expandedWebSourcesByMessageId");
    expect(nativeChat).toContain("getProviderOpaqueWebSourceDomain");
    expect(nativeChat).not.toContain("isSearchingWeb");
    expect(nativeTypes).toContain('type: "data-webSearchStatus"');
    expect(adminRoute).toContain('requireAdminApiUser');
    expect(adminRoute).toContain('settings.web_search.update');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "WebSearchUsage"');
  });
});
