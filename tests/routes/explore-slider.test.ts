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
    "@/components/jobs/job-details-chat-panel": "export const JobDetailsChatPanel = () => null;",
    "next/dynamic": "import React from 'react'; export default function dynamic() { return function Chat(props) { const [busy,setBusy]=React.useState(false); const [error,setError]=React.useState(false); return React.createElement('div',{'data-testid':'popup-chat','data-chat-id':props.chatId},React.createElement('button',{disabled:busy,onClick:async()=>{setBusy(true);setError(false);try{await props.onBeforeSubmit('Question');}catch{setError(true);}finally{setBusy(false);}}},busy?'Sending...':'Send message'),error?React.createElement('div',{role:'alert'},'Unable to start the chat. Please try again.'):null); }; }",
    "@/lib/utils": "export const generateUUID = () => crypto.randomUUID(); export const cn = (...values) => values.filter(Boolean).join(' ');",
    "@/components/ui/button": "import React from 'react'; export const Button = ({variant,size,...props}) => React.createElement('button',props);",
    "next/navigation": "export const useRouter = () => ({push() {}});",
    "next/image": "import React from 'react'; export default function Image({unoptimized,...props}) { return React.createElement('img',props); }",
    "@/components/language-provider": "const translate = (key, fallback) => fallback; export const useTranslation = () => ({translate,activeLanguage:{code:'en'}});",
    "@/components/translation-edit-provider": "import React from 'react'; export const EditableTranslation = ({defaultText}) => React.createElement('span',null,defaultText); export const useEditableTranslation = (key,text) => ({text,editButton:null});",
    "@/lib/ui/global-progress": "export function startGlobalProgress() {}",
  };
  const output = await build({
    stdin: {
      contents: "import React from 'react'; import {createRoot} from 'react-dom/client'; import {ExplorePageClient} from './components/explore/explore-page-client'; createRoot(document.getElementById('root')).render(React.createElement(ExplorePageClient,{initialCategories:window.testCategories ?? []}));",
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
        plugin.onResolve({filter: /^(next\/|@\/components\/|@\/lib\/)/}, ({path: name}: {path: string}) => name in mocks ? {path:name, namespace:"mock"} : undefined);
        plugin.onLoad({filter: /.*/, namespace:"mock"}, ({path: name}: {path: string}) => ({contents:mocks[name],loader:"js",resolveDir:process.cwd()}));
      },
    }],
  });
  bundle = output.outputFiles[0].text;
});

