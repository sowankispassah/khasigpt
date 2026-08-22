import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const repoRoot = process.cwd();

async function readWorkspaceFile(relativePath: string) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test.describe("admin icon prompt editor", () => {
  test("shows configured prompts in an ordered management table", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/settings/icon-prompt-settings-form.tsx"
    );

    expect(source).toContain('<table className="w-full min-w-[860px]');
    expect(source).toContain("Label and prompt");
    expect(source).toContain("Behavior");
    expect(source).toContain("Status");
    expect(source).toContain("moveItem(item.id, -1)");
    expect(source).toContain("moveItem(item.id, 1)");
  });

  test("adding a prompt opens the newly created item in the focused editor", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/settings/icon-prompt-settings-form.tsx"
    );

    expect(source).toContain("const item = createEmptyItem();");
    expect(source).toContain("setItems((prev) => [...prev, item]);");
    expect(source).toContain("openEditor(item.id);");
    expect(source).toContain("item.id === selectedItemId");
    expect(source).toContain("editorRef.current?.scrollIntoView");
  });
});
