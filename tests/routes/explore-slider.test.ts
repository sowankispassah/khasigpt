import { createRequire } from "node:module";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";

// Render the actual client component with React, isolating only its shell and API.
// No production credentials, database, or paid place searches are used.
const workspaceRequire = createRequire(path.join(process.cwd(), "package.json"));
const { build } = createRequire(workspaceRequire.resolve("tsx"))("esbuild");
let bundle: string;

test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "next/navigation": "export const useRouter = () => ({push() {}});",
    "next/image": "export default function Image() { return null; }",
    "@/components/language-provider": "const translate = (key, fallback) => fallback; export const useTranslation = () => ({translate});",
    "@/components/translation-edit-provider": "import React from 'react'; export const EditableTranslation = ({defaultText}) => React.createElement('span',null,defaultText); export const useEditableTranslation = (key,text) => ({text,editButton:null});",
    "@/lib/ui/global-progress": "export function startGlobalProgress() {}",
  };
  const output = await build({
    stdin: {
      contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExplorePageClient} from './components/explore/explore-page-client'; createRoot(document.getElementById('root')).render(React.createElement(ExplorePageClient,{initialCategories:[]}));",
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    bundle: true,
    write: false,
    platform: "browser",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{
      name: "explore-shell-mocks",
      setup(plugin: any) {
        plugin.onResolve({filter: /^(next\/|@\/components\/|@\/lib\/ui\/)/}, ({path: name}: {path: string}) => name in mocks ? {path:name, namespace:"mock"} : undefined);
        plugin.onLoad({filter: /.*/, namespace:"mock"}, ({path: name}: {path: string}) => ({contents:mocks[name],loader:"js",resolveDir:process.cwd()}));
      },
    }],
  });
  bundle = output.outputFiles[0].text;
});

async function mountExplore(page: Page) {
  const requests: Array<{radiusKm: number; searchMode: string}> = [];
  const location = {id:"test",label:"Shangpung, Meghalaya",latitude:25.48,longitude:92.36,source:"manual",accuracy:null};
  await page.route("https://explore.test/**", async (route) => {
    if (route.request().url().endsWith("/api/explore/search")) {
      const body = route.request().postDataJSON();
      requests.push(body);
      await route.fulfill({json:{
        answer:`Results for ${body.radiusKm} km`, category:null, chatId:"chat-test",
        clientRequestId:body.clientRequestId, location, locationContextKey:"test-context",
        radiusKm:body.radiusKm, results:[25,1,49].map(distanceKm => ({id:`place-${distanceKm}`,name:`Place ${distanceKm}`,distanceKm,distance:`${distanceKm} km`,sourceUrl:"https://example.com",attributions:[]})), searchQueries:[], searchMode:body.searchMode,
      }});
      return;
    }
    await route.fulfill({contentType:"text/html",body:'<div id="root"></div>'});
  });
  await page.goto("https://explore.test/");
  await page.evaluate((selectedLocation) => sessionStorage.setItem("explore.locationSession.v2",JSON.stringify({location:selectedLocation,query:"restaurant",radiusKm:10,categoryId:null,subcategoryId:null})),location);
  await page.addScriptTag({content:bundle});
  await expect(page.getByText("Results for 50 km", {exact:false})).toBeVisible();
  expect(requests).toHaveLength(1);
  return requests;
}


test("revisit ignores saved keyword and radius, and narrowing filters nearest first without a search", async ({page}) => {
  const requests = await mountExplore(page);
  const slider = page.getByRole("slider",{name:"Search radius",exact:true});
  await expect(slider).toHaveValue("50");
  await expect(page.getByPlaceholder("Search restaurants, shops, businesses, events, places...")).toHaveValue("");
  const names = page.locator("h3");
  expect(await names.allTextContents()).toEqual(["Place 1","Place 25","Place 49"]);
  await slider.press("ArrowLeft");
  await slider.press("ArrowLeft");
  await expect(page.getByText("Place 49",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Place 25",{exact:true})).toBeVisible();
  expect(requests.map(request => request.radiusKm)).toEqual([50]);
  await page.reload();
  await page.addScriptTag({content:bundle});
  await expect(slider).toHaveValue("50");
  await expect(page.getByPlaceholder("Search restaurants, shops, businesses, events, places...")).toHaveValue("");
  await expect(page.getByText("Place 49",{exact:true})).toBeVisible();
  expect(requests.map(request => request.radiusKm)).toEqual([50,50]);
});
