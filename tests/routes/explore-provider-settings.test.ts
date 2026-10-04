import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { parseGoogleBudget } from "@/lib/explore/google-budget-policy";
import { parsePhotoCachePolicy } from "@/lib/explore/photo-cache-policy";

const workspaceRequire = createRequire(path.join(process.cwd(), "package.json"));
const { build } = createRequire(workspaceRequire.resolve("tsx"))("esbuild");
let bundle: string;
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "@/components/language-provider": "const translate=(key,text)=>text; export const useTranslation=()=>({translate});",
    "@/components/translation-edit-provider": "import React from 'react'; export const EditableTranslation=({defaultText})=>React.createElement('span',null,defaultText);",
  };
  const output = await build({ stdin: { contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExploreProviderSettings} from './components/admin/explore-provider-settings'; createRoot(document.getElementById('root')).render(React.createElement(ExploreProviderSettings));", resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "admin-context-mocks", setup(plugin: any) { plugin.onResolve({filter:/^@\/components\//},({path: name}: {path:string})=>name in mocks ? {path:name,namespace:"mock"}:undefined); plugin.onLoad({filter:/.*/,namespace:"mock"},({path: name}: {path:string})=>({contents:mocks[name],loader:"js",resolveDir:process.cwd()})); } }] });
  bundle = output.outputFiles[0].text;
});

