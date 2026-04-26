const STATIC_CACHE = "ace-static-v1";
const DYNAMIC_CACHE = "ace-dynamic-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.png",
  "/logo.png",
  "/icons/pwa-192x192.png",
  "/icons/pwa-512x512.png"
];

async function getCachedAppShell() {
  const staticCached = await caches.match("/index.html");
  if (staticCached) return staticCached;

  const dynamicCache = await caches.open(DYNAMIC_CACHE);
  const dynamicCached = await dynamicCache.match("/index.html");
  if (dynamicCached) return dynamicCached;

  return null;
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== DYNAMIC_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put("/index.html", copy));
          }
          return response;
        })
        .catch(async () => {
          const cachedPage = await getCachedAppShell();
          if (cachedPage) return cachedPage;
          return (await caches.match("/offline.html")) || Response.error();
        })
    );
    return;
  }

  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(async (cached) => {
        if (cached) return cached;

        try {
          const response = await fetch(event.request);
          const isAsset =
            requestUrl.pathname.startsWith("/assets/") ||
            /\.(js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i.test(requestUrl.pathname);

          if (response.ok && isAsset) {
            const copy = response.clone();
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(event.request, copy);
          }

          return response;
        } catch {
          return cached || Response.error();
        }
      })
    );
  }
});

self.addEventListener("push", (event) => {
  const fallback = {
    title: "Ace Alert",
    body: "A new swarm update is available.",
    url: "/oracle"
  };

  let payload = fallback;

  if (event.data) {
    try {
      payload = { ...fallback, ...event.data.json() };
    } catch {
      payload = { ...fallback, body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/pwa-192x192.png",
      badge: "/icons/pwa-192x192.png",
      tag: payload.tag || "ace-alert",
      renotify: true,
      data: {
        url: payload.url || "/oracle"
      }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.startsWith(self.location.origin)) {
          client.navigate(target);
          return client.focus();
        }
      }

      return self.clients.openWindow(target);
    })
  );
});
