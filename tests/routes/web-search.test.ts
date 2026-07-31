import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { detectWebSearchNeed } from "@/lib/web-search/detection";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("web search grounding", () => {
  test("detects current-information prompts without searching every message", () => {
    expect(detectWebSearchNeed("What is the latest KhasiGPT release?").shouldSearch).toBe(true);
    expect(detectWebSearchNeed("Explain photosynthesis in simple terms.").shouldSearch).toBe(false);
    expect(detectWebSearchNeed("What is the current price and our message limit?")).toMatchObject({
      hasCurrentIntent: true,
      hasCustomKnowledgeIntent: true,
      shouldSearch: true,
    });
  });

  test("keeps grounding provider, admin controls, source streaming, and safe fallback wired", async () => {
    const [service, route, adminRoute, migration] = await Promise.all([
      readWorkspaceFile("lib/web-search/service.ts"),
      readWorkspaceFile("app/(chat)/api/chat/route.ts"),
      readWorkspaceFile("app/api/admin/settings/web-search/route.ts"),
      readWorkspaceFile("lib/db/migrations/0088_web_search_usage.sql"),
    ]);

    expect(service).toContain('tools: [{ googleSearch: {} }]');
    expect(service).toContain('case "openai_web_search"');
    expect(route).toContain("retrieveRagContext");
    expect(route).toContain("webSearchService.answerWithSearch");
    expect(route).toContain('type: "data-webSources"');
    expect(route).toContain("Falling back to normal model answer");
    expect(adminRoute).toContain('requireAdminApiUser');
    expect(adminRoute).toContain('settings.web_search.update');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "WebSearchUsage"');
  });
});
