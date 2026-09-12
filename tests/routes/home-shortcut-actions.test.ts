import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import {
  getHomeShortcutTarget,
  getHomeShortcutTargets,
} from "@/lib/home-shortcut-registry";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("home shortcut actions", () => {
  test("uses stable logical targets with platform-specific destinations", () => {
    const calculator = getHomeShortcutTarget("calculator");
    expect(calculator).toMatchObject({
      access: "calculator",
      androidScreen: "Calculator",
      kind: "feature",
      webHref: "/calculator",
    });

    expect(getHomeShortcutTargets("tool").map((target) => target.id)).toEqual([
      "image_generation",
      "voice_chat",
    ]);
    expect(getHomeShortcutTarget("removed_feature")).toBeNull();
  });

  test("keeps legacy prompts backward compatible and filters linked targets", async () => {
    const source = await readWorkspaceFile("lib/icon-prompts.ts");

    expect(source).toContain('return isHomeShortcutActionType(value) ? value : "prompt"');
    expect(source).toContain('actionType === "prompt" ? hasPrompt || hasSuggestions');
    expect(source).toContain("isHomeShortcutTargetAvailable({");
    expect(source).toContain("target.kind === item.actionType");
    expect(source).toContain("availableTargetIds.has(target.id)");
    expect(source).toContain("Failed to confirm linked target");
  });

  test("resolves actions in web and requests Android-filtered mobile prompts", async () => {
    const [chat, bootstrap, mobilePrompts] = await Promise.all([
      readWorkspaceFile("components/chat.tsx"),
      readWorkspaceFile("app/api/mobile/bootstrap/route.ts"),
      readWorkspaceFile("app/api/mobile/prompts/route.ts"),
    ]);

    expect(chat).toContain('if (actionType === "feature")');
    expect(chat).toContain("router.push(target.webHref");
    expect(chat).toContain('if (actionType === "tool")');
    expect(chat).toContain('item.targetId === "image_generation"');
    expect(chat).toContain('item.targetId === "voice_chat"');
    expect(bootstrap).toContain('platform: "android"');
    expect(mobilePrompts).toContain('platform: "android"');
  });
});
