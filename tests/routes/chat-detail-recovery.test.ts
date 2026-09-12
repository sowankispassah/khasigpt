import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("chat detail recovery", () => {
  test("isolates critical chat reads and recycles a timed-out connection", async () => {
    const [databaseSource, pageSource, apiSource] = await Promise.all([
      readWorkspaceFile("lib/db/chat-read-database.ts"),
      readWorkspaceFile("app/(chat)/chat/[id]/page.tsx"),
      readWorkspaceFile("app/(chat)/api/chat/[id]/messages/route.ts"),
    ]);

    expect(databaseSource).toContain("POSTGRES_CHAT_READ_OPERATION_TIMEOUT_MS");
    expect(databaseSource).toContain("recycleChatReadDatabase(state)");
    expect(databaseSource).toContain("expectedState.client.end({ timeout: 0 })");
    expect(databaseSource).toContain("recoverable && retry && attempt === 1");
    expect(pageSource).toContain('withChatReadDatabase("detail.lookup"');
    expect(pageSource).toContain('withChatReadDatabase("detail.messages"');
    expect(apiSource).toContain('withChatReadDatabase("messages.lookup"');
    expect(apiSource).toContain('withChatReadDatabase("messages.page"');
  });

  test("makes Retry an explicit pending server refresh", async () => {
    const [pageSource, actionsSource, definitionsSource] = await Promise.all([
      readWorkspaceFile("app/(chat)/chat/[id]/page.tsx"),
      readWorkspaceFile("components/chat-load-failure-actions.tsx"),
      readWorkspaceFile("lib/i18n/static-definitions.ts"),
    ]);

    expect(pageSource).toContain("<ChatLoadFailureActions />");
    expect(pageSource).not.toContain('href=""');
    expect(actionsSource).toContain("useTransition");
    expect(actionsSource).toContain("startRetry(() => router.refresh())");
    expect(actionsSource).toContain("disabled={isRetrying}");
    expect(actionsSource).toContain('aria-busy={isRetrying}');
    expect(actionsSource).toContain(
      'translationKey="chat.detail.load_failed.retrying"'
    );
    expect(definitionsSource).toContain(
      'key: "chat.detail.load_failed.retrying"'
    );
  });
});
