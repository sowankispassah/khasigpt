import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { buildPendingChatHref } from "@/lib/chat/navigation";
import {
  buildNewsChatTitle,
  buildNewsInitialPrompt,
  formatNewsRequestDate,
  isNewsInitialMessage,
  parseNewsAccessModeSetting,
  shouldSearchNewsFollowUp,
  shouldStartNewsInitialRequest,
} from "@/lib/news/shared";
import type { ChatMessage } from "@/lib/types";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("News chat mode", () => {
  test("defaults missing feature access to admin-only", () => {
    expect(parseNewsAccessModeSetting(undefined)).toBe("admin_only");
    expect(parseNewsAccessModeSetting("enabled")).toBe("enabled");
    expect(parseNewsAccessModeSetting("disabled")).toBe("disabled");
  });

  test("builds a current, Shillong-first grounded opening request", () => {
    const prompt = buildNewsInitialPrompt(new Date("2026-08-23T06:00:00Z"));
    expect(prompt).toContain("Shillong first");
    expect(prompt).toContain("across Meghalaya");
    expect(prompt).toContain("current web search results");
    expect(prompt).toContain("Deduplicate");
    expect(prompt).toContain("Begin directly with the news");
    expect(prompt).toContain("Do not introduce or describe KhasiGPT");
  });

  test("marks the automatic user turn as hidden and keeps follow-up search selective", () => {
    const message = {
      id: "00000000-0000-4000-8000-000000000001",
      role: "user",
      metadata: { createdAt: new Date().toISOString() },
      parts: [
        { type: "text", text: "internal news request" },
        { type: "data-newsInitial", data: { hidden: true } },
      ],
    } satisfies ChatMessage;

    expect(isNewsInitialMessage(message)).toBe(true);
    expect(shouldSearchNewsFollowUp("Any updates since then?")).toBe(true);
    expect(shouldSearchNewsFollowUp("Tell me more about the second story.")).toBe(
      true
    );
    expect(shouldSearchNewsFollowUp("What does that scheme mean?")).toBe(false);
    expect(shouldSearchNewsFollowUp("Thanks.")).toBe(false);
  });

  test("starts one server-owned News session and ignores stale normal chat components", () => {
    const chatId = "00000000-0000-4000-8000-000000000002";
    const baseState = {
      chatId,
      initialMessageCount: 0,
      isReadonly: false,
      lastStartedChatId: null,
      status: "ready",
    };

    expect(
      shouldStartNewsInitialRequest({ ...baseState, chatMode: "default" })
    ).toBe(false);
    expect(
      shouldStartNewsInitialRequest({ ...baseState, chatMode: "news" })
    ).toBe(true);
    expect(
      shouldStartNewsInitialRequest({
        ...baseState,
        chatMode: "news",
        lastStartedChatId: chatId,
      })
    ).toBe(false);

    expect(
      buildPendingChatHref({
        href: "/chat?mode=news&new=1",
        pendingChatId: chatId,
      })
    ).toBe(`/chat?mode=news&new=1&pendingChatId=${chatId}`);
    expect(
      buildPendingChatHref({
        href: "/chat?new=1",
        pendingChatId: chatId,
      })
    ).toBe(`/chat?new=1&pendingChatId=${chatId}`);
  });

  test("uses localized dated history titles", () => {
    const now = new Date("2026-08-23T06:00:00Z");
    expect(buildNewsChatTitle("en", now)).toContain("Today's news");
    expect(buildNewsChatTitle("kha", now)).toBe("Khubor — 23 Aug 2026");
    expect(formatNewsRequestDate(now)).toBe("23 Aug 2026");
  });

  test("wires web and native clients to the shared chat and search paths", async () => {
    const [
      webChat,
      chatLoader,
      chatHeader,
      nativeChat,
      chatRoute,
      sidebar,
      nativeSidebar,
    ] =
      await Promise.all([
        readWorkspaceFile("components/chat.tsx"),
        readWorkspaceFile("components/chat-loader.tsx"),
        readWorkspaceFile("components/chat-header.tsx"),
        readWorkspaceFile("native/src/screens/ChatScreen.tsx"),
        readWorkspaceFile("app/(chat)/api/chat/route.ts"),
        readWorkspaceFile("components/app-sidebar.tsx"),
        readWorkspaceFile("native/src/components/AppSidebar.tsx"),
      ]);

    expect(webChat).toContain('type: "data-newsInitial"');
    expect(webChat).toContain("newsRequestDate");
    expect(webChat).toContain("const resolvedChatMode = chatMode");
    expect(webChat).not.toContain('nextParams.delete("new")');
    expect(chatLoader).toContain('requestedMode === "news"');
    expect(chatHeader).toContain("buildPendingChatHref");
    expect(chatHeader).toContain('href: "/chat?new=1"');
    expect(chatHeader).not.toContain('"/chat?mode=news&new=1"');
    expect(nativeChat).toContain('type: "data-newsInitial"');
    expect(nativeChat).toContain("newsRequestDate");
    expect(nativeChat).toContain(
      'navigation.navigate("Chat", { newChat: true })'
    );
    expect(nativeChat).toContain("onPress={handleNewChatHeaderPress}");
    expect(chatRoute).toContain("shouldSearchInNewsMode");
    expect(chatRoute).toContain("Begin directly with the requested news");
    expect(sidebar).toContain("buildPendingChatHref");
    expect(sidebar).toContain("href={NEW_CHAT_HREF}");
    expect(sidebar).not.toContain("contextualNewChatHref");
    expect(sidebar).toContain('translationKey="sidebar.news"');
    expect(nativeSidebar).toContain('translationKey="sidebar.news"');
  });
});