test("Serpent listing photo option survives a failed save and persists after reload", async ({ page }) => {
  let fail = true;
  const configuration = { provider: "serpent", configured: { google: true, serper: true, serpent: true, openstreetmap: true }, googleBudget: parseGoogleBudget(undefined), serpentMapsQuickEnabled: true, serpentPhotoSource: "maps_quick" };
  await page.route("https://settings.test/**", async (route) => {
    if (route.request().url().endsWith("/api/admin/explore/photo-cache")) return route.fulfill({ json: { photoCache: parsePhotoCachePolicy(undefined) } });
    if (!route.request().url().endsWith("/api/admin/explore/provider")) return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
    if (route.request().method() === "POST") {
      if (fail) return route.fulfill({ status: 503, json: { error: "save_failed" } });
      configuration.serpentMapsQuickEnabled = route.request().postDataJSON().serpentMapsQuickEnabled;
      configuration.serpentPhotoSource = route.request().postDataJSON().serpentPhotoSource;
    }
    return route.fulfill({ json: configuration });
  });
  await page.goto("https://settings.test/"); await page.addScriptTag({ content: bundle });
  const quick = page.getByRole("checkbox", { name: "Enable photos", exact: true });
  await expect(page.getByRole("combobox", { name: "Photo source", exact: true }).getByRole("option", { name: "Maps Place Details", exact: true })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Photo source", exact: true }).selectOption("maps_place");
  await quick.uncheck();
  await page.getByRole("button", { name: "Save provider", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(quick).toBeEnabled(); await expect(quick).not.toBeChecked();
  await expect(page.getByRole("combobox", { name: "Provider", exact: true })).toBeEnabled();
  await quick.check();
  await expect(page.getByRole("combobox", { name: "Photo source", exact: true })).toHaveValue("maps_place");
  fail = false;
  await page.getByRole("button", { name: "Save provider", exact: true }).click();
  await expect(page.getByText("Provider saved. New searches will use this selection.")).toBeVisible();
  await page.reload(); await page.addScriptTag({ content: bundle });
  await expect(page.getByRole("combobox", { name: "Photo source", exact: true })).toHaveValue("maps_place");
});
test("admin chooses Google with a separate fallback and saves both without exposing keys", async ({page}) => {
  let configuration = { provider: "serpent", configured: { google:true,serper:true,serpent:true,openstreetmap:true }, googleBudget: parseGoogleBudget(undefined), serpentMapsQuickEnabled: true, serpentPhotoSource: "maps_quick" };
  const writes: any[] = [];
  await page.route("https://settings.test/**", async (route) => {
    if (route.request().url().endsWith("/api/admin/explore/photo-cache")) return route.fulfill({ json: { photoCache: parsePhotoCachePolicy(undefined) } });
    if (route.request().url().endsWith("/api/admin/explore/provider")) {
      if (route.request().method() === "POST") { const body = route.request().postDataJSON(); writes.push(body); configuration = { ...configuration, ...body, googleBudget:{ ...body.googleBudget,searchUsed:2,photoUsed:5 } }; }
      await route.fulfill({json:configuration});
    } else await route.fulfill({contentType:"text/html",body:'<div id="root"></div>'});
  });
  await page.goto("https://settings.test/"); await page.addScriptTag({content:bundle});
  await expect(page.getByRole("combobox",{name:"Provider",exact:true})).toHaveValue("serpent");
  await expect(page.getByRole("checkbox",{name:"Enable photos",exact:true})).toBeChecked();
  await page.getByRole("checkbox",{name:"Enable photos",exact:true}).uncheck();
  await expect(page.getByRole("combobox",{name:"Fallback provider",exact:true})).toHaveCount(0);
  await page.getByRole("combobox",{name:"Provider",exact:true}).selectOption("google");
  await page.getByRole("checkbox",{name:"Switch provider after Google's free allowance"}).check();
  await page.getByRole("combobox",{name:"Fallback provider",exact:true}).selectOption("serpent");
  await expect(page.getByRole("checkbox",{name:"Enable photos",exact:true})).not.toBeChecked();
  await page.getByRole("spinbutton",{name:"Monthly Google search allowance"}).fill("7000");
  await page.getByRole("button",{name:"Save provider",exact:true}).click();
  await expect(page.getByText("Provider saved. New searches will use this selection.")).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({provider:"google",serpentMapsQuickEnabled:false,googleBudget:{enabled:true,fallbackProvider:"serpent",searchLimit:7000}});
  expect(writes[0].googleBudget.searchUsed).toBeUndefined();
  await expect(page.getByRole("button",{name:"Save provider",exact:true})).toBeDisabled();
  await page.reload(); await page.addScriptTag({content:bundle});
  await expect(page.getByRole("checkbox",{name:"Enable photos",exact:true})).not.toBeChecked();
});

test("photo cache duration and reset save independently, with confirmation and recoverable failures", async ({ page }) => {
  const configuration = { provider: "serpent", configured: { google:true, serper:true, serpent:true, openstreetmap:true }, googleBudget: parseGoogleBudget(undefined), serpentPhotoSource: "maps_place" };
  let photoCache = parsePhotoCachePolicy(undefined); let failReset = true;
  const writes: any[] = [];
  await page.route("https://settings.test/**", async (route) => {
    if (route.request().url().endsWith("/api/admin/explore/photo-cache")) {
      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON(); writes.push(body);
        if (body.action === "reset" && failReset) return route.fulfill({ status: 503, json: { error: "save_failed" } });
        photoCache = body.action === "save" ? { ...photoCache, successTtlSeconds: body.successTtlSeconds } : { ...photoCache, generation: "reset", lastResetAt: new Date().toISOString() };
      }
      return route.fulfill({ json: { photoCache } });
    }
    if (route.request().url().endsWith("/api/admin/explore/provider")) return route.fulfill({ json: configuration });
    return route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
  });
  await page.goto("https://settings.test/"); await page.addScriptTag({ content: bundle });
  const duration = page.getByRole("spinbutton", { name: "Successful photo expiry" });
  await expect(duration).toHaveValue("7");
  await duration.fill("366"); await expect(page.getByRole("button", { name: "Save cache duration", exact: true })).toBeDisabled();
  await duration.fill("365"); await page.getByRole("button", { name: "Save cache duration", exact: true }).click();
  await expect(page.getByText("Photo cache duration saved.", { exact: true })).toBeVisible();
  expect(writes[0]).toEqual({ action: "save", successTtlSeconds: 365 * 86_400 });
  await page.reload(); await page.addScriptTag({ content: bundle }); await expect(duration).toHaveValue("365");
  await page.getByRole("button", { name: "Reset photo cache", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click(); expect(writes).toHaveLength(1);
  await page.getByRole("button", { name: "Reset photo cache", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset photo cache", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0); await expect(page.getByRole("alert")).toBeVisible();
  await expect(duration).toBeEnabled(); await expect(duration).toHaveValue("365");
  failReset = false;
  await page.getByRole("button", { name: "Reset photo cache", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Reset photo cache", exact: true }).click();
  await expect(page.getByText("Photo cache reset. New photo lookups will fetch fresh results.", { exact: true })).toBeVisible();
  expect(photoCache.successTtlSeconds).toBe(365 * 86_400); expect(writes[2]).toEqual({ action: "reset" });
});
