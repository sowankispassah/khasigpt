import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("native navigation back behavior", () => {
  test("hidden main tabs preserve Android hardware back history", async () => {
    const source = await readWorkspaceFile("native/src/navigation/MainTabs.tsx");
    const navigatorStart = source.indexOf("<Tab.Navigator");
    const firstScreenStart = source.indexOf("<Tab.Screen", navigatorStart);

    expect(navigatorStart).toBeGreaterThanOrEqual(0);
    expect(firstScreenStart).toBeGreaterThan(navigatorStart);

    const navigatorProps = source.slice(navigatorStart, firstScreenStart);
    expect(navigatorProps).toContain('initialRouteName="Chat"');
    expect(navigatorProps).toContain('backBehavior="history"');
    expect(source).toContain('tabBarStyle: {');
    expect(source).toContain('display: "none"');
  });
});
