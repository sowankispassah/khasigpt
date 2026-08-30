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
import { extractShoppingProducts } from "@/lib/web-search/products";
import { mergeSemanticWebSearchDecision } from "@/lib/web-search/semantic-routing";
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

  test("detects live shopping requests without treating every find or recommendation as search", () => {
    for (const prompt of [
      "find me tshirt under 500 rupees",
      "Show me running shoes below ₹2,000",
      "Recommend a laptop deal under $500",
      "Where can I buy Lakadong turmeric?",
      "Help me find a cafe near me",
      "I want to order a Khasi book online",
    ]) {
      expect(detectWebSearchNeed(prompt)).toMatchObject({
        hasShoppingIntent: true,
        shouldSearch: true,
      });
    }

    for (const prompt of [
      "find me the derivative of x squared",
      "find me a story under 500 words",
      "recommend a Khasi poem",
      "suggest a name for my dog",
      "I bought a shirt for 500 rupees",
      "explain how online learning works",
      "find me a name for my online store",
    ]) {
      expect(detectWebSearchNeed(prompt)).toMatchObject({
        hasShoppingIntent: false,
        shouldSearch: false,
      });
    }
  });

  test("routes equivalent English, Khasi, mixed-language, and contextual intents identically", () => {
    const cases = [
      {
        english: "Find me a t-shirt under 500 rupees.",
        local: "Pynwad t-shirt ba hapoh 500 tyngka.",
        query: "t-shirts under 500 rupees",
        kind: "shopping" as const,
        reason: "shopping_discovery" as const,
      },
      {
        english: "What's happening in Shillong today?",
        local: "Kaei kaba dang jia mynta ha Shillong?",
        query: "current events in Shillong",
        kind: "news" as const,
        reason: "news_update" as const,
      },
      {
        english: "Find sneakers under 2000 rupees.",
        local: "Pynwad sneaker under 2000 rupees.",
        query: "sneakers under 2000 rupees",
        kind: "shopping" as const,
        reason: "shopping_discovery" as const,
      },
      {
        english: "What is the current iPhone 16 price?",
        local: "Katno ka dor jong iPhone 16 mynta?",
        query: "current iPhone 16 price",
        kind: "shopping" as const,
        reason: "current_information" as const,
      },
    ];

    for (const example of cases) {
      const semanticDecision = {
        intent: "web_search" as const,
        webSearch: {
          confidence: "high" as const,
          kind: example.kind,
          query: example.query,
          reason: example.reason,
        },
      };
      for (const prompt of [example.english, example.local]) {
        expect(
          mergeSemanticWebSearchDecision({
            deterministicDecision: detectWebSearchNeed(prompt),
            semanticDecision,
          })
        ).toMatchObject({
          hasShoppingIntent: example.kind === "shopping",
          shouldSearch: true,
        });
      }
      expect(semanticDecision.webSearch.query).toMatch(
        /500|2000|Shillong|iPhone 16/
      );
    }
  });

  test("uses semantic context for search follow-ups without locking later turns into search", () => {
    const priorSearch = detectWebSearchNeed("Tang kiba rong ïong.");
    expect(
      mergeSemanticWebSearchDecision({
        deterministicDecision: priorSearch,
        semanticDecision: {
          intent: "web_search",
          webSearch: {
            confidence: "high",
            kind: "shopping",
            query: "black t-shirts under 500 rupees",
            reason: "contextual_followup",
          },
        },
      })
    ).toMatchObject({ hasShoppingIntent: true, shouldSearch: true });

    for (const prompt of [
      "Khublei.",
      "Batai ïa ka photosynthesis ha ka ktien Khasi.",
      "Thoh poem shaphang Shillong.",
      "Kaei kaba nga dei ban peit haba thied running shoes?",
      "Kaei ka jingmut jong 'pynwad'?",
      "Thoh story shaphang u samla uba wad kam.",
      "Why do people search online before buying things?",
    ]) {
      expect(
        mergeSemanticWebSearchDecision({
          deterministicDecision: detectWebSearchNeed(prompt),
          semanticDecision: { intent: "normal_chat", webSearch: null },
        }).shouldSearch
      ).toBe(false);
    }

    expect(
      mergeSemanticWebSearchDecision({
        deterministicDecision: detectWebSearchNeed(
          "Check lada ka second one dang available."
        ),
        semanticDecision: {
          intent: "web_search",
          webSearch: {
            confidence: "high",
            kind: "shopping",
            query: "check current availability of the second product",
            reason: "current_availability",
          },
        },
      }).shouldSearch
    ).toBe(true);
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

  test("extracts only safe, usable shopping cards and removes private metadata", () => {
    const result = extractShoppingProducts(`Here are two current options.
<khasigpt_products>{"products":[
  {"title":"Classic T-shirt","url":"https://shop.example.com/products/classic","merchant":"Example Shop","price":"₹499","imageUrl":"https://cdn.example.com/classic.jpg","rating":4.6,"reviewCount":"1.6k"},
  {"title":"Unsafe link","url":"http://127.0.0.1/product","merchant":"Local","price":"₹1"},
  {"title":"Missing price","url":"https://shop.example.com/products/other","merchant":"Example Shop","price":"unknown"}
]}</khasigpt_products>`);

    expect(result.answer).toBe("Here are two current options.");
    expect(result.products).toEqual([
      expect.objectContaining({
        merchant: "Example Shop",
        price: "₹499",
        rating: 4.6,
        title: "Classic T-shirt",
        url: "https://shop.example.com/products/classic",
      }),
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
      semanticRouter,
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
      readWorkspaceFile("lib/ai/tool-intent-classifier.ts"),
    ]);

    expect(service).toContain('tools: [{ googleSearch: {} }]');
    expect(service).toContain("groundingSupports");
    expect(service).toContain("webSearchQueries");
    expect(service).toContain('case "openai_web_search"');
    expect(route).toContain("retrieveRagContext");
    expect(route).toContain("webSearchService.answerWithSearch");
    expect(route).toContain("classifyToolIntent");
    expect(route).toContain("verifyToolIntentToken");
    expect(route).toContain("resolveWebSearchQuery");
    expect(route).toContain("includeVideos: webSearchDecision.hasVideoIntent");
    expect(route).toContain("includeProducts: webSearchDecision.hasShoppingIntent");
    expect(service).toContain("<khasigpt_products>");
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
    expect(sources).toContain('data-testid="web-search-products"');
    expect(sources).toContain("getProviderOpaqueSourceDomain");
    expect(sources).not.toContain("Google Search");
    expect(sources).not.toContain("getProviderCopy");
    expect(sources).not.toContain('data-testid="web-search-sources"\n      open');
    expect(message).not.toContain("provider={webSearchData.provider}");
    expect(route).not.toContain("provider: webSearchAnswer.provider");
    expect(nativeChat).toContain("WebSearchProgress");
    expect(nativeChat).toContain("getWebSearchCitationsFromMessage");
    expect(nativeChat).toContain("WebSearchVideoResults");
    expect(nativeChat).toContain("WebSearchProductResults");
    expect(nativeChat).toContain("getWebSearchVideosFromMessage");
    expect(nativeChat).toContain("expandedWebSourcesByMessageId");
    expect(nativeChat).toContain("getProviderOpaqueWebSourceDomain");
    expect(nativeChat).not.toContain("isSearchingWeb");
    expect(nativeTypes).toContain('type: "data-webSearchStatus"');
    expect(semanticRouter).toContain("Classify by meaning and conversational context");
    expect(semanticRouter.toLowerCase()).toContain(
      "pynwad t-shirt ba hapoh 500 tyngka"
    );
    expect(semanticRouter).toContain("Tang kiba rong ïong");
    expect(semanticRouter).not.toContain("message.includes(\"pynwad\")");
    expect(adminRoute).toContain('requireAdminApiUser');
    expect(adminRoute).toContain('settings.web_search.update');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "WebSearchUsage"');
  });
});
