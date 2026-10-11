import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";

const workspaceRequire = createRequire(path.join(process.cwd(), "package.json"));
const { build } = createRequire(workspaceRequire.resolve("tsx"))("esbuild");
let bundle: string;

test.beforeAll(async () => {
  const output = await build({
    stdin: { contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExploreAdminManager} from './components/admin/explore-admin-manager'; createRoot(document.getElementById('root')).render(React.createElement(ExploreAdminManager,{initialCategories:window.testCategories ?? []}));", resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{ name: "translation-host", setup(plugin: any) {
      plugin.onResolve({ filter: /^@\/components\/translation-edit-provider$/ }, () => ({ path: "translation", namespace: "mock" }));
      plugin.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "import React from 'react'; export const EditableTranslation=({defaultText})=>React.createElement('span',null,defaultText);", loader: "js", resolveDir: process.cwd() }));
    } }],
  });
  bundle = output.outputFiles[0].text;
});

test("category editor has three fields and preserves input after a failed save, with pending feedback", async ({ page }) => {
  const writes: any[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("https://category.test/**", async (route) => {
    if (route.request().method() === "POST") {
      writes.push(route.request().postDataJSON());
      if (writes.length === 1) { await gate; await route.fulfill({ status: 503 }); }
      else await route.fulfill({ json: { ok: true } });
    } else if (route.request().url().endsWith("/api/admin/explore")) await route.fulfill({ json: { categories: [] } });
    else await route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
  });
  await page.goto("https://category.test");
  await page.addScriptTag({ content: bundle });
  await page.getByRole("button", { name: "Add Category", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("legend")).toHaveText(["Name", "Display order", "Internal search query"]);
  await expect(dialog.locator("input,select,textarea")).toHaveCount(3);
  await dialog.getByRole("group", { name: "Name", exact: true }).getByRole("textbox").fill("Eat Nearby");
  await dialog.getByRole("spinbutton").fill("4");
  await dialog.getByRole("group", { name: "Internal search query" }).getByRole("textbox").fill("restaurant");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Saving..." })).toBeDisabled();
  await expect.poll(() => writes.length).toBe(1);
  expect(writes[0]).toMatchObject({ action: "create_category", value: { name: "Eat Nearby", displayOrder: 4, searchQuery: "restaurant", searchType: "local", locationMode: "current_or_selected", resultType: "standard", isEnabled: true, showOnHome: true } });
  release();
  await expect(dialog.getByText("The Explore configuration could not be saved.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(dialog.getByRole("group", { name: "Name", exact: true }).getByRole("textbox")).toHaveValue("Eat Nearby");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes).toHaveLength(2);
});