async function mountExplore(page: Page, options: { noLocation?: boolean; locationFailure?: string; locationRequests?: any[]; categories?: unknown[]; partial?: boolean; imageSearch?: boolean; photoRequests?: string[]; progressive?: boolean; failDetails?: boolean; photos?: boolean; imageGate?: Promise<void>; failImage?: boolean; contextRequests?: any[]; contextGate?: Promise<void>; contextFailure?: () => boolean; detailsGate?: (query: string) => Promise<void> } = {}) {
  const requests: Array<{radiusKm: number; searchMode: string; detailMode: string}> = [];
  const location = {id:"test",label:"Shangpung, Meghalaya",latitude:25.48,longitude:92.36,source:"manual",accuracy:null};
  await page.route("https://images.explore.test/**", async (route) => {
    await options.imageGate;
    await route.fulfill(options.failImage ? {status:503,body:"Unavailable"} : {contentType:"image/png",body:Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6pQAAAAASUVORK5CYII=","base64")}).catch(() => {});
  });
  await page.route("https://explore.test/**", async (route) => {
    if (route.request().url().endsWith("/api/explore/location")) {
      const position = route.request().postDataJSON();
      options.locationRequests?.push(position);
      const code = options.locationFailure ?? (position.latitude > 26.2 ? "location_accuracy_insufficient" : null);
      await route.fulfill(code ? { status: code === "location_provider_unavailable" ? 503 : 422, json: { error: code, message: code === "location_provider_unavailable" ? "Location search is temporarily unavailable." : "Choose a location within Meghalaya." } } : { json: { location } });
      return;
    }
    if (route.request().url().endsWith("/api/explore/context")) {
      options.contextRequests?.push(route.request().postDataJSON());
      await options.contextGate;
      await route.fulfill(options.contextFailure?.() ? {status:503,json:{error:"context_unavailable"}} : {json:{ok:true}});
      return;
    }
    if (route.request().url().endsWith("/api/explore/photo")) {
      options.photoRequests?.push(route.request().postDataJSON().token);
      await route.fulfill({ json: { photo: null } }); return;
    }
    if (route.request().url().endsWith("/api/explore/search")) {
      const body = route.request().postDataJSON();
      requests.push(body);
      if (body.detailMode === "full") {
        await options.detailsGate?.(body.query);
        if (options.failDetails) {
          await route.fulfill({ status: 503, json: { error: "Unavailable" } });
          return;
        }
      }
      await route.fulfill({json:{
        answer:body.detailMode === "full" ? `Details ${body.query}` : `Results for ${body.radiusKm} km`, category:null, chatId:"chat-test",
        clientRequestId:body.clientRequestId, location, locationContextKey:"test-context",
        radiusKm:body.radiusKm, results:(body.detailMode === "full" ? [25,1,49,999] : options.imageSearch ? Array.from({ length: 20 }, (_, i) => i + 1) : [25,1,49]).map(distanceKm => ({id:`place-${distanceKm}`,name:`Place ${distanceKm}`,distanceKm,distance:`${distanceKm} km`,photoLookupToken: options.imageSearch ? `ticket-${distanceKm}` : undefined,imageUrl:options.photos && body.detailMode === "full" ? "https://images.explore.test/photo.png" : null,sourceUrl:"https://example.com",attributions:[]})), searchQueries:[], searchMode:body.searchMode,
        detailsPending: options.progressive && body.detailMode === "list",
        partial: options.partial,
      }}).catch(() => {});
      return;
    }
    await route.fulfill({contentType:"text/html",body:'<div id="root"></div>'});
  });
  await page.goto("https://explore.test/");
  if (!options.noLocation) await page.evaluate((selectedLocation) => sessionStorage.setItem("explore.locationSession.v2",JSON.stringify({location:selectedLocation,query:"restaurant",radiusKm:10,categoryId:null,subcategoryId:null})),location);
  await page.evaluate(categories => { (window as any).testCategories = categories; },options.categories ?? []);
  await page.addScriptTag({content:bundle});
  if (!options.noLocation) await expect(page.getByRole("heading", {name:"Place 1",exact:true})).toBeVisible();
  expect(requests).toHaveLength(options.noLocation ? 0 : options.progressive ? 2 : 1);
  return requests;
}


test("revisit ignores saved keyword and radius, and narrowing filters nearest first without a search", async ({page}) => {
  const requests = await mountExplore(page);
  const slider = page.getByRole("slider",{name:"Search radius",exact:true});
  await expect(slider).toHaveValue("10");
  await expect(page.getByPlaceholder("Search restaurants, shops, businesses, events, places...")).toHaveValue("");
  const names = page.locator("h3");
  expect(await names.allTextContents()).toEqual(["Place 1"]);
  await slider.press("End");
  await expect(page.getByText("Place 49",{exact:true})).toBeVisible();
  await slider.press("ArrowLeft");
  await slider.press("ArrowLeft");
  await expect(page.getByText("Place 49",{exact:true})).toHaveCount(0);
  await expect(page.getByText("Place 25",{exact:true})).toBeVisible();
  expect(requests.map(request => request.radiusKm)).toEqual([50]);
  await page.reload();
  await page.addScriptTag({content:bundle});
  await expect(slider).toHaveValue("10");
  await expect(page.getByPlaceholder("Search restaurants, shops, businesses, events, places...")).toHaveValue("");
  await expect(page.getByText("Place 49",{exact:true})).toHaveCount(0);
  expect(requests.map(request => request.radiusKm)).toEqual([50,50]);
});

test("the web list and slider are usable before details complete; details cannot change membership", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const requests = await mountExplore(page, { progressive: true, detailsGate: () => gate });
  await page.getByRole("slider", { name: "Search radius", exact: true }).press("End");
  expect(await page.locator("h3").allTextContents()).toEqual(["Place 1", "Place 25", "Place 49"]);
  await page.getByPlaceholder("Search restaurants, shops, businesses, events, places...").fill("rice");
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
  const slider = page.getByRole("slider", { name: "Search radius", exact: true });
  await slider.press("Home");
  await expect(page.getByText("Place 25", { exact: true })).toHaveCount(0);
  expect(requests.map((request) => request.detailMode)).toEqual(["list", "full"]);
  release();
  await slider.press("End");
  await expect(page.getByText(/Details Nearby places/)).toBeVisible();
  expect(await page.locator("h3").allTextContents()).toEqual(["Place 1", "Place 25", "Place 49"]);
});

test("failed optional details keep confirmed web results and do not show a search failure", async ({ page }) => {
  const requests = await mountExplore(page, { progressive: true, failDetails: true });
  await expect(page.getByText("Place 1", { exact: true })).toBeVisible();
  await expect(page.getByText("Unable to load Explore results right now. Please try again.", { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
  await expect(page.getByRole("status")).toHaveCount(0);
});

test("partial discovery displays available places with a recoverable warning", async ({ page }) => {
  await mountExplore(page, { partial: true });
  await expect(page.getByRole("status")).toHaveText("Some nearby results couldn't be loaded. Search a specific category or try again.");
  await expect(page.getByRole("heading", { name: "Place 1", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Search", exact: true })).toBeEnabled();
});

test("photo loading covers detail lookup and image download, then stops on load", async ({page}) => {
  let releaseDetails!: () => void; let releaseImage!: () => void;
  const details = new Promise<void>((resolve) => { releaseDetails = resolve; });
  const image = new Promise<void>((resolve) => { releaseImage = resolve; });
  await mountExplore(page,{progressive:true,photos:true,detailsGate:()=>details,imageGate:image});
  await page.getByRole("slider", { name: "Search radius", exact: true }).press("End");
  await expect(page.getByRole("status")).toHaveCount(3);
  await expect(page.getByRole("status").first()).toHaveText("Loading photo…");
  releaseDetails();
  await expect(page.locator("article img")).toHaveCount(3);
  await expect(page.getByRole("status")).toHaveCount(3);
  releaseImage();
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator('article [aria-busy="true"]')).toHaveCount(0);
});

test("photo indicators stop when no photo is found or the image download fails", async ({page}) => {
  await mountExplore(page,{progressive:true});
  await expect(page.getByRole("status")).toHaveCount(0);
  await mountExplore(page,{progressive:true,photos:true,failImage:true});
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator("article img")).toHaveCount(0);
});

test("clear search and submitting an empty input restore nearby results without category or web enrichment", async ({page}) => {
  const requests = await mountExplore(page);
  const input = page.getByPlaceholder("Search restaurants, shops, businesses, events, places...");
  const search = page.getByRole("button",{name:"Search",exact:true});
  await expect(search).toBeEnabled();
  await input.fill("cafe"); await search.click();
  await expect(page.getByText("Place 1",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Clear search",exact:true}).click();
  await expect(input).toHaveValue("");
  await expect(page.getByText("Place 1",{exact:true})).toBeVisible();
  await input.fill("restaurant"); await search.click();
  await expect(page.getByText("Place 1",{exact:true})).toBeVisible();
  await input.fill(""); await search.click();
  await expect(page.getByText("Place 1",{exact:true})).toBeVisible();
  expect(requests).toHaveLength(5);
  for (const index of [2,4]) expect(requests[index]).toMatchObject({query:"Nearby places, businesses, food, services, attractions and activities",categoryId:null,subcategoryId:null,searchMode:"places_only",radiusKm:50});
});

test("a new search remains available while the previous search hydrates", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await mountExplore(page, { progressive: true, detailsGate: (query) => query === "cafe" ? Promise.resolve() : gate });
  await page.getByRole("slider", { name: "Search radius", exact: true }).press("End");
  await page.getByPlaceholder("Search restaurants, shops, businesses, events, places...").fill("cafe");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Details cafe", { exact: false })).toBeVisible();
  release();
  await expect(page.getByText("Details cafe", { exact: false })).toBeVisible();
});


test("image mode looks up visible cards only, stops empty-photo loading and reuses slider results", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 700 });
  const photos: string[] = [];
  const requests = await mountExplore(page, { imageSearch: true, photoRequests: photos });
  await expect.poll(() => photos.length).toBeGreaterThan(0);
  await expect(page.getByText("Loading photo…")).toHaveCount(0);
  expect(photos.length).toBeLessThan(12); expect(requests).toHaveLength(1);
  await page.getByRole("heading", { name: "Place 10", exact: true }).scrollIntoViewIfNeeded();
  await expect.poll(() => photos.length).toBeGreaterThan(3);
  const slider = page.getByRole("slider", { name: "Search radius", exact: true });
  await slider.fill("5"); await slider.fill("50");
  await page.getByRole("heading", { name: "Place 10", exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText("Loading photo…")).toHaveCount(0);
  expect(new Set(photos).size).toBe(photos.length);
  expect(photos.length).toBeLessThanOrEqual(12);
  expect(requests).toHaveLength(1);
});


test("category presets show the display label but send only the internal keyword", async ({ page }) => {
  const requests = await mountExplore(page, { categories: [{ id: "food", name: "Eat Nearby", searchQuery: "restaurant, food, drinks", iconName: "Compass", description: "Legacy description", subcategories: [], suggestedPrompts: [], displayOrder: 0 }] });
  await page.getByPlaceholder("Search restaurants, shops, businesses, events, places...").fill("old search");
  await page.getByRole("button", { name: "Eat Nearby", exact: true }).click();
  await expect(page.getByPlaceholder("Search restaurants, shops, businesses, events, places...")).toHaveValue("");
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1]).toMatchObject({ query: "restaurant, food, drinks", categoryId: "food", searchMode: "places_only", radiusKm: 50 });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("button", { name: "Clear search", exact: true })).toBeVisible();
  expect(requests.at(-1)).toMatchObject({ query: "restaurant, food, drinks", categoryId: "food", searchMode: "places_only" });
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect.poll(() => requests.at(-1)).toMatchObject({ categoryId: null, query: "Nearby places, businesses, food, services, attractions and activities" });
  await expect(page.getByText("Legacy description")).toHaveCount(0);
});


test("Explore opens one general launcher and separate place popup chats without leaving the page", async ({ page }) => {
  const contexts: any[] = [];
  await mountExplore(page, { contextRequests: contexts });
  const launcher = page.getByRole("button", { name: "Ask KhasiGPT", exact: true });
  await expect(launcher).toHaveCount(1);
  await launcher.click();
  await expect(page.getByTestId("popup-chat")).toBeVisible();
  expect(contexts).toHaveLength(0);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => contexts.length).toBe(1);
  expect(contexts[0]).toMatchObject({create:true,selectedResult:null,radiusKm:10});
  expect(contexts[0].results.map((item: any) => item.name)).toEqual(["Place 1"]);
  const generalId = contexts[0].chatId;
  await page.getByRole("button", { name: "Close chat", exact: true }).click();
  await launcher.click();
  await expect(page.getByTestId("popup-chat")).toHaveAttribute("data-chat-id",generalId);
  expect(contexts).toHaveLength(1);
  await page.getByRole("button", { name: "Close chat", exact: true }).click();
  await page.getByRole("heading", { name: "Place 1", exact: true }).click();
  await page.getByRole("button", { name: "Ask KhasiGPT", exact: true }).first().click();
  await expect(page.getByTestId("popup-chat")).toBeVisible();
  expect(contexts).toHaveLength(1);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => contexts.length).toBe(2);
  expect(contexts[1].selectedResult.name).toBe("Place 1");
  expect(contexts[1].chatId).not.toBe(generalId);
  expect(page.url()).toBe("https://explore.test/");
});

