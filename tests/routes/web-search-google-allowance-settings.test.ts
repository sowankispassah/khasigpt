import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { expect, test } from "@playwright/test";
import ts from "typescript";
import * as policy from "@/lib/web-search/google-allowance-policy";
import { parseGoogleSearchAllowance } from "@/lib/web-search/google-allowance-policy";

function adminHarness(admin = true, env: Record<string, string> = { GOOGLE_API_KEY: "private-google-key", SERPER_API_KEY: "private-serper-key" }) {
  const writes: any[] = []; const invalidations: string[] = []; const exports: Record<string, any> = {};
  const mocks: Record<string, unknown> = {
    "drizzle-orm": {}, "next/cache": { revalidateTag: (tag: string) => invalidations.push(tag) },
    "next/server": { NextResponse: Response }, "@/lib/db/admin-database": {}, "@/lib/db/app-settings-lite": { createLiteAuditLogEntry: async () => {} }, "@/lib/db/schema": {},
    "@/lib/security/admin-api-auth": { requireAdminApiUser: async () => admin ? { id: "admin" } : null },
    "@/lib/web-search/config": { WEB_SEARCH_CONFIG_CACHE_TAG: "web-search-config", loadWebSearchConfig: async () => ({ readState: "confirmed" }), hasWebSearchProviderPricing: () => true },
    "@/lib/web-search/google-allowance-policy": policy,
    "@/lib/web-search/google-allowance": { saveGoogleSearchAllowance: async (input: any) => { writes.push(input); return { ...input, used: 7, reserved: 10 }; } },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync("app/api/admin/pricing/web-search/google-allowance/route.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, process: { env }, require: (name: string) => { if (!(name in mocks)) throw new Error(name); return mocks[name]; } });
  return { route: exports, writes, invalidations };
}
const post = (value: unknown) => new Request("https://settings.test/api/admin/pricing/web-search/google-allowance", { method: "POST", body: JSON.stringify(value) });
test("only admins can save allowance routing and submitted counters are rejected", async () => {
  const h = adminHarness(false);
  expect((await h.route.POST(post(parseGoogleSearchAllowance(undefined)))).status).toBe(403); expect(h.writes).toHaveLength(0);
  const allowed = adminHarness(); const { used: _used, reserved: _reserved, ...input } = parseGoogleSearchAllowance(undefined);
  for (const value of [{ ...input, used: 0 }, { ...input, limit: 6000 }, { ...input, model: "gemini-2.5-flash" }, { ...input, inputUsdPerMillion: 0 }, { ...input, fallbackProvider: "openai_web_search" }]) expect((await allowed.route.POST(post(value))).status).toBe(400);
  expect(allowed.writes).toHaveLength(0);
});
test("configured routing saves without leaking keys and invalidates only search caches", async () => {
  const h = adminHarness(); const { used: _used, reserved: _reserved, ...input } = parseGoogleSearchAllowance(undefined);
  const response = await h.route.POST(post({ ...input, enabled: true }));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(await response.text()).not.toContain("private-"); expect(h.writes).toHaveLength(1);
  expect(h.invalidations).toEqual(["web-search-google-allowance", "web-search-config"]);
  const missing = adminHarness(true, { GOOGLE_API_KEY: "private-key" });
  expect((await missing.route.POST(post({ ...input, enabled: true }))).status).toBe(409); expect(missing.writes).toHaveLength(0);
});

const workspaceRequire = createRequire(path.join(process.cwd(), "package.json"));
const { build } = createRequire(workspaceRequire.resolve("tsx"))("esbuild");
let bundle: string;
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "@/components/language-provider": "const translate=(key,text)=>text; export const useTranslation=()=>({translate});",
    "@/components/translation-edit-provider": "import React from 'react'; export const EditableTranslation=({defaultText,values})=>React.createElement('span',null,defaultText.replace(/{(w+)}/g,(match,key)=>values?.[key]??match));",
  };
  const output = await build({ stdin: { contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import {GoogleSearchAllowanceSettings} from './components/admin/google-search-allowance-settings'; createRoot(document.getElementById('root')).render(React.createElement(GoogleSearchAllowanceSettings,{onSaved:(value)=>window.saved=value}));", resolveDir: process.cwd(), loader: "tsx" }, bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"test"' }, plugins: [{ name: "admin-context-mocks", setup(plugin: any) { plugin.onResolve({ filter: /^@\/components\// }, ({ path: name }: { path: string }) => name in mocks ? { path: name, namespace: "mock" } : undefined); plugin.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }: { path: string }) => ({ contents: mocks[name], loader: "js", resolveDir: process.cwd() })); } }] });
  bundle = output.outputFiles[0].text;
});
test("admin edits the buffered monthly allowance and sends no stale usage counters", async ({ page }) => {
  let allowance = parseGoogleSearchAllowance(undefined); const writes: any[] = [];
  await page.route("https://settings.test/**", async (route) => {
    if (route.request().url().endsWith("/google-allowance")) {
      if (route.request().method() === "POST") { const input = route.request().postDataJSON(); writes.push(input); allowance = { ...allowance, ...input, used: 7 }; }
      await route.fulfill({ json: { allowance, models: [], configured: { google: true, serper: true } } });
    } else await route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' });
  });
  await page.goto("https://settings.test/"); await page.addScriptTag({ content: bundle });
  await page.getByRole("checkbox").check();
  await page.getByRole("spinbutton", { name: "Search queries to keep as a safety buffer" }).fill("200");
  await page.getByRole("button", { name: "Save allowance routing" }).click();
  await expect(page.getByText("Allowance routing saved.", { exact: false })).toBeVisible();
  expect(writes).toHaveLength(1); expect(writes[0]).toMatchObject({ enabled: true, limit: 5000, safetyBuffer: 200, fallbackProvider: "serper" }); expect(writes[0]).not.toHaveProperty("used"); expect(writes[0]).not.toHaveProperty("reserved");
});
test("an unavailable allowance shows recovery and leaves other admin controls usable", async ({ page }) => {
  await page.route("https://settings.test/**", async (route) => route.request().url().endsWith("/google-allowance") ? route.fulfill({ status: 503, json: { error: "unavailable" } }) : route.fulfill({ contentType: "text/html", body: '<button id="other">Other settings</button><div id="root"></div>' }));
  await page.goto("https://settings.test/"); await page.addScriptTag({ content: bundle });
  await expect(page.getByRole("alert")).toBeVisible(); await expect(page.getByRole("button", { name: "Reload allowance" })).toBeEnabled(); await expect(page.getByRole("button", { name: "Other settings" })).toBeEnabled();
});
