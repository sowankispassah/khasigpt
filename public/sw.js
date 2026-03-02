const CACHE_VERSION = "khasigpt-cache-v3";
const STATIC_ASSETS = [
  "/offline",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.png",
  "/opengraph-image.png",
];
const OFFLINE_FALLBACK = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) =>
        cache.addAll([...new Set([...STATIC_ASSETS, OFFLINE_FALLBACK])])
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_VERSION) {
              return caches.delete(key);
            }
            return false;
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
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) {
    return;
  }

  // Never cache API responses or Next.js internals (RSC/chunks). Let the browser handle caching.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_next/")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const preloadResponse = await event.preloadResponse;
          if (preloadResponse) {
            return preloadResponse;
          }
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (await cache.match(OFFLINE_FALLBACK)) || Response.error();
        }
      })()
    );
    return;
  }

  if (request.destination !== "image" && request.destination !== "font") {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cachedResponse = await cache.match(request);
      if (cachedResponse) {
        event.waitUntil(
          fetch(request)
            .then((networkResponse) => {
              if (networkResponse && networkResponse.ok) {
                return cache.put(request, networkResponse.clone());
              }
              return undefined;
            })
            .catch(() => undefined)
        );
        return cachedResponse;
      }
      try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.ok) {
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return cachedResponse || Response.error();
      }
    })()
  );
});