test("Explore opening is write-free and first submission blocks repeat clicks and retries failed context", async ({ page }) => {
  let release!: () => void; let fail = true;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const contexts: any[] = [];
  await mountExplore(page,{contextRequests:contexts,contextGate:gate,contextFailure:()=>fail});
  await page.getByRole("button",{name:"Ask KhasiGPT",exact:true}).click();
  await expect(page.getByTestId("popup-chat")).toBeVisible();
  expect(contexts).toHaveLength(0);
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByRole("button",{name:"Sending...",exact:true})).toBeDisabled();
  release();
  await expect(page.getByRole("alert")).toContainText("Unable to start the chat.");
  fail = false;
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(() => contexts.length).toBe(2);
  expect(contexts[0].chatId).toBe(contexts[1].chatId);
  await page.getByRole("button",{name:"Send message",exact:true}).click();
  expect(contexts).toHaveLength(2);
});

async function mockCurrentLocation(page: Page, { recover = false, denied = false } = {}) {
  await page.addInitScript(({ recover, denied }) => {
    let reads = 0;
    (window as any).gpsOptions = [];
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: denied ? "denied" : "granted" }) } });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition(success: (value: unknown) => void, _failure: unknown, options: unknown) {
        (window as any).gpsOptions.push(options);
        const precise = recover && ++reads > 1;
        success({ coords: { latitude: precise ? 25.48 : 26.8, longitude: 92.36, accuracy: precise ? 30 : 200000 } });
      },
    } });
  }, { recover, denied });
}

