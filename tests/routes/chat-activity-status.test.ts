import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("web chat uses stable accessible animated text instead of thinking spinners", async () => {
  const [animatedStatus, thinkingStatus, messages, message, styles] =
    await Promise.all([
      readWorkspaceFile("components/animated-status.tsx"),
      readWorkspaceFile("components/chat-thinking-status.tsx"),
      readWorkspaceFile("components/messages.tsx"),
      readWorkspaceFile("components/message.tsx"),
      readWorkspaceFile("app/globals.css"),
    ]);

  expect(animatedStatus).toContain('aria-live="polite"');
  expect(animatedStatus).toContain('aria-hidden="true"');
  expect(animatedStatus).toContain("status-ellipsis");
  expect(animatedStatus).not.toContain("setInterval");
  expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  expect(styles).toContain("grid-template-columns: repeat(3");
  expect(thinkingStatus).toContain('defaultText = "Thinking"');
  expect(thinkingStatus).toContain('translationKey = "chat.status.thinking"');
  expect(messages).toContain("<ChatThinkingStatus />");
  expect(message).toContain("<ChatThinkingStatus");
  expect(message).not.toContain("showStreamingSpinner");
});

test("search and news progress use one minimal context-aware activity status", async () => {
  const [sources, chat, route, types, message, nativeChat, nativeStatus, nativeTypes] =
    await Promise.all([
      readWorkspaceFile("components/web-search-sources.tsx"),
      readWorkspaceFile("components/chat.tsx"),
      readWorkspaceFile("app/(chat)/api/chat/route.ts"),
      readWorkspaceFile("lib/web-search/types.ts"),
      readWorkspaceFile("components/message.tsx"),
      readWorkspaceFile("native/src/screens/ChatScreen.tsx"),
      readWorkspaceFile("native/src/components/AnimatedStatusText.tsx"),
      readWorkspaceFile("native/src/api/types.ts"),
    ]);

  expect(sources).toContain("Checking additional sources");
  expect(sources).toContain("Checking the latest sources");
  expect(sources).toContain("Gathering more information");
  expect(sources).toContain("Reviewing search results");
  expect(sources).toContain("Finalizing results");
  expect(sources).toContain("elapsedMs >= 2000");
  expect(sources).toContain("elapsedMs >= 5000");
  expect(sources).toContain("elapsedMs >= 8000");
  expect(sources).toContain("<Info");
  expect(sources).toContain("({safeSources.length})");
  expect(sources).toContain("overlay?: boolean");
  expect(sources).toContain("onExpandedChange?: (expanded: boolean) => void");
  expect(sources).toContain("onToggle={(event) => onExpandedChange?.(event.currentTarget.open)}");
  expect(sources).toContain("group-open:w-[min(36rem,calc(100vw-2rem))]");
  expect(sources).toContain("group-open:w-full");
  expect(sources).toContain("ml-auto w-fit group-open:ml-0");
  expect(sources).toContain("ml-auto flex w-fit");
  expect(sources).toContain("<AnimatedStatus");
  expect(sources).not.toContain("Searching the web...");
  expect(types).toContain('context?: "web" | "news"');
  expect(route).toContain(
    'resolvedChatMode === NEWS_CHAT_MODE ? "news" : "web"'
  );
  expect(message).toContain(
    "(hasWebSearchAnswer && part.data.status !== \"failed\")"
  );
  expect(message).toContain("pointer-events-none absolute right-3 top-1/2");
  expect(message).toContain('? "mt-2 w-full"');
  expect(message).toContain("overlay={!webSearchSourcesExpanded}");
  expect(message).toContain("<WebSearchProducts products={webSearchData.products} />");
  expect(chat).toContain("contextOverride");
  expect(chat).toContain("const stopChat = useCallback");
  expect(chat).toContain("message.id !== pendingWebSearch.placeholderId");

  expect(nativeStatus).toContain("AccessibilityInfo.isReduceMotionEnabled");
  expect(nativeStatus).toContain('"reduceMotionChanged"');
  expect(nativeStatus).toContain("clearInterval(interval)");
  expect(nativeChat).toContain("Checking additional sources");
  expect(nativeChat).toContain("Checking the latest sources");
  expect(nativeChat).toContain("Gathering more information");
  expect(nativeChat).toContain("Reviewing search results");
  expect(nativeChat).toContain("Finalizing results");
  expect(nativeChat).toContain("elapsedMs >= 2000");
  expect(nativeChat).toContain("elapsedMs >= 5000");
  expect(nativeChat).toContain("elapsedMs >= 8000");
  expect(nativeChat).toContain("<Info");
  expect(nativeChat).toContain("webSourcesCollapsedContent");
  expect(nativeChat).toContain("webSourcesCount");
  expect(nativeChat).toContain('position: "absolute"');
  expect(nativeChat).toContain('position: "relative"');
  expect(nativeChat).toContain('width: "100%"');
  expect(nativeChat).toContain("webSourcesExpanded");
  expect(nativeChat).toContain("styles.webSourcesCollapsedHeader");
  expect(nativeChat).toContain('alignSelf: "flex-end"');
  expect(nativeChat).toContain("<AnimatedStatusText");
  expect(nativeChat).not.toContain("function ThinkingText");
  expect(nativeChat).toContain("context: webSearchContext");
  expect(nativeChat).toContain("!item.text.trim() ? null");
  expect(nativeTypes).toContain('context?: "web" | "news"');
});

test("the scroll-to-bottom control remains functional but no longer overlays the status", async () => {
  const messages = await readWorkspaceFile("components/messages.tsx");

  expect(messages).toContain('translate("chat.scroll_to_bottom"');
  expect(messages).toContain("right-4 bottom-4");
  expect(messages).toContain('onClick={() => scrollToBottom("smooth")}');
});
