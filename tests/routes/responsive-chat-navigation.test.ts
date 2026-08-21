import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("responsive chat navigation", () => {
  test("keeps the mobile header compact and reserves room for the account control", async () => {
    const source = await readWorkspaceFile("components/chat-header.tsx");

    expect(source).toContain("gap-1.5");
    expect(source).toContain("pr-[4.5rem]");
    expect(source).toContain("h-8 gap-1.5 px-2 text-sm");
  });

  test("caps the account menu to the viewport without making it full width", async () => {
    const source = await readWorkspaceFile("components/user-dropdown-menu.tsx");

    expect(source).toContain(
      "w-[min(16rem,calc(100vw-1rem))] min-w-0 sm:min-w-[16rem]"
    );
  });
});
