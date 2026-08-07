import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();
const chatRouteRoot = path.join(repoRoot, "app/(chat)");

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry);
      const entryStat = await stat(absolutePath);
      return entryStat.isDirectory() ? listFiles(absolutePath) : [absolutePath];
    })
  );
  return files.flat();
}

test.describe("chat route session isolation", () => {
  test("uses one bounded cached session read for rendered chat routes", async () => {
    const helperSource = await readWorkspaceFile(
      "app/(chat)/chat-route-session.ts"
    );

    expect(helperSource).toContain("withTimeout(auth(), CHAT_ROUTE_AUTH_TIMEOUT_MS");
    expect(helperSource).toContain(
      "export const getChatRouteSession = cache(readChatSessionWithTimeout)"
    );
    expect(helperSource).toContain("export async function getChatRequestSession()");

    const layoutSource = await readWorkspaceFile("app/(chat)/layout.tsx");
    const chatHomeSource = await readWorkspaceFile("app/(chat)/chat/page.tsx");
    const chatDetailSource = await readWorkspaceFile(
      "app/(chat)/chat/[id]/page.tsx"
    );

    expect(layoutSource).toContain("getChatRouteSession()");
    expect(chatHomeSource).toContain("getChatRouteSession()");
    expect(chatDetailSource).toContain("getChatRouteSession()");
  });

  test("does not call auth directly inside the chat route group", async () => {
    const files = (await listFiles(chatRouteRoot)).filter((file) =>
      /\.(ts|tsx)$/.test(file)
    );
    const offenders: string[] = [];

    for (const file of files) {
      if (file.endsWith(path.join("app/(chat)", "chat-route-session.ts"))) {
        continue;
      }
      const source = await readFile(file, "utf8");
      if (
        /import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*"@\/app\/\(auth\)\/auth"/.test(
          source
        ) ||
        source.includes("await auth()")
      ) {
        offenders.push(path.relative(repoRoot, file));
      }
    }

    expect(offenders).toEqual([]);
  });
});
