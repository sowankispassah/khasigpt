import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

function extractFunctionSource(source: string, functionName: string) {
  const startMarker = `export async function ${functionName}`;
  const start = source.indexOf(startMarker);
  expect(start, `${functionName} should exist`).toBeGreaterThanOrEqual(0);

  const next = source.indexOf("\nexport async function ", start + startMarker.length);
  return source.slice(start, next === -1 ? undefined : next);
}

test.describe("admin model config database resilience", () => {
  test("clears old image active row before activating the new row", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");
    const setActiveSource = extractFunctionSource(
      source,
      "setActiveImageModelConfig"
    );
    const clearOldActive = setActiveSource.indexOf(".set({ isActive: false");
    const setNewActive = setActiveSource.indexOf(".set({ isActive: true");

    expect(clearOldActive).toBeGreaterThanOrEqual(0);
    expect(setNewActive).toBeGreaterThanOrEqual(0);
    expect(clearOldActive).toBeLessThan(setNewActive);
  });

  test("creates active image models atomically instead of partial-saving then failing", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");
    const createSource = extractFunctionSource(source, "createImageModelConfig");

    expect(createSource).toContain("return await db.transaction");
    expect(createSource).toContain("isActive: false");
    expect(createSource).not.toContain("await setActiveImageModelConfig(created.id)");

    const clearOldActive = createSource.indexOf(".set({ isActive: false");
    const setNewActive = createSource.indexOf(".set({ isActive: true");
    expect(clearOldActive).toBeGreaterThanOrEqual(0);
    expect(setNewActive).toBeGreaterThanOrEqual(0);
    expect(clearOldActive).toBeLessThan(setNewActive);
  });

  test("creates default live voice models in one transaction", async () => {
    const source = await readWorkspaceFile("lib/db/queries.ts");
    const createSource = extractFunctionSource(
      source,
      "createLiveVoiceModelConfig"
    );

    expect(createSource).toContain("return await db.transaction");
    expect(createSource).toContain("isDefault: false");
    expect(createSource).not.toContain(
      "await setDefaultLiveVoiceModelConfig(created.id)"
    );

    const clearOldDefault = createSource.indexOf(".set({ isDefault: false");
    const setNewDefault = createSource.indexOf(".set({ isDefault: true");
    expect(clearOldDefault).toBeGreaterThanOrEqual(0);
    expect(setNewDefault).toBeGreaterThanOrEqual(0);
    expect(clearOldDefault).toBeLessThan(setNewDefault);
  });

  test("uses low production DB pool fanout by default", async () => {
    const mainDbSource = await readWorkspaceFile("lib/db/queries.ts");
    const authDbSource = await readWorkspaceFile("lib/db/auth-queries.ts");
    const adminSettingsSource = await readWorkspaceFile(
      "app/(admin)/admin/settings/page.tsx"
    );

    expect(mainDbSource).toContain(
      'process.env.NODE_ENV === "development" ? 5 : usesSupabasePooler ? 1 : 2'
    );
    expect(authDbSource).toContain(
      'usesPooler ? 1 : process.env.NODE_ENV === "development" ? 3 : 1'
    );
    expect(adminSettingsSource).toContain(": hasConfiguredSupabasePoolerUrl()");
    expect(adminSettingsSource).toContain("? 1");
  });

  test("redirects image model creation to a confirmed success notice", async () => {
    const source = await readWorkspaceFile("app/(admin)/actions.ts");
    const createActionSource = extractFunctionSource(
      source,
      "createImageModelConfigAction"
    );

    expect(createActionSource).toContain(
      'redirect("/admin/settings?notice=image-model-created")'
    );
  });
});
