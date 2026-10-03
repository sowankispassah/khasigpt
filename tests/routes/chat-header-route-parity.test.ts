import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const root = process.cwd();

async function source(relativePath: string) {
  return readFile(path.join(root, relativePath), "utf8");
}

test("web and native chat headers share home and detail controls", async () => {
  const [webHeader, nativeChat] = await Promise.all([
    source("components/chat-header.tsx"),
    source("native/src/screens/ChatScreen.tsx"),
  ]);

  expect(webHeader).toContain("const isChatDetailPage = pathname.startsWith");
  expect(webHeader).toContain("isChatDetailPage ? null : (");
  expect(webHeader).toContain('defaultText="KhasiGPT"');
  expect(webHeader).toContain(
    "isChatDetailPage && (!open || windowWidth < 768)",
  );

  expect(nativeChat).toContain(
    "middleContent={isChatDetailView ? newChatHeaderButton : undefined}",
  );
  expect(nativeChat).toContain(
    'title={isStudyMode ? "Study Mode" : isNewsMode ? "News" : "KhasiGPT"}',
  );
});
