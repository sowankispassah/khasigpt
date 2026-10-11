import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { build } = createRequire(require.resolve("tsx"))("esbuild");
let bundle: string;

// Use the real panel, useChat transport and SWR infinite cache. Isolate visual
// dependencies and the composer so no model calls or production data are needed.
test.beforeAll(async () => {
  const mocks: Record<string, string> = {
    "@/components/messages": `import React from 'react'; export function Messages({messages}) {return <div>{messages.map(m=><div key={m.id} data-testid={m.role} data-created-at={m.metadata?.createdAt}>{m.parts.filter(p=>p.type==='text').map(p=>p.text).join('')}</div>)}</div>;}`,
    "@/components/multimodal-input": `import React from 'react'; export function MultimodalInput({setMessages,sendMessage,onBeforeSubmit,status}) {return <button disabled={status!=='ready'} onClick={async()=>{const id=crypto.randomUUID();const parts=[{type:'text',text:'Which place?'}];setMessages(current=>[...current,{id,role:'user',parts}]);await onBeforeSubmit();await sendMessage({messageId:id,role:'user',parts});}}>Send</button>;}`,
    "@/components/sidebar-history": `export const getChatHistoryPaginationKeyForMode = () => (index,previous) => index===0 ? '/api/history?limit=20' : null;`,
    "@/components/toast": "export function toast() {}",
    "@/components/translation-edit-provider": "import React from 'react'; export const EditableTranslation = ({defaultText}) => <span>{defaultText}</span>;",
    "@/components/visibility-selector": "export const VisibilitySelector = () => null;",
    "@/lib/utils": "export const generateUUID = () => crypto.randomUUID(); export const fetchWithErrorHandlers = (...args) => fetch(...args);",
    "./floating-chat-popup": "export const FloatingChatPopup = ({children}) => children;",
  };
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {SWRConfig} from 'swr'; import useSWRInfinite from 'swr/infinite'; import {JobDetailsChatPanel} from './components/jobs/job-details-chat-panel'; function App(){const {data}=useSWRInfinite(index=>index===0?'/api/history?limit=20':null,url=>fetch(url).then(r=>r.json()));return <><div data-testid="history">{data?.flatMap(page=>page.chats).map(chat=>chat.title).join(',')}</div><JobDetailsChatPanel chatId="draft-explore" embedded restoreHistory={false} documentUploadsEnabled={false} initialChatLanguage="en" initialChatModel="default" onBeforeSubmit={async()=>{await fetch('/api/explore/context',{method:'POST'});}} /></>;} createRoot(document.getElementById('root')).render(<SWRConfig value={{provider:()=>new Map()}}><App/></SWRConfig>);`,
      resolveDir: process.cwd(), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", jsx: "automatic",
    define: { "process.env.NODE_ENV": '"test"' },
    plugins: [{name: "popup-visual-mocks", setup(plugin: any) {
      plugin.onResolve({filter: /.*/}, ({path: name}: {path: string}) => name in mocks ? {path: name, namespace: "mock"} : undefined);
      plugin.onLoad({filter: /.*/, namespace: "mock"}, ({path: name}: {path: string}) => ({contents: mocks[name], loader: "jsx", resolveDir: process.cwd()}));
    }}],
  });
  bundle = result.outputFiles[0].text;
});

test("first popup submission streams its reply, uses saved timestamps, and refreshes paginated history", async ({page}) => {
  let prepared = 0;
  let historyRequests = 0;
  let sent = false;
  await page.route("https://popup.test/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/history") {
      historyRequests++;
      await route.fulfill({json: {chats: sent ? [{id: "draft-explore", title: "Langbang Cafe"}] : [], hasMore: false}});
    } else if (url.pathname === "/api/explore/context") {
      prepared++;
      await route.fulfill({json: {ok: true}});
    } else if (url.pathname === "/api/chat") {
      expect(prepared).toBe(1);
      const body = route.request().postDataJSON();
      expect(body.id).toBe("draft-explore");
      sent = true;
      const chunks = [
        {type: "data-messageTimestamp", data: {id: body.message.id, createdAt: "2026-10-01T10:00:00.000Z"}, transient: true},
        {type: "start", messageId: "assistant-1", messageMetadata: {createdAt: "2026-10-01T10:00:01.000Z"}},
        {type: "start-step"},
        {type: "text-start", id: "text-1"},
        {type: "text-delta", id: "text-1", delta: "You are asking about "},
        {type: "text-delta", id: "text-1", delta: "Langbang Cafe."},
        {type: "text-end", id: "text-1"},
        {type: "finish-step"},
        {type: "finish", finishReason: "stop"},
      ];
      await route.fulfill({contentType: "text/event-stream", headers: {"x-vercel-ai-ui-message-stream": "v1"}, body: `${chunks.map(chunk=>`data: ${JSON.stringify(chunk)}\n\n`).join("")}data: [DONE]\n\n`});
    } else {
      await route.fulfill({contentType: "text/html", body: '<div id="root"></div>'});
    }
  });
  await page.goto("https://popup.test");
  await page.addScriptTag({content: bundle});
  await expect(page.getByRole("button", {name: "Send", exact: true})).toBeVisible();
  expect(prepared).toBe(0);
  await page.getByRole("button", {name: "Send", exact: true}).click();
  await expect(page.getByTestId("assistant")).toHaveText("You are asking about Langbang Cafe.");
  await expect(page.getByTestId("user")).toHaveAttribute("data-created-at", "2026-10-01T10:00:00.000Z");
  await expect(page.getByTestId("history")).toHaveText("Langbang Cafe");
  expect(historyRequests).toBeGreaterThan(1);
});
