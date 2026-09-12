import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("app setting integrity migration", () => {
  test("repairs recursively encoded startup scalars and enforces constraints", async () => {
    const source = await readWorkspaceFile(
      "lib/db/migrations/0084_restore_app_setting_integrity.sql"
    );

    expect(source).toContain("FOR i IN 1..32 LOOP");
    expect(source).toContain("'chat.translate.enabled'");
    expect(source).toContain("'chat.translate.providerMode'");
    expect(source).toContain("'site.publicLaunched'");
    expect(source).toContain("AppSetting_value_size_check");
    expect(source).toContain("AppSetting_feature_access_scalar_check");
    expect(source).toContain("AppSetting_boolean_scalar_check");
    expect(source).toContain("VALIDATE CONSTRAINT");
  });

  test("records the forward repair after the legacy baseline", async () => {
    const journal = await readWorkspaceFile(
      "lib/db/migrations/meta/_journal.json"
    );

    expect(journal).toContain('"tag": "0084_restore_app_setting_integrity"');
    expect(journal.indexOf("0084_restore_app_setting_integrity")).toBeGreaterThan(
      journal.indexOf("0083_normalize_custom_knowledge_setting")
    );
  });
});
