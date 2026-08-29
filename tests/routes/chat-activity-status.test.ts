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
  const [sources, chat, route, types, nativeChat, nativeStatus, nativeTypes] =
    await Promise.all([
      readWorkspaceFile("components/web-search-sources.tsx"),
      readWorkspaceFile("components/chat.tsx"),
      readWorkspaceFile("app/(chat)/api/chat/route.ts"),
      readWorkspaceFile("lib/web-search/types.ts"),
      readWorkspaceFile("native/src/screens/ChatScreen.tsx"),
      readWorkspaceFile("native/src/components/AnimatedStatusText.tsx"),
      readWorkspaceFile("native/src/api/types.ts"),
    ]);

  expect(sources).toContain("Checking additional sources");
  expect(sources).toContain("Checking the latest sources");
  expect(sources).toContain("<AnimatedStatus");
  expect(sources).not.toContain("Searching the web...");
  expect(types).toContain('context?: "web" | "news"');
  expect(route).toContain(
    'resolvedChatMode === NEWS_CHAT_MODE ? "news" : "web"'
  );
  expect(chat).toContain("contextOverride");
  expect(chat).toContain("const stopChat = useCallback");
  expect(chat).toContain("message.id !== pendingWebSearch.placeholderId");

  expect(nativeStatus).toContain("AccessibilityInfo.isReduceMotionEnabled");
  expect(nativeStatus).toContain('"reduceMotionChanged"');
  expect(nativeStatus).toContain("clearInterval(interval)");
  expect(nativeChat).toContain("Checking additional sources");
  expect(nativeChat).toContain("Checking the latest sources");
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