test("current location recovers a coarse rejected estimate with one fresh reading", async ({ page }) => {
  await mockCurrentLocation(page, { recover: true });
  const locations: any[] = [];
  await mountExplore(page, { noLocation: true, locationRequests: locations });
  await page.getByRole("button", { name: "Use My Current Location", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Place 1", exact: true })).toBeVisible();
  expect(locations).toHaveLength(2);
  expect(await page.evaluate(() => (window as any).gpsOptions.every((options: any) => options.maximumAge === 0))).toBe(true);
});

test("a repeated coarse estimate is unconfirmed and never claims permission denial or an outside location", async ({ page }) => {
  await mockCurrentLocation(page);
  const locations: any[] = [];
  await mountExplore(page, { noLocation: true, locationRequests: locations });
  await page.getByRole("button", { name: "Use My Current Location", exact: true }).click();
  await expect(page.getByText("We couldn't confirm your current area.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Your device returned a very approximate location/)).toBeVisible();
  await expect(page.getByText("We couldn't access your current location.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Choose a location within Meghalaya.", { exact: true })).toHaveCount(0);
  expect(locations).toHaveLength(2);
  await expect(page.getByRole("button", { name: "Try Again", exact: true })).toBeEnabled();
});

test("permission denial never sends coordinates, and location-service failures do not retry GPS", async ({ page }) => {
  await mockCurrentLocation(page, { denied: true });
  const deniedRequests: any[] = [];
  await mountExplore(page, { noLocation: true, locationRequests: deniedRequests });
  await page.getByRole("button", { name: "Use My Current Location", exact: true }).click();
  await expect(page.getByText("We couldn't access your current location.", { exact: true }).first()).toBeVisible();
  expect(deniedRequests).toHaveLength(0);
  await mockCurrentLocation(page);
  const serviceRequests: any[] = [];
  await mountExplore(page, { noLocation: true, locationRequests: serviceRequests, locationFailure: "location_provider_unavailable" });
  await page.getByRole("button", { name: "Use My Current Location", exact: true }).click();
  await expect(page.getByText("Location search is temporarily unavailable.", { exact: true })).toBeVisible();
  expect(serviceRequests).toHaveLength(1);
});
