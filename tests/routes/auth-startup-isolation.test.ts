import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("auth startup isolation guardrails", () => {
  test("auth shell and auth copy pages do not load DB translation bundles", async () => {
    const fallbackSource = await readWorkspaceFile(
      "lib/i18n/auth-fallback-bundle.ts"
    );
    expect(fallbackSource).not.toContain("@/lib/db/");
    expect(fallbackSource).not.toContain("@/lib/i18n/dictionary");
    expect(fallbackSource).not.toContain("@/lib/i18n/languages");

    for (const relativePath of [
      "app/(auth)/layout.tsx",
      "app/(auth)/reset-password/page.tsx",
      "app/(auth)/verify-email/page.tsx",
      "app/(auth)/complete-profile/page.tsx",
    ]) {
      const source = await readWorkspaceFile(relativePath);
      expect(source).toContain("getAuthFallbackTranslationBundle");
      expect(source).not.toContain("@/lib/i18n/dictionary");
      expect(source).not.toContain("getTranslationBundle");
    }
  });

  test("web login action delegates user lookup to the credentials provider only", async () => {
    const source = await readWorkspaceFile("app/(auth)/actions.ts");
    const loginStart = source.indexOf("export const login");
    const registerStart = source.indexOf("export type RegisterActionState");

    expect(loginStart).toBeGreaterThanOrEqual(0);
    expect(registerStart).toBeGreaterThan(loginStart);
    expect(source.slice(loginStart, registerStart)).not.toContain("getUser(");
  });

  test("site-access admin saves do not read back the full settings snapshot", async () => {
    const source = await readWorkspaceFile(
      "app/api/admin/settings/site-access/route.ts"
    );
    const postStart = source.indexOf("export async function POST");

    expect(postStart).toBeGreaterThanOrEqual(0);
    const postSource = source.slice(postStart);
    expect(postSource).toContain("statePatch");
    expect(postSource).not.toContain("await loadSiteAccessState()");
  });
});
