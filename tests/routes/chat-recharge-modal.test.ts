import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { isRechargeRequiredChatError } from "@/lib/chat/recharge-error";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test.describe("chat recharge error handling", () => {
  test("classifies stable quota and credit errors without relying on one message", () => {
    expect(
      isRechargeRequiredChatError({ surface: "chat", type: "rate_limit" })
    ).toBe(true);
    expect(
      isRechargeRequiredChatError({ code: "payment_required:free_messages" })
    ).toBe(true);
    expect(
      isRechargeRequiredChatError({ code: "payment_required:credits" })
    ).toBe(true);
    expect(
      isRechargeRequiredChatError(
        new Error("You have exceeded your maximum number of messages for the day.")
      )
    ).toBe(true);
    expect(
      isRechargeRequiredChatError(
        new Error("I couldn't complete the web search. Please try again.")
      )
    ).toBe(false);
  });

  test("routes web and native quota failures into their existing recharge modal", async () => {
    const [webChat, nativeChat, nativeClassifier] = await Promise.all([
      source("components/chat.tsx"),
      source("native/src/screens/ChatScreen.tsx"),
      source("native/src/lib/chat-recharge-error.ts"),
    ]);

    expect(webChat).toContain("isRechargeRequiredChatError(error)");
    expect(webChat).toContain("setShowRechargeDialog(true)");
    expect(webChat).not.toContain('router.replace("/chat", { scroll: false })');
    expect(webChat).toContain('"chat.recharge.alert.description"');

    expect(nativeClassifier).toContain('"rate_limit:chat"');
    expect(nativeClassifier).toContain('"payment_required:free_messages"');
    expect(nativeChat).toContain('openImageUpgradePrompt("chat")');
    expect(nativeChat).toContain('upgradePromptContext === "chat"');
    expect(nativeChat).toContain('"chat.recharge.alert.description"');
    expect(nativeChat).not.toContain("setChatError(errorMessage);\n          if (!isInitialNewsRequest)");
  });
});
