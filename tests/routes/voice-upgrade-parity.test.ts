import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("web and native voice credit failures use the shared upgrade prompt", async () => {
  const [webInput, webChat, webVoice, nativeChat] = await Promise.all([
    source("components/multimodal-input.tsx"),
    source("components/chat.tsx"),
    source("lib/voice/web-live-voice.ts"),
    source("native/src/screens/ChatScreen.tsx"),
  ]);

  expect(webVoice).toContain("class WebVoiceTokenError");
  expect(webVoice).toContain("response.status");
  expect(webInput).toContain('error.reason === "insufficient-credits"');
  expect(webInput).toContain("onUpgradeRequired()");
  expect(webChat).toContain(
    "onUpgradeRequired={() => setShowImageUpgradeDialog(true)}",
  );

  expect(nativeChat).toContain("error instanceof ApiHttpError");
  expect(nativeChat).toContain("error.status === 402");
  expect(nativeChat).toContain('error.responseBody.reason === "insufficient-credits"');
  expect(nativeChat).toContain("openImageUpgradePrompt()");
});
