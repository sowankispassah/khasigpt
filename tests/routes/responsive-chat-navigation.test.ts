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
    expect(source).toContain("pr-[5rem]");
    expect(source).not.toContain('className="-mr-1');
    expect(source).toContain("h-8 gap-1.5 px-2 text-sm");
  });

  test("shows visibility only on saved chat detail routes", async () => {
    const source = await readWorkspaceFile("components/chat-header.tsx");

    expect(source).toContain(
      'const isChatDetailPage = pathname.startsWith("/chat/")'
    );
    expect(source).toContain(
      "isChatDetailPage && !isReadonly && showInlineControls"
    );
    expect(source).toContain("showOnMobile");
  });

  test("keeps the responsive visibility trigger icon-only", async () => {
    const source = await readWorkspaceFile(
      "components/visibility-selector.tsx"
    );

    expect(source).toContain('import { Lock, LockOpen } from "lucide-react"');
    expect(source).toContain('className="sr-only"');
    expect(source).toContain("icon: <LockOpen size={16} />");
    expect(source).not.toContain("showLabelOnMobile");
  });

  test("caps the account menu to the viewport without making it full width", async () => {
    const source = await readWorkspaceFile("components/user-dropdown-menu.tsx");

    expect(source).toContain(
      "w-[min(15rem,calc(100vw-1rem))] min-w-0"
    );
    expect(source).toContain("max-sm:[&_[role=menuitem]]:py-1");
  });
});
