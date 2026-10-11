import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { isFeatureEnabledForRole } from "@/lib/feature-access";
import {
  USER_FEATURE_ACCESS_KEYS,
  USER_FEATURE_DEFINITIONS,
} from "@/lib/feature-access-catalog";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("per-user feature access", () => {
  test("an explicit override wins and null keeps the global role result", () => {
    expect(isFeatureEnabledForRole("disabled", "regular", true)).toBe(true);
    expect(isFeatureEnabledForRole("enabled", "admin", false)).toBe(false);
    expect(isFeatureEnabledForRole("admin_only", "regular", null)).toBe(false);
    expect(isFeatureEnabledForRole("admin_only", "admin", null)).toBe(true);
  });

  test("catalog keys are unique and every feature has translated display metadata", () => {
    expect(new Set(USER_FEATURE_ACCESS_KEYS).size).toBe(
      USER_FEATURE_ACCESS_KEYS.length
    );
    expect(USER_FEATURE_DEFINITIONS).toHaveLength(USER_FEATURE_ACCESS_KEYS.length);
    for (const feature of USER_FEATURE_DEFINITIONS) {
      expect(feature.labelKey).toContain("admin.users.feature_access.feature.");
      expect(feature.descriptionKey).toContain(
        "admin.users.feature_access.feature."
      );
      expect(feature.defaultLabel.length).toBeGreaterThan(0);
    }
  });

  test("admin menu opens the isolated tri-state dialog and API saves only user overrides", async () => {
    const [menu, dialog, route, schema] = await Promise.all([
      readWorkspaceFile("components/admin-user-actions-menu.tsx"),
      readWorkspaceFile("components/admin-user-feature-access-dialog.tsx"),
      readWorkspaceFile("app/api/admin/users/[id]/feature-access/route.ts"),
      readWorkspaceFile("lib/db/schema.ts"),
    ]);

    expect(menu).toContain("<AdminUserFeatureAccessDialog");
    expect(menu).toContain('defaultText="Feature Access"');
    expect(dialog).toContain('["inherit", null, "Follow global"]');
    expect(dialog).toContain('["allow", true, "Allow"]');
    expect(dialog).toContain('["block", false, "Block"]');
    expect(dialog).toContain("disabled={!data || !changed || loading || saving}");
    expect(dialog).toContain("grid-rows-[auto_minmax(0,1fr)_auto]");
    expect(dialog).toContain("touch-pan-y overflow-y-auto overscroll-contain");
    expect(route).toContain("replaceUserFeatureAccessOverrides");
    expect(route).not.toContain("revalidateTag");
    expect(schema).toContain('"UserFeatureAccessOverride"');
  });

  test("web and native feature read models resolve the same user override snapshot", async () => {
    const source = await readWorkspaceFile("lib/api/read-models.ts");
    const mobileBootstrap = await readWorkspaceFile(
      "app/api/mobile/bootstrap/route.ts"
    );
    const webFeatures = await readWorkspaceFile("app/api/web/features/route.ts");

    expect(source).toContain("loadUserFeatureAccessOverrides");
    expect(source).toContain("userFeatureAccess.values.get");
    expect(mobileBootstrap).toContain("loadFeatureAccessReadModel");
    expect(mobileBootstrap).toContain("userId");
    expect(webFeatures).toContain("loadFeatureAccessReadModel");
    expect(webFeatures).toContain("userId");
  });
});
