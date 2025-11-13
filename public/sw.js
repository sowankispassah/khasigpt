const CACHE_VERSION = "khasigpt-cache-v2";
const STATIC_ASSETS = [
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.png",
  "/opengraph-image.png",
];
const SHELL_ROUTES = ["/", "/chat", "/chat/recharge", "/chat/profile", "/chat/subscriptions"];
const OFFLINE_FALLBACK = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll([...new Set([...STATIC_ASSETS, ...SHELL_ROUTES, OFFLINE_FALLBACK])]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.map((key) => {
              if (key !== CACHE_VERSION) {
                return caches.delete(key);
              }
              return undefined;
            })
          )
        ),
      (async () => {
        if (self.registration.navigationPreload) {
          await self.registration.navigationPreload.enable();
        }
      })(),
      self.clients.claim(),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || request.url.includes("/api/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const preloadResponse = await event.preloadResponse;
        const cachedResponse =
          (await cache.match(request, { ignoreSearch: true })) ??
          (await cache.match("/"));
        try {
          const networkResponse = await fetch(request);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch (error) {
          return cachedResponse || preloadResponse || (await cache.match(OFFLINE_FALLBACK)) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        fetch(request)
          .then((networkResponse) => cache.put(request, networkResponse.clone()))
          .catch(() => {});
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(request);
        cache.put(request, networkResponse.clone());
        return networkResponse;
      } catch (error) {
        return cachedResponse;
      }
    })()
  );
});
