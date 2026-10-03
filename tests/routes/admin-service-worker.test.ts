import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { expect, test } from "@playwright/test";

async function workerHarness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const offline = { offline: true };
  const context = vm.createContext({
    URL,
    Response,
    self: {
      location: { origin: "https://khasigpt.com" },
      addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
    },
    caches: { open: async () => ({ match: async () => offline }) },
    fetch: async () => { throw new Error("Offline"); },
  });
  vm.runInContext(await readFile("public/sw.js", "utf8"), context);
  return {
    offline,
    navigate(path: string, preloadResponse: Promise<unknown>) {
      let response: Promise<unknown> | undefined;
      listeners.get("fetch")?.({
        request: { url: `https://khasigpt.com${path}`, method: "GET", mode: "navigate", destination: "document" },
        preloadResponse,
        respondWith: (pending: Promise<unknown>) => { response = pending; },
      });
      return response;
    },
  };
}

test("admin documents do not wait for service-worker navigation preload", async () => {
  const worker = await workerHarness();
  const held = new Promise(() => {});
  for (const path of ["/admin", "/admin/settings", "/admin/pricing?view=all"]) {
    expect(worker.navigate(path, held)).toBeUndefined();
  }
});

test("public document preloads still work, including paths that only resemble admin", async () => {
  const worker = await workerHarness();
  const networkResponse = { confirmed: true };
  for (const path of ["/about", "/administrator"]) {
    expect(await worker.navigate(path, Promise.resolve(networkResponse))).toBe(networkResponse);
  }
});

test("offline public navigation retains the existing fallback", async () => {
  const worker = await workerHarness();
  expect(await worker.navigate("/about", Promise.resolve(undefined))).toBe(worker.offline);
});
