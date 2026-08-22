import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("admin feature access mode control", () => {
  test("keeps the API-confirmed save value instead of resyncing unchanged stale props", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/settings/feature-access-mode-control.tsx"
    );

    expect(source).toContain("lastSyncedServerStateRef");
    expect(source).toContain("const serverStateChanged =");
    expect(source).toContain("if (!serverStateChanged || isSaving) {");
    expect(source).toContain('setDisplayReadState("confirmed")');
    expect(source).toContain(
      "<AccessModeBadge mode={mode} readState={displayReadState} />"
    );
  });
});