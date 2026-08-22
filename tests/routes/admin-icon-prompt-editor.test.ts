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

    expect(source).toContain('<table className="w-full min-w-[980px]');
    expect(source).toContain("Label and prompt");
    expect(source).toContain("Action");
    expect(source).toContain("Target");
    expect(source).toContain("Status");
    expect(source).toContain("moveItem(item.id, -1)");
    expect(source).toContain("moveItem(item.id, 1)");
  });

  test("adding and editing open the selected prompt in a modal", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/settings/icon-prompt-settings-form.tsx"
    );

    expect(source).toContain("const item = createEmptyItem();");
    expect(source).toContain("setItems((prev) => [...prev, item]);");
    expect(source).toContain("openEditor(item.id);");
    expect(source).toContain("item.id === selectedItemId");
    expect(source).toContain("open={selectedItemId !== null}");
    expect(source).toContain("<DialogContent");
    expect(source).toContain("onClick={() => void handleSaveFromEditor()}");
    expect(source).toContain('"Save changes"');
    expect(source).not.toContain("Done editing");
    expect(source).toContain('value="feature"');
    expect(source).toContain('value="tool"');
    expect(source).toContain("getHomeShortcutTargets(item.actionType)");
  });

  test("explains that active linked shortcuts still follow feature access", async () => {
    const source = await readWorkspaceFile(
      "app/(admin)/admin/settings/icon-prompt-settings-form.tsx"
    );

    expect(source).toContain('target.access !== "always"');
    expect(source).toContain('"Feature access applies"');
    expect(source).toContain(
      '"Availability and permissions come from the linked feature; this shortcut cannot override them."'
    );
  });

  test("bounds saves on the isolated admin database path", async () => {
    const actions = await readWorkspaceFile("app/(admin)/actions.ts");
    const queries = await readWorkspaceFile("lib/db/queries.ts");

    expect(actions).toContain('"[admin/icon-prompts] save:start"');
    expect(actions).toContain("ADMIN_ACTION_SETTING_TIMEOUT_MS");
    expect(actions).toContain("adminDatabase: true");
    expect(actions).toContain("revalidateCache: false");
    expect(actions).toContain("void createAuditLogEntrySafely({");
    expect(queries).toContain("if (options?.adminDatabase)");
    expect(queries).toContain("withAdminDatabase(");
    expect(queries).toContain("app-settings.upsert.");
  });
});
